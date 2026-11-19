import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { rollDice, rollD20, rollPool, poolSides, poolLabel, diceNeeded, d20Needed, signed, makeBackup, parseBackup, backupName } from './dice.js'

const INK="#17151a", PANEL="#211e24", PANEL2="#2a262d", PARCH="#e9e2d0", MUTED="#9c9284",
      GOLD="#c9a35c", RED="#a3413a", JADE="#7a9576", BLUE="#6f8fa8", HAIRLINE="#3a3540";
const displayFont={fontFamily:"'Shippori Mincho', serif"};
const bodyFont={fontFamily:"'Zen Kaku Gothic New','Inter',sans-serif"};
const monoFont={fontFamily:"'JetBrains Mono',monospace"};

/* ---- 2024 Monk math ---- */
const abilityMod = s => Math.floor((s-10)/2);
const profBonus = l => 2 + Math.floor((l-1)/4);
const dieSize = l => l<5?6:l<11?8:l<17?10:12;
const focusMax = l => l<2?0:l;
const moveBonus = l => l<2?0:l<6?10:l<10?15:l<14?20:l<18?25:30;
const wobMax = w => Math.max(1,w);
const hasFeat = (c,id) => (c.feats||[]).some(f => (typeof f==="string" ? f.toLowerCase()===id : f.id===id));

/* Curated feat catalog — simplified mechanical summaries for app math.
   Always double-check exact wording against your own 2024 PHB; this app
   approximates the numbers that actually change your moveset. */
const FEATS = {
  alert: { name:"Alert", summary:"Can't be Surprised while conscious. Initiative bonus equal to proficiency bonus.", chooseAbility:null },
  grappler: { name:"Grappler", summary:"Advantage on attack rolls against a creature you're Grappling.", chooseAbility:null },
  mobile: { name:"Mobile", summary:"Speed +10 ft. No Opportunity Attack from a creature you just attacked in melee. Difficult terrain doesn't slow your Dash.", chooseAbility:null },
  tough: { name:"Tough", summary:"Max HP +2 per character level, retroactive now and again every level after.", chooseAbility:null },
  resilient: { name:"Resilient", summary:"+1 to a chosen ability (max 20) and proficiency in its saving throw.", chooseAbility:["STR","DEX","CON","INT","WIS","CHA"] },
  crusher: { name:"Crusher", summary:"+1 to STR, CON, or DEX (max 20). Once/turn on a Bludgeoning hit (your Unarmed Strikes count): move the target 5ft or gain advantage on attacks against it until your next turn.", chooseAbility:["STR","CON","DEX"] },
  skillExpert: { name:"Skill Expert", summary:"+1 to a chosen ability (max 20), plus a skill proficiency/expertise (not tracked here).", chooseAbility:["STR","DEX","CON","INT","WIS","CHA"] },
  observant: { name:"Observant", summary:"+1 to INT or WIS (max 20). Passive Perception and Passive Investigation +5.", chooseAbility:["INT","WIS"] },
};

function derive(c){
  const mod = Object.fromEntries(Object.entries(c.scores).map(([k,v])=>[k,abilityMod(v)]));
  const prof = profBonus(c.level), die = dieSize(c.level);
  const hasMobile = hasFeat(c,"mobile"), hasAlert = hasFeat(c,"alert"), hasGrappler = hasFeat(c,"grappler"), hasCrusher = hasFeat(c,"crusher"), hasObservant = hasFeat(c,"observant");
  const atkBonus = prof+mod.DEX;
  return {
    mod, prof, die,
    focusMaxVal: focusMax(c.level),
    speed: 30+moveBonus(c.level)+(hasMobile?10:0),
    ac: 10+mod.DEX+mod.WIS,
    atkBonus,
    unarmedDmg: `1d${die}+${mod.DEX}`,
    stunDC: 8+prof+mod.WIS,
    grappleDC: 8+atkBonus,
    deflectFormula: `1d10+${mod.DEX}+${c.level}`,
    wobHeal: `1d${die}+${mod.WIS}`,
    wobUses: wobMax(mod.WIS),
    uncannyHeal: `1d${die}+${c.level}`,
    slowFall: 5*c.level,
    flurryStrikes: c.level>=10?3:2,
    deflectAnyType: c.level>=13,
    initiative: mod.DEX+(hasAlert?prof:0),
    passivePerception: 10+mod.WIS+prof+(hasObservant?5:0),
    hasMobile, hasAlert, hasGrappler, hasCrusher, hasObservant,
    weaponAtk: prof+mod.DEX+2,
    weaponDmg: `1d${die}+${mod.DEX}+2`,
  };
}

const LEVEL_FEATURES = {
  1:{auto:[{name:"Martial Arts",detail:"Bonus unarmed strike; roll Martial Arts die for unarmed damage; use DEX instead of STR for unarmed/monk-weapon attacks, damage, and Grapple/Shove DC."},{name:"Unarmored Defense",detail:"AC = 10 + DEX mod + WIS mod, unarmored and shieldless."}]},
  2:{auto:[{name:"Monk's Focus",detail:"Gain Focus Points to fuel Flurry of Blows, Patient Defense, Step of the Wind."},{name:"Unarmored Movement",detail:"Speed increases while unarmored; scales again at 6, 10, 14, 18."},{name:"Uncanny Metabolism",detail:"Once per long rest, on rolling Initiative, regain all Focus Points and heal 1 Martial Arts die + Monk level."}]},
  3:{auto:[{name:"Deflect Attacks",detail:"Reaction: reduce damage by 1d10 + DEX mod + Monk level. If reduced to 0, spend 1 FP to redirect to a nearby creature."},{name:"Subclass — Warrior of the Open Hand",detail:"Already chosen."},{name:"Open Hand Technique",detail:"On a Flurry hit: Addle (no opportunity attacks), Push (STR save or pushed 15ft), or Topple (DEX save or Prone)."}]},
  4:{auto:[{name:"Slow Fall",detail:"Reaction when falling: reduce fall damage by 5 x Monk level."}],choice:"asi"},
  5:{auto:[{name:"Extra Attack",detail:"Attack twice instead of once with the Attack action."},{name:"Stunning Strike",detail:"Once/turn on a hit, spend 1 FP: CON save or Stunned until your next turn. Success: speed halved, next attack against it has advantage."}]},
  6:{auto:[{name:"Empowered Strikes",detail:"Unarmed Strike damage can be Force instead of its normal type."},{name:"Subclass — Wholeness of Body",detail:"Bonus action: heal 1 Martial Arts die + WIS mod (min 1). Uses/long rest = WIS mod (min 1)."}]},
  7:{auto:[{name:"Evasion",detail:"DEX-save-for-half effects: none on success, half on failure (not while Incapacitated)."}]},
  8:{choice:"asi"},
  9:{auto:[{name:"Acrobatic Movement",detail:"Unarmored: move along vertical surfaces and across liquids without falling."}]},
  10:{auto:[{name:"Heightened Focus",detail:"Flurry: 1 FP now grants 3 strikes. Patient Defense: 1 FP also grants temp HP (2 Martial Arts die). Step of the Wind: 1 FP brings a willing Large-or-smaller creature with you."},{name:"Self-Restoration",detail:"End of each turn, remove Charmed/Frightened/Poisoned from yourself. No Exhaustion from missing food/drink."}]},
  11:{auto:[{name:"Subclass — Fleet Step",detail:"Any bonus action other than Step of the Wind lets you also use Step of the Wind right after."}]},
  12:{choice:"asi"},
  13:{auto:[{name:"Deflect Energy",detail:"Deflect Attacks now works vs any damage type, not just B/P/S."}]},
  14:{auto:[{name:"Disciplined Survivor",detail:"Proficiency in all saves. On a failed save, spend 1 FP to reroll (keep new result)."}]},
  15:{auto:[{name:"Perfect Focus",detail:"On Initiative without Uncanny Metabolism, regain Focus up to 4 if you have 3 or fewer."}]},
  16:{choice:"asi"},
  17:{auto:[{name:"Subclass — Quivering Palm",detail:"On an Unarmed Strike hit, spend 4 FP for vibrations lasting Monk-level days. Ending them (or forgoing an attack) forces CON save: 10d12 Force dmg on fail, half on success. One target at a time."}]},
  18:{auto:[{name:"Superior Defense",detail:"Start of turn, spend 3 FP: resistance to all damage except Force, 1 min or until Incapacitated."}]},
  19:{choice:"epicBoon"},
  20:{auto:[{name:"Body and Mind",detail:"DEX and WIS +4 each, max 25. Automatic."}]},
};

const DEFAULT_CHARACTER = { level:6, scores:{STR:12,DEX:16,CON:13,INT:8,WIS:17,CHA:10}, feats:[{id:"alert",name:"Alert"},{id:"grappler",name:"Grappler"}], hp:{current:41,max:41}, focusCurrent:6, wobCurrent:3, weapon:{form:"staff",dimLight:false,deflectUsed:false} };

/* ---- localStorage-backed save system (standalone version) ---- */
const IDX_KEY="katsebushiStandalone:saveIndex", ACTIVE_KEY="katsebushiStandalone:activeSaveId";
const saveDataKey = id => `katsebushiStandalone:save:${id}`;
const newId = () => `s${Date.now()}${Math.floor(Math.random()*1000)}`;
const timeAgo = ts => { const d=Math.max(0,Date.now()-ts), m=Math.floor(d/60000); if(m<1) return "just now"; if(m<60) return `${m}m ago`; const h=Math.floor(m/60); if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; };

function lsGet(key){ try{ const v=localStorage.getItem(key); return v==null?null:JSON.parse(v);}catch(e){return null;} }
function lsSet(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); return true; }catch(e){ console.error(e); return false; } }
function lsDel(key){ try{ localStorage.removeItem(key); return true; }catch(e){ return false; } }
const BACKUP_AT_KEY="katsebushiStandalone:lastBackupAt", INSTALL_HIDE_KEY="katsebushiStandalone:installHidden";
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);

/** Every save state, for a backup file. */
function allSaves(index){
  return index.map(s => ({ name:s.name, level:s.level, updatedAt:s.updatedAt, data: lsGet(saveDataKey(s.id)) })).filter(s => s.data);
}

/** Shares the backup file (iPhone: Save to Files, AirDrop, WhatsApp…) or downloads it. */
async function exportBackup(index){
  const text = makeBackup(allSaves(index));
  const name = backupName();
  const file = new File([text], name, { type:"application/json" });
  try{
    if(navigator.canShare?.({ files:[file] })){ await navigator.share({ files:[file], title:"Katsebushi backup" }); lsSet(BACKUP_AT_KEY, Date.now()); return "shared"; }
  }catch(e){ if(e?.name==="AbortError") return "cancelled"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  lsSet(BACKUP_AT_KEY, Date.now());
  return "downloaded";
}

function useSaveSystem(){
  const [index,setIndex]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [character,setCharacterState]=useState(DEFAULT_CHARACTER);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    let idx = lsGet(IDX_KEY) || [];
    let active = lsGet(ACTIVE_KEY);
    if(idx.length===0){
      const id=newId();
      idx=[{id,name:"Katsebushi — Main",level:DEFAULT_CHARACTER.level,updatedAt:Date.now()}];
      active=id;
      lsSet(IDX_KEY,idx); lsSet(ACTIVE_KEY,active); lsSet(saveDataKey(id),DEFAULT_CHARACTER);
    }
    if(!active || !idx.find(s=>s.id===active)) active = idx[0].id;
    const data = lsGet(saveDataKey(active)) || DEFAULT_CHARACTER;
    setIndex(idx); setActiveId(active); setCharacterState(data); setReady(true);
  },[]);

  const persistIndex = useCallback(idx => { setIndex(idx); lsSet(IDX_KEY, idx); }, []);

  const setCharacter = useCallback(next => {
    setCharacterState(next);
    if(!activeId) return;
    lsSet(saveDataKey(activeId), next);
    setIndex(idx => { const u = idx.map(s => s.id===activeId ? {...s, level: next.level, updatedAt: Date.now()} : s); lsSet(IDX_KEY,u); return u; });
  }, [activeId]);

  const switchTo = useCallback(id => {
    const data = lsGet(saveDataKey(id)) || DEFAULT_CHARACTER;
    setActiveId(id); setCharacterState(data); lsSet(ACTIVE_KEY, id);
  }, []);

  const createSave = useCallback((name, source) => {
    const id = newId();
    const data = source ? {...source} : {...DEFAULT_CHARACTER};
    const ok = lsSet(saveDataKey(id), data);
    if(!ok){ console.error("Save failed — storage unavailable."); return null; }
    const entry = {id, name, level:data.level, updatedAt:Date.now()};
    persistIndex([...index, entry]);
    return id;
  }, [index, persistIndex]);

  /** Adds every character from a backup as new save states (nothing is overwritten). */
  const importSaves = useCallback(list => {
    const added = list.map(({name,data}) => ({ id:newId()+Math.floor(Math.random()*1e6), name:`${name} (imported)`, level:data.level, updatedAt:Date.now(), data }));
    for(const a of added) if(!lsSet(saveDataKey(a.id), a.data)) return 0;
    persistIndex([...index, ...added.map(({data,...e})=>e)]);
    return added.length;
  }, [index, persistIndex]);

  const renameSave = useCallback((id,name) => persistIndex(index.map(s=>s.id===id?{...s,name}:s)), [index,persistIndex]);

  const deleteSave = useCallback(id => {
    const remaining = index.filter(s=>s.id!==id);
    lsDel(saveDataKey(id));
    if(remaining.length===0){
      const freshId=newId();
      const entry={id:freshId,name:"Katsebushi — Main",level:DEFAULT_CHARACTER.level,updatedAt:Date.now()};
      lsSet(saveDataKey(freshId), DEFAULT_CHARACTER);
      persistIndex([entry]); switchTo(freshId); return;
    }
    persistIndex(remaining);
    if(id===activeId) switchTo(remaining[0].id);
  }, [index, activeId, persistIndex, switchTo]);

  return {index, activeId, character, ready, setCharacter, switchTo, createSave, renameSave, deleteSave, importSaves};
}

/* ---- UI atoms ---- */
const btnGhost = {width:26,height:26,borderRadius:6,border:`1px solid ${HAIRLINE}`,background:PANEL2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"};

function Dots({current,max,color,onChange,size=14}){
  return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {Array.from({length:max}).map((_,i)=>{ const filled=i<current;
      return <button key={i} onClick={()=>onChange(i<current?i:i+1)} style={{width:size,height:size,borderRadius:"50%",border:`1.5px solid ${filled?color:HAIRLINE}`,background:filled?color:"transparent",boxShadow:filled?`0 0 6px ${color}66`:"none",cursor:"pointer",padding:0}}/>;
    })}
  </div>;
}

function StatRow({label,current,max,onDec,onInc,dotsColor,onDotChange}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${HAIRLINE}`}}>
    <span style={{...bodyFont,fontSize:12,letterSpacing:.5,color:MUTED,textTransform:"uppercase",minWidth:80}}>{label}</span>
    {dotsColor ? <Dots current={current} max={max} color={dotsColor} onChange={onDotChange}/> :
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onDec} style={btnGhost}>−</button>
        <span style={{...monoFont,fontSize:16,color:PARCH,minWidth:54,textAlign:"center"}}>{current}/{max}</span>
        <button onClick={onInc} style={btnGhost}>+</button>
      </div>}
  </div>;
}

function Seal({children,color=RED}){
  return <div style={{width:30,height:30,borderRadius:6,border:`1.5px solid ${color}`,color,display:"flex",alignItems:"center",justifyContent:"center",...displayFont,fontSize:13,flexShrink:0,background:`${color}14`}}>{children}</div>;
}

function ActionCard({seal,sealColor,title,mechanics,detail,tone=GOLD}){
  const [open,setOpen]=useState(false);
  return <div style={{background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:12,padding:14,marginBottom:10}}>
    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
      <Seal color={sealColor}>{seal}</Seal>
      <div style={{flex:1}}>
        <div style={{...displayFont,fontSize:16,color:PARCH,marginBottom:4}}>{title}</div>
        {mechanics && <div style={{...monoFont,fontSize:13,color:tone}}>{mechanics}</div>}
      </div>
    </div>
    {detail && <button onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:4,marginTop:8,background:"none",border:"none",cursor:"pointer",padding:0}}>
      <span style={{...bodyFont,fontSize:11,color:MUTED}}>ⓘ {open?"hide rule":"why / full rule"}</span>
    </button>}
    {open && <div style={{...bodyFont,fontSize:12.5,color:MUTED,marginTop:8,lineHeight:1.5,borderTop:`1px solid ${HAIRLINE}`,paddingTop:8,whiteSpace:"pre-line"}}>{detail}</div>}
  </div>;
}

function OptionButton({label,sub,onClick,tone}){
  return <button onClick={onClick} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:PANEL2,border:`1px solid ${tone?tone+"55":HAIRLINE}`,borderRadius:12,padding:"14px 16px",marginBottom:10,cursor:"pointer",textAlign:"left"}}>
    <div>
      <div style={{...bodyFont,fontSize:15,color:PARCH,fontWeight:500}}>{label}</div>
      {sub && <div style={{...bodyFont,fontSize:12,color:MUTED,marginTop:2}}>{sub}</div>}
    </div>
    <span style={{color:MUTED}}>›</span>
  </button>;
}

function Header({title,onBack}){
  return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
    {onBack && <button onClick={onBack} style={{...btnGhost,width:30,height:30}}>←</button>}
    <div style={{...displayFont,fontSize:19,color:PARCH}}>{title}</div>
  </div>;
}

const ABILITY_NAMES=["STR","DEX","CON","INT","WIS","CHA"];

function BackupBox({saves,onImport}){
  const [msg,setMsg]=useState(null);
  const fileRef=useRef(null);
  const last=lsGet(BACKUP_AT_KEY);
  const doExport=async()=>{ const r=await exportBackup(saves); if(r!=="cancelled") setMsg({ok:true,text:"✅ Backup saved. Keep the file somewhere safe (Files, iCloud, WhatsApp to yourself)."}); };
  const doImport=async e=>{
    const f=e.target.files?.[0]; e.target.value="";
    if(!f) return;
    try{ const list=parseBackup(await f.text()); const n=onImport(list); setMsg(n?{ok:true,text:`✅ Imported ${n} save state${n===1?"":"s"}. Tap Load on the one you want.`}:{ok:false,text:"❌ Couldn't store it on this device."}); }
    catch(err){ setMsg({ok:false,text:"❌ "+err.message}); }
  };
  const btn=(bg,color,border)=>({flex:1,background:bg,border:border||"none",borderRadius:10,padding:"12px 0",minHeight:44,color,...bodyFont,fontSize:13,fontWeight:600,cursor:"pointer"});
  return <div style={{background:PANEL,border:`1px solid ${GOLD}55`,borderRadius:12,padding:12,marginBottom:14}}>
    <div style={{...displayFont,fontSize:15,color:PARCH,marginBottom:4}}>Backup file</div>
    <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:10,lineHeight:1.45}}>Saves live only in this browser on this phone, and Safari can clear them if the site isn't opened for a while. A backup file brings them back on any device.<br/>Last backup: <b style={{color:last?PARCH:RED}}>{last?timeAgo(last):"never"}</b></div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={doExport} style={btn(GOLD,INK)}>⬆ Export all</button>
      <button onClick={()=>fileRef.current?.click()} style={btn(PANEL2,PARCH,`1px solid ${HAIRLINE}`)}>⬇ Import file</button>
    </div>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} style={{display:"none"}} aria-label="Backup file"/>
    {msg && <div style={{...bodyFont,fontSize:12,color:msg.ok?JADE:RED,marginTop:10,lineHeight:1.4}}>{msg.text}</div>}
  </div>;
}

function SavesScreen({saves,activeId,onBack,onSwitch,onCreate,onRename,onDelete,onImport}){
  const [testResult,setTestResult]=useState(null);
  const runTest=()=>{
    const probe=`probe-${Date.now()}`;
    const ok=lsSet("katsebushiStandalone:__probe",probe);
    const back=lsGet("katsebushiStandalone:__probe");
    setTestResult(ok && back===probe ? "✅ storage confirmed working" : "❌ storage unavailable in this browser");
  };
  const [renamingId,setRenamingId]=useState(null);
  const [renameValue,setRenameValue]=useState("");
  const [duplicatingId,setDuplicatingId]=useState(null);
  const [duplicateValue,setDuplicateValue]=useState("");
  const [deletingId,setDeletingId]=useState(null);
  const [creating,setCreating]=useState(false);
  const [newSaveValue,setNewSaveValue]=useState("New branch");

  const inputStyle={...bodyFont,width:"100%",background:PANEL,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"8px 10px",color:PARCH,fontSize:13,marginBottom:8};
  const smallBtn=(bg,color)=>({flex:1,background:bg,border:"none",borderRadius:8,padding:"7px 0",color,...bodyFont,fontSize:12,fontWeight:600,cursor:"pointer"});

  return <div>
    <Header title="Save States" onBack={onBack}/>
    <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:10}}>Snapshots of Katsebushi's full state. Load one to jump back, or branch off before a risky choice.</div>
    <BackupBox saves={saves} onImport={onImport}/>
    <button onClick={runTest} style={{...bodyFont,fontSize:11,color:BLUE,background:"none",border:`1px solid ${BLUE}55`,borderRadius:8,padding:"6px 10px",cursor:"pointer",marginBottom:8}}>Test Storage Now</button>
    {testResult && <div style={{...monoFont,fontSize:11,color:testResult.startsWith("✅")?JADE:RED,marginBottom:14}}>{testResult}</div>}
    {saves.slice().sort((a,b)=>b.updatedAt-a.updatedAt).map(s=>{
      const isActive=s.id===activeId;
      const isRenaming=renamingId===s.id, isDuplicating=duplicatingId===s.id, isDeleting=deletingId===s.id;
      return <div key={s.id} style={{background:PANEL2,border:`1px solid ${isActive?GOLD:HAIRLINE}`,borderRadius:12,padding:12,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {isActive && <span style={{color:GOLD}}>✓</span>}
          <span style={{...displayFont,fontSize:15,color:isActive?GOLD:PARCH}}>{s.name}</span>
        </div>
        <div style={{...bodyFont,fontSize:11,color:MUTED,marginTop:2}}>Level {s.level} · {timeAgo(s.updatedAt)}</div>

        {isRenaming ? <div style={{marginTop:10}}>
          <input autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)} style={inputStyle}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setRenamingId(null)} style={smallBtn(PANEL,MUTED)}>Cancel</button>
            <button onClick={()=>{ if(renameValue.trim()) onRename(s.id,renameValue.trim()); setRenamingId(null); }} style={smallBtn(GOLD,INK)}>Save Name</button>
          </div>
        </div> : isDuplicating ? <div style={{marginTop:10}}>
          <input autoFocus value={duplicateValue} onChange={e=>setDuplicateValue(e.target.value)} style={inputStyle}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setDuplicatingId(null)} style={smallBtn(PANEL,MUTED)}>Cancel</button>
            <button onClick={()=>{ if(duplicateValue.trim()) onCreate(duplicateValue.trim(), s.id); setDuplicatingId(null); }} style={smallBtn(GOLD,INK)}>Create Copy</button>
          </div>
        </div> : isDeleting ? <div style={{marginTop:10}}>
          <div style={{...bodyFont,fontSize:12,color:RED,marginBottom:8}}>Delete "{s.name}"? This can't be undone.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setDeletingId(null)} style={smallBtn(PANEL,MUTED)}>Cancel</button>
            <button onClick={()=>{ onDelete(s.id); setDeletingId(null); }} style={smallBtn(RED,PARCH)}>Delete</button>
          </div>
        </div> : <div style={{display:"flex",gap:8,marginTop:10}}>
          {!isActive && <button onClick={()=>onSwitch(s.id)} style={smallBtn(GOLD,INK)}>Load</button>}
          <button onClick={()=>{setDuplicatingId(s.id); setDuplicateValue(s.name+" copy");}} style={{...btnGhost,width:32,height:32}}>⧉</button>
          <button onClick={()=>{setRenamingId(s.id); setRenameValue(s.name);}} style={{...btnGhost,width:32,height:32}}>✎</button>
          <button onClick={()=>setDeletingId(s.id)} style={{...btnGhost,width:32,height:32,borderColor:RED+"55"}}>🗑</button>
        </div>}
      </div>;
    })}
    {creating ? <div style={{background:PANEL2,border:`1px dashed ${GOLD}66`,borderRadius:12,padding:14,marginTop:6}}>
      <input autoFocus value={newSaveValue} onChange={e=>setNewSaveValue(e.target.value)} style={inputStyle}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setCreating(false)} style={smallBtn(PANEL,MUTED)}>Cancel</button>
        <button onClick={()=>{ if(newSaveValue.trim()) onCreate(newSaveValue.trim()); setCreating(false); setNewSaveValue("New branch"); }} style={smallBtn(GOLD,INK)}>Create</button>
      </div>
    </div> : <button onClick={()=>setCreating(true)} style={{width:"100%",background:PANEL2,border:`1px dashed ${GOLD}66`,borderRadius:12,padding:14,color:GOLD,...displayFont,fontSize:14,cursor:"pointer",marginTop:6}}>+ New Save State (from current)</button>}
  </div>;
}

function LevelUpFlow({character,setCharacter,onBack}){
  const nextLevel=character.level+1, info=LEVEL_FEATURES[nextLevel];
  const [stage,setStage]=useState("preview");
  const [hitRoll,setHitRoll]=useState("");
  const [hpGain,setHpGain]=useState(null);
  const [asiMode,setAsiMode]=useState("plus2");
  const [plus2Target,setPlus2Target]=useState("WIS");
  const [plus1Targets,setPlus1Targets]=useState(["DEX","WIS"]);
  const [featPickId,setFeatPickId]=useState(null);
  const [featAbilityChoice,setFeatAbilityChoice]=useState(null);
  const [featName,setFeatName]=useState("");

  if(character.level>=20) return <div><Header title="Level Up" onBack={onBack}/><div style={{...bodyFont,color:MUTED,fontSize:13}}>Already level 20 — the top of the mountain.</div></div>;

  const d = derive(character);
  const conMod=abilityMod(character.scores.CON);
  const applyHitDie=()=>{ const r=parseInt(hitRoll,10); if(!r||r<1||r>8) return; setHpGain(r+conMod); setStage(info.choice?"choice":"confirm"); };
  const availableFeats = Object.keys(FEATS).filter(id => !hasFeat(character,id));

  const featPreview = (id, ability) => {
    switch(id){
      case "mobile": return `Speed ${d.speed} → ${d.speed+10} ft`;
      case "tough": { const add=2*nextLevel; return `Max HP ${character.hp.max} → ${character.hp.max+add} now, +2 every level after`; }
      case "resilient": return ability ? `${ability} ${character.scores[ability]} → ${Math.min(20,character.scores[ability]+1)}, plus proficiency in ${ability} saves` : "Pick an ability below";
      case "crusher": return ability ? `${ability} ${character.scores[ability]} → ${Math.min(20,character.scores[ability]+1)}` : "Pick an ability below";
      case "skillExpert": return ability ? `${ability} ${character.scores[ability]} → ${Math.min(20,character.scores[ability]+1)}` : "Pick an ability below";
      case "observant": return ability ? `${ability} ${character.scores[ability]} → ${Math.min(20,character.scores[ability]+1)}, Passive Perception ${d.passivePerception} → ${d.passivePerception+5}` : "Pick an ability below";
      default: return "";
    }
  };

  const finalize=()=>{
    let scores={...character.scores}, feats=[...character.feats];
    let extraHp=0;
    if(info.choice==="asi"){
      if(asiMode==="plus2") scores[plus2Target]=Math.min(20,scores[plus2Target]+2);
      else if(asiMode==="plus1x2") plus1Targets.forEach(a=>{scores[a]=Math.min(20,scores[a]+1);});
      else if(asiMode==="feat"){
        if(featPickId==="custom"){ if(featName.trim()) feats.push({id:"custom",name:featName.trim()}); }
        else if(featPickId){
          const def=FEATS[featPickId];
          const entry={id:featPickId,name:def.name};
          if(def.chooseAbility && featAbilityChoice){ entry.abilityChosen=featAbilityChoice; scores[featAbilityChoice]=Math.min(20,scores[featAbilityChoice]+1); }
          feats.push(entry);
          if(featPickId==="tough") extraHp += 2*nextLevel;
        }
      }
    } else if(info.choice==="epicBoon" && featName.trim()) feats.push({id:"epicBoon",name:`Epic Boon: ${featName.trim()}`});
    if(nextLevel===20){ scores.DEX=Math.min(25,scores.DEX+4); scores.WIS=Math.min(25,scores.WIS+4); }
    if(hasFeat(character,"tough")) extraHp += 2;
    const totalGain=(hpGain||0)+extraHp;
    const hp={max:character.hp.max+totalGain, current:character.hp.current+totalGain};
    setCharacter({...character, level:nextLevel, scores, feats, hp, focusCurrent:focusMax(nextLevel), wobCurrent:wobMax(abilityMod(scores.WIS))});
    setStage("done");
  };

  return <div>
    <Header title={`Level ${character.level} → ${nextLevel}`} onBack={onBack}/>
    {stage==="preview" && <div>
      <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:10}}>What you gain at level {nextLevel}:</div>
      {(info.auto||[]).map((f,i)=><ActionCard key={i} seal="+" sealColor={JADE} title={f.name} detail={f.detail}/>)}
      {info.choice==="asi" && <ActionCard seal="?" sealColor={GOLD} title="Ability Score Improvement" mechanics="Choose: +2 one ability, +1 two abilities, or a Feat" tone={GOLD}/>}
      {info.choice==="epicBoon" && <ActionCard seal="?" sealColor={GOLD} title="Epic Boon" mechanics="Choose an Epic Boon feat (book suggests Boon of Irresistible Offense)" tone={GOLD}/>}
      <div style={{...bodyFont,fontSize:12,color:MUTED,margin:"14px 0 6px"}}>Roll your Hit Die (1d8) physically, then enter the result:</div>
      <div style={{display:"flex",gap:8}}>
        <input value={hitRoll} onChange={e=>setHitRoll(e.target.value.replace(/[^0-9]/g,""))} placeholder="1-8" style={{...monoFont,width:70,background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"10px 12px",color:PARCH,fontSize:16}}/>
        <button onClick={applyHitDie} style={{flex:1,background:GOLD,border:"none",borderRadius:8,color:INK,...displayFont,fontSize:14,cursor:"pointer"}}>Confirm Roll (+{conMod} CON)</button>
      </div>
    </div>}
    {stage==="choice" && info.choice==="asi" && <div>
      <ActionCard seal="+" sealColor={JADE} title="Hit Points" mechanics={`+${hpGain} HP`}/>
      <div style={{...displayFont,fontSize:15,color:PARCH,margin:"10px 0"}}>Ability Score Improvement</div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["plus2","+2 one score"],["plus1x2","+1 to two"],["feat","Take a feat"]].map(([m,l])=>
          <button key={m} onClick={()=>setAsiMode(m)} style={{flex:1,padding:"8px 6px",borderRadius:8,border:`1px solid ${asiMode===m?GOLD:HAIRLINE}`,background:asiMode===m?`${GOLD}22`:PANEL2,color:asiMode===m?GOLD:MUTED,...bodyFont,fontSize:11.5,cursor:"pointer"}}>{l}</button>
        )}
      </div>
      {asiMode==="plus2" && <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {ABILITY_NAMES.map(a=><button key={a} onClick={()=>setPlus2Target(a)} disabled={character.scores[a]>=20} style={{padding:"10px 4px",borderRadius:8,border:`1px solid ${plus2Target===a?GOLD:HAIRLINE}`,background:plus2Target===a?`${GOLD}22`:PANEL2,opacity:character.scores[a]>=20?0.4:1,color:plus2Target===a?GOLD:PARCH,...monoFont,fontSize:12,cursor:"pointer"}}>{a} {character.scores[a]}→{Math.min(20,character.scores[a]+2)}</button>)}
      </div>}
      {asiMode==="plus1x2" && <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        {ABILITY_NAMES.map(a=>{ const picked=plus1Targets.includes(a);
          return <button key={a} disabled={character.scores[a]>=20} onClick={()=>{ if(picked) setPlus1Targets(plus1Targets.filter(x=>x!==a)); else if(plus1Targets.length<2) setPlus1Targets([...plus1Targets,a]); else setPlus1Targets([plus1Targets[1],a]); }} style={{padding:"10px 4px",borderRadius:8,border:`1px solid ${picked?GOLD:HAIRLINE}`,background:picked?`${GOLD}22`:PANEL2,opacity:character.scores[a]>=20?0.4:1,color:picked?GOLD:PARCH,...monoFont,fontSize:12,cursor:"pointer"}}>{a} {character.scores[a]}→{picked?character.scores[a]+1:character.scores[a]}</button>;
        })}
      </div>}
      {asiMode==="feat" && <div style={{marginBottom:12}}>
        {availableFeats.map(id=>{
          const def=FEATS[id], picked=featPickId===id;
          return <div key={id} style={{marginBottom:8}}>
            <button onClick={()=>{setFeatPickId(id); setFeatAbilityChoice(null);}} style={{width:"100%",textAlign:"left",padding:"10px 12px",borderRadius:10,border:`1px solid ${picked?GOLD:HAIRLINE}`,background:picked?`${GOLD}18`:PANEL2,cursor:"pointer"}}>
              <div style={{...displayFont,fontSize:14,color:picked?GOLD:PARCH}}>{def.name}</div>
              <div style={{...bodyFont,fontSize:11,color:MUTED,marginTop:2}}>{def.summary}</div>
            </button>
            {picked && def.chooseAbility && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6,marginLeft:8}}>
              {def.chooseAbility.map(a=><button key={a} onClick={()=>setFeatAbilityChoice(a)} disabled={character.scores[a]>=20} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${featAbilityChoice===a?GOLD:HAIRLINE}`,background:featAbilityChoice===a?`${GOLD}22`:PANEL2,opacity:character.scores[a]>=20?0.4:1,color:featAbilityChoice===a?GOLD:PARCH,...monoFont,fontSize:11,cursor:"pointer"}}>{a}</button>)}
            </div>}
            {picked && <div style={{...monoFont,fontSize:11.5,color:GOLD,marginTop:6,marginLeft:8}}>{featPreview(id, featAbilityChoice)}</div>}
          </div>;
        })}
        <div style={{marginBottom:8}}>
          <button onClick={()=>{setFeatPickId("custom"); setFeatAbilityChoice(null);}} style={{width:"100%",textAlign:"left",padding:"10px 12px",borderRadius:10,border:`1px solid ${featPickId==="custom"?GOLD:HAIRLINE}`,background:featPickId==="custom"?`${GOLD}18`:PANEL2,cursor:"pointer"}}>
            <div style={{...displayFont,fontSize:14,color:featPickId==="custom"?GOLD:PARCH}}>Other feat (not in this list)</div>
            <div style={{...bodyFont,fontSize:11,color:MUTED,marginTop:2}}>Name it — no automatic math applied, just tracked for reference.</div>
          </button>
          {featPickId==="custom" && <input value={featName} onChange={e=>setFeatName(e.target.value)} placeholder="Feat name (e.g. Tavern Brawler)" style={{...bodyFont,width:"100%",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:12,color:PARCH,fontSize:14,marginTop:6}}/>}
        </div>
      </div>}
      <button onClick={finalize} style={{width:"100%",background:GOLD,border:"none",borderRadius:12,padding:14,color:INK,...displayFont,fontSize:15,cursor:"pointer"}}>Confirm Level {nextLevel}</button>
    </div>}
    {stage==="choice" && info.choice==="epicBoon" && <div>
      <ActionCard seal="+" sealColor={JADE} title="Hit Points" mechanics={`+${hpGain} HP`}/>
      <div style={{...displayFont,fontSize:15,color:PARCH,margin:"10px 0"}}>Epic Boon</div>
      <input value={featName} onChange={e=>setFeatName(e.target.value)} placeholder="e.g. Boon of Irresistible Offense" style={{...bodyFont,width:"100%",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:12,color:PARCH,fontSize:14,marginBottom:4}}/>
      <div style={{...bodyFont,fontSize:11,color:MUTED,marginBottom:12}}>The book suggests Boon of Irresistible Offense for Monks.</div>
      <button onClick={finalize} style={{width:"100%",background:GOLD,border:"none",borderRadius:12,padding:14,color:INK,...displayFont,fontSize:15,cursor:"pointer"}}>Confirm Level {nextLevel}</button>
    </div>}
    {stage==="confirm" && !info.choice && <div>
      <ActionCard seal="+" sealColor={JADE} title="Hit Points" mechanics={`+${hpGain} HP`}/>
      <button onClick={finalize} style={{width:"100%",background:GOLD,border:"none",borderRadius:12,padding:14,color:INK,...displayFont,fontSize:15,cursor:"pointer"}}>Confirm Level {nextLevel}</button>
    </div>}
    {stage==="done" && <div style={{textAlign:"center",padding:"20px 0"}}>
      <div style={{fontSize:28,marginBottom:8}}>★</div>
      <div style={{...displayFont,fontSize:18,color:PARCH,marginBottom:6}}>Now Level {nextLevel}</div>
      <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:16}}>Stats recalculated. Focus Points and Wholeness uses refreshed.</div>
      <button onClick={onBack} style={{background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:10,padding:"10px 20px",color:PARCH,...bodyFont,fontSize:13,cursor:"pointer"}}>Back Home</button>
    </div>}
  </div>;
}

function Timeline({character,setCharacter,onBack}){
  const [override,setOverride]=useState("");
  const applyOverride=()=>{
    const n=parseInt(override,10);
    if(!n||n<1||n>20) return;
    setCharacter({...character, level:n, focusCurrent:Math.min(character.focusCurrent,focusMax(n)), wobCurrent:Math.min(character.wobCurrent, wobMax(abilityMod(character.scores.WIS)))});
    setOverride("");
  };
  return <div>
    <Header title="Level Timeline" onBack={onBack}/>
    <div style={{background:PANEL2,border:`1px solid ${GOLD}55`,borderRadius:12,padding:12,marginBottom:14}}>
      <div style={{...bodyFont,fontSize:11,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Correct The Level (testing / fix drift)</div>
      <div style={{...bodyFont,fontSize:11,color:MUTED,marginBottom:8}}>Currently level {character.level}. This only changes the level number — it won't undo ability scores, feats, or HP already gained from level-ups you actually took.</div>
      <div style={{display:"flex",gap:8}}>
        <input value={override} onChange={e=>setOverride(e.target.value.replace(/[^0-9]/g,""))} placeholder="e.g. 6" style={{...monoFont,width:70,background:PANEL,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"8px 10px",color:PARCH,fontSize:14}}/>
        <button onClick={applyOverride} style={{flex:1,background:GOLD,border:"none",borderRadius:8,color:INK,...bodyFont,fontSize:13,fontWeight:600,cursor:"pointer"}}>Set Level</button>
      </div>
    </div>
    <div style={{background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:12,padding:12,marginBottom:14}}>
      <div style={{...bodyFont,fontSize:11,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Feats Taken</div>
      {(character.feats||[]).map((f,i)=>{
        const label = typeof f==="string" ? f : f.name + (f.abilityChosen ? ` (${f.abilityChosen})` : "");
        return <div key={i} style={{...bodyFont,fontSize:13,color:PARCH}}>· {label}</div>;
      })}
    </div>
    {Object.entries(LEVEL_FEATURES).map(([lvl,info])=>{
      const owned=Number(lvl)<=character.level;
      return <div key={lvl} style={{opacity:owned?1:0.45,marginBottom:12,paddingBottom:10,borderBottom:`1px solid ${HAIRLINE}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{...displayFont,fontSize:14,color:owned?GOLD:MUTED}}>Lvl {lvl}</span>
          {info.choice && <span style={{...bodyFont,fontSize:10,color:BLUE,border:`1px solid ${BLUE}55`,borderRadius:6,padding:"1px 6px"}}>{info.choice==="asi"?"ASI / Feat":"Epic Boon"}</span>}
        </div>
        {(info.auto||[]).map((f,i)=><div key={i} style={{...bodyFont,fontSize:12.5,color:owned?PARCH:MUTED}}>· {f.name}</div>)}
      </div>;
    })}
  </div>;
}

/* ---- Dice ---- */
const THROW_KEY="katsebushiStandalone:throwOnScreen";
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const webglOk = () => { try{ const c=document.createElement("canvas"); return !!(c.getContext("webgl2")||c.getContext("webgl")); }catch(e){ return false; } };
let dice3dPromise=null;
/** The 3D dice (three.js + cannon-es) are a separate file, loaded the first time they're needed. */
function load3d(){
  if(window.KDice3D) return Promise.resolve(window.KDice3D);
  if(!dice3dPromise) dice3dPromise=new Promise((res,rej)=>{ const sc=document.createElement("script"); sc.src="dice3d.js"; sc.onload=()=>res(window.KDice3D); sc.onerror=()=>{ dice3dPromise=null; rej(new Error("dice3d")); }; document.head.appendChild(sc); });
  return dice3dPromise;
}

/**
 * One roll, thrown on screen when that's on (the faces come from the physics), else straight from the random
 * generator. req: {kind:"d20",label,bonus,mode,attack} | {kind:"expr",label,expr,crit} | {kind:"pool",pool,mod}.
 */
async function performRoll(req, throwOn){
  const sides = req.kind==="d20" ? d20Needed(req.mode) : req.kind==="expr" ? diceNeeded(req.expr,{crit:req.crit}) : poolSides(req.pool);
  let faces=null, D=null;
  if(throwOn && sides.length){
    try{ D=await load3d(); faces=await D.throwDice(sides); }catch(e){ D=null; faces=null; }
  }
  let entry;
  if(req.kind==="d20"){
    const r=rollD20(req.bonus,req.mode,Math.random,faces);
    const f=r.faces.length>1?`[${r.faces.join(", ")}] keep ${r.kept}`:`${r.kept}`;
    entry={label:req.label,total:r.total,text:`d20 ${f} ${signed(req.bonus)}`,flag:r.nat20?"NAT 20":r.nat1?"NAT 1":null,crit:!!req.attack&&r.nat20};
  } else if(req.kind==="expr"){
    const r=rollDice(req.expr,{crit:req.crit,faces});
    entry={label:req.crit?`${req.label} (crit)`:req.label,total:r.total,text:`${r.rolls.map(g=>`d${g.sides}[${g.faces.join(", ")}]`).join(" ")} ${r.bonus?signed(r.bonus):""}`.trim(),flag:req.crit?"CRIT":null};
  } else {
    const r=rollPool(req.pool,req.mod,{faces});
    entry={label:poolLabel(req.pool,req.mod),total:r.total,text:r.text,flag:null};
  }
  if(D) D.showResult({title:entry.label,total:String(entry.total),detail:`${entry.text}${entry.flag?` · ${entry.flag}`:""}`,tone:entry.flag==="NAT 1"?"#c0564d":"#d9b56a"});
  return entry;
}

/** The tray behind the 🎲 button, on every screen: pick dice, a bonus, throw. */
function DiceTray({pool,setPool,mod,setMod,throwOn,setThrowOn,last,onThrow,onClose,onSheetRolls}){
  const count=Object.values(pool).reduce((a,b)=>a+b,0);
  const add=(s,n)=>setPool(p=>{ const v=Math.max(0,Math.min(12,(p[s]||0)+n)); const q={...p,[s]:v}; if(!v) delete q[s]; return q; });
  const sq={minHeight:56,borderRadius:12,border:`1px solid ${HAIRLINE}`,background:PANEL2,color:PARCH,...displayFont,fontSize:17,cursor:"pointer",position:"relative"};
  const small={width:44,height:44,borderRadius:10,border:`1px solid ${HAIRLINE}`,background:PANEL2,color:PARCH,fontSize:18,cursor:"pointer"};
  return <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:20,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"flex-end"}}>
    <div role="dialog" aria-label="Throw dice" onClick={e=>e.stopPropagation()} style={{width:"100%",background:PANEL,borderTop:`1px solid ${GOLD}66`,borderRadius:"18px 18px 0 0",padding:"14px 14px calc(16px + env(safe-area-inset-bottom))",...bodyFont}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
        <div style={{...displayFont,fontSize:18,color:PARCH,flex:1}}>Throw dice</div>
        <button onClick={()=>{ setPool({}); setMod(0); }} disabled={!count && !mod} aria-label="Reset all dice and the bonus" style={{minHeight:44,padding:"0 14px",borderRadius:10,border:`1px solid ${count||mod?RED+"99":HAIRLINE}`,background:count||mod?`${RED}22`:PANEL2,color:count||mod?PARCH:MUTED,opacity:count||mod?1:.5,...bodyFont,fontSize:13,cursor:"pointer"}}>↺ Reset</button>
        <button onClick={onClose} aria-label="Close" style={{...small,background:"none",border:"none",color:MUTED}}>✕</button>
      </div>
      <div style={{...bodyFont,fontSize:11,color:MUTED,marginBottom:8}}>Tap a die to add one, − to take one off.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginBottom:10}}>
        {[4,6,8,10,12,20,100].map(n=><div key={n} style={{display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>add(n,1)} aria-label={`Add a d${n}`} style={{...sq,borderColor:pool[n]?GOLD:HAIRLINE,color:pool[n]?GOLD:PARCH}}>
            d{n}{pool[n]>0 && <span style={{position:"absolute",top:-6,right:-6,minWidth:22,height:22,borderRadius:11,background:GOLD,color:INK,...monoFont,fontSize:12,lineHeight:"22px"}}>{pool[n]}</span>}
          </button>
          <button onClick={()=>add(n,-1)} disabled={!pool[n]} aria-label={`Remove a d${n}`} style={{height:44,borderRadius:10,border:`1px solid ${pool[n]?HAIRLINE:"transparent"}`,background:pool[n]?PANEL2:"transparent",color:pool[n]?PARCH:"transparent",fontSize:20,cursor:pool[n]?"pointer":"default"}}>−</button>
        </div>)}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{...bodyFont,fontSize:12,color:MUTED,flex:1}}>Bonus</span>
        <button onClick={()=>setMod(m=>m-1)} aria-label="Bonus down" style={small}>−</button>
        <span style={{...monoFont,fontSize:16,color:PARCH,minWidth:42,textAlign:"center"}}>{signed(mod)}</span>
        <button onClick={()=>setMod(m=>m+1)} aria-label="Bonus up" style={small}>+</button>
      </div>
      <button onClick={()=>count && onThrow()} disabled={!count} style={{width:"100%",minHeight:52,background:count?GOLD:PANEL2,border:"none",borderRadius:12,color:count?INK:MUTED,...displayFont,fontSize:16,cursor:"pointer"}}>
        {count?`Throw ${poolLabel(pool,mod)}`:"Tap the dice to throw"}
      </button>
      {last && <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:10,...bodyFont,fontSize:12,color:MUTED}}><span>Last: {last.label}</span><span style={{...monoFont,color:PARCH}}>{last.total}</span></div>}
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={()=>setThrowOn(!throwOn)} aria-pressed={throwOn} style={{flex:1,minHeight:44,borderRadius:10,border:`1px solid ${throwOn?JADE:HAIRLINE}`,background:throwOn?`${JADE}22`:PANEL2,color:throwOn?JADE:MUTED,...bodyFont,fontSize:12,cursor:"pointer"}}>{throwOn?"✓ Throw on screen":"Throw on screen: off"}</button>
        <button onClick={onSheetRolls} style={{flex:1,minHeight:44,borderRadius:10,border:`1px solid ${HAIRLINE}`,background:PANEL2,color:PARCH,...bodyFont,fontSize:12,cursor:"pointer"}}>To hit, saves… ›</button>
      </div>
    </div>
  </div>;
}
const SAVE_PROF = c => { const set=new Set(["STR","DEX"]); for(const f of c.feats||[]) if(f && f.id==="resilient" && f.abilityChosen) set.add(f.abilityChosen); if(c.level>=14) ABILITY_NAMES.forEach(a=>set.add(a)); return set; };

function DiceScreen({character,d,log,mode,setMode,roll,throwOn,setThrowOn,onBack}){
  const test=(label,bonus,kind)=>roll({kind:"d20",label,bonus,mode,attack:kind==="attack"});
  const dmg=(label,expr,crit=false)=>roll({kind:"expr",label,expr,crit});
  const prof=SAVE_PROF(character);
  const lastCrit=log[0]?.crit;
  const chip={padding:"10px 6px",minHeight:44,borderRadius:10,border:`1px solid ${HAIRLINE}`,background:PANEL2,color:PARCH,...bodyFont,fontSize:13,cursor:"pointer",textAlign:"center"};
  const sub={...monoFont,display:"block",fontSize:11,color:GOLD,marginTop:2};
  const Section=({title,children})=><div style={{marginBottom:14}}><div style={{...bodyFont,fontSize:11,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{title}</div>{children}</div>;
  const grid=n=>({display:"grid",gridTemplateColumns:`repeat(${n},minmax(0,1fr))`,gap:8});
  const last=log[0];
  return <div>
    <Header title="Dice" onBack={onBack}/>
    <div aria-live="polite" style={{background:PANEL,border:`1px solid ${last?.flag==="NAT 1"?RED:last?.flag?GOLD:HAIRLINE}`,borderRadius:14,padding:"14px 12px",marginBottom:14,textAlign:"center",minHeight:96}}>
      {last ? <>
        <div style={{...bodyFont,fontSize:12,color:MUTED}}>{last.label}</div>
        <div style={{...displayFont,fontSize:44,color:last.flag==="NAT 1"?RED:last.flag?GOLD:PARCH,lineHeight:1.1}}>{last.total}</div>
        <div style={{...monoFont,fontSize:11,color:MUTED}}>{last.text}{last.flag?` · ${last.flag}`:""}</div>
      </> : <div style={{...bodyFont,fontSize:13,color:MUTED,paddingTop:24}}>Tap a roll. Bonuses come from the sheet.</div>}
    </div>
    <button onClick={()=>setThrowOn(!throwOn)} aria-pressed={throwOn} style={{width:"100%",minHeight:44,borderRadius:10,border:`1px solid ${throwOn?JADE:HAIRLINE}`,background:throwOn?`${JADE}22`:PANEL2,color:throwOn?JADE:MUTED,...bodyFont,fontSize:12,cursor:"pointer",marginBottom:8}}>{throwOn?"✓ Throw on screen (real dice, physics)":"Throw on screen: off (instant numbers)"}</button>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      {[["dis","Disadvantage"],["normal","Normal"],["adv","Advantage"]].map(([m,l])=>
        <button key={m} onClick={()=>setMode(m)} aria-pressed={mode===m} style={{flex:1,minHeight:44,borderRadius:10,border:`1px solid ${mode===m?GOLD:HAIRLINE}`,background:mode===m?`${GOLD}22`:PANEL2,color:mode===m?GOLD:MUTED,...bodyFont,fontSize:12,cursor:"pointer"}}>{l}</button>)}
    </div>
    <Section title="Attacks">
      <div style={grid(2)}>
        <button style={chip} onClick={()=>test("Unarmed Strike",d.atkBonus,"attack")}>Unarmed to hit<span style={sub}>d20 {signed(d.atkBonus)}</span></button>
        <button style={chip} onClick={()=>dmg("Unarmed damage",d.unarmedDmg,false)}>Unarmed damage<span style={sub}>{d.unarmedDmg}</span></button>
        <button style={chip} onClick={()=>test("Quarterstaff",d.weaponAtk,"attack")}>Staff to hit<span style={sub}>d20 {signed(d.weaponAtk)}</span></button>
        <button style={chip} onClick={()=>dmg("Staff damage",d.weaponDmg,false)}>Staff damage<span style={sub}>{d.weaponDmg}</span></button>
      </div>
      {lastCrit && <div style={{...grid(2),marginTop:8}}>
        <button style={{...chip,borderColor:GOLD,color:GOLD}} onClick={()=>dmg("Unarmed damage",d.unarmedDmg,true)}>Crit unarmed<span style={sub}>dice ×2</span></button>
        <button style={{...chip,borderColor:GOLD,color:GOLD}} onClick={()=>dmg("Staff damage",d.weaponDmg,true)}>Crit staff<span style={sub}>dice ×2</span></button>
      </div>}
    </Section>
    <Section title="Saving throws">
      <div style={grid(3)}>
        {ABILITY_NAMES.map(a=>{ const b=d.mod[a]+(prof.has(a)?d.prof:0);
          return <button key={a} style={chip} onClick={()=>test(`${a} save`,b,"save")}>{a}{prof.has(a)?" ●":""}<span style={sub}>{signed(b)}</span></button>; })}
      </div>
    </Section>
    <Section title="Other">
      <div style={grid(2)}>
        <button style={chip} onClick={()=>test("Initiative",d.initiative,"check")}>Initiative<span style={sub}>d20 {signed(d.initiative)}</span></button>
        <button style={chip} onClick={()=>dmg("Deflect Attacks",d.deflectFormula)}>Deflect<span style={sub}>{d.deflectFormula}</span></button>
        <button style={chip} onClick={()=>dmg("Wholeness of Body",d.wobHeal)}>Wholeness heal<span style={sub}>{d.wobHeal}</span></button>
        <button style={chip} onClick={()=>test("Flat d20",0,"check")}>Flat d20<span style={sub}>d20</span></button>
      </div>
    </Section>
    <Section title="Plain dice">
      <div style={grid(4)}>
        {[4,6,8,10,12,20,100].map(n=><button key={n} style={chip} onClick={()=>dmg(`d${n}`,`1d${n}`)}>d{n}</button>)}
        <button style={chip} onClick={()=>dmg("Hit Die",`1d8+${d.mod.CON}`)}>Hit Die<span style={sub}>1d8{signed(d.mod.CON)}</span></button>
      </div>
    </Section>
    {log.length>1 && <Section title="Earlier">
      {log.slice(1).map(e=><div key={e.id} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"6px 0",borderBottom:`1px solid ${HAIRLINE}`,...bodyFont,fontSize:12,color:MUTED}}>
        <span>{e.label}{e.flag?` · ${e.flag}`:""}</span><span style={{...monoFont,color:PARCH}}>{e.total}</span></div>)}
    </Section>}
  </div>;
}

function App(){
  const {index,activeId,character,ready,setCharacter,switchTo,createSave,renameSave,deleteSave,importSaves}=useSaveSystem();
  const [installHidden,setInstallHidden]=useState(()=>!!lsGet(INSTALL_HIDE_KEY));
  const [diceLog,setDiceLog]=useState([]);
  const [diceMode,setDiceMode]=useState("normal");
  const [trayOpen,setTrayOpen]=useState(false);
  const [pool,setPool]=useState({20:1});
  const [poolMod,setPoolMod]=useState(0);
  const [throwOn,setThrowOnState]=useState(()=>{ const v=lsGet(THROW_KEY); return v==null ? (!reducedMotion() && webglOk()) : v; });
  const setThrowOn=v=>{ setThrowOnState(v); lsSet(THROW_KEY,v); if(v) load3d().catch(()=>{}); };
  const rolling=useRef(false);
  /** Rolls (thrown on screen when that's on) and adds the result to the list. */
  const roll=async req=>{
    if(rolling.current) return;
    rolling.current=true;
    try{ const e=await performRoll(req, throwOn); setDiceLog(l=>[{...e,id:Date.now()+Math.random()},...l].slice(0,12)); }
    finally{ rolling.current=false; }
  };
  // Ask the browser to keep this site's storage (it may still say no; the backup file is the real safety net).
  useEffect(()=>{ navigator.storage?.persist?.().catch(()=>{}); },[]);
  const [screen,setScreen]=useState("home");
  const [hpEditOpen,setHpEditOpen]=useState(false);
  const [hpEditMax,setHpEditMax]=useState("");
  const [hpEditCurrent,setHpEditCurrent]=useState("");
  const [wobResult,setWobResult]=useState(null);
  const [uncannyResult,setUncannyResult]=useState(null);
  const [restDone,setRestDone]=useState(null);
  if(!ready) return <div style={{minHeight:"100vh",background:INK,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{...bodyFont,color:MUTED,fontSize:13}}>Loading…</span></div>;

  const d=derive(character), nav=s=>{ setScreen(s); setRestDone(null); window.scrollTo(0,0); };
  const lastBackup=lsGet(BACKUP_AT_KEY);
  const needsBackup=!lastBackup || Date.now()-lastBackup>14*86400e3;
  const showInstall=!installHidden && isIOS() && !isStandalone();
  const weapon = character.weapon || DEFAULT_CHARACTER.weapon;
  const activeSave=index.find(s=>s.id===activeId);
  const setHp = hp => setCharacter({...character, hp});
  const setFocus = n => setCharacter({...character, focusCurrent:Math.max(0,Math.min(d.focusMaxVal,n))});
  const setWob = n => setCharacter({...character, wobCurrent:Math.max(0,Math.min(d.wobUses,n))});
  const setWeapon = patch => setCharacter({...character, weapon:{...(character.weapon||DEFAULT_CHARACTER.weapon), ...patch}});

  const doWoB=()=>{ if(character.wobCurrent>0){ const roll=Math.floor(Math.random()*d.die)+1, healed=Math.max(1,roll+d.mod.WIS);
    setCharacter({...character, wobCurrent:character.wobCurrent-1, hp:{...character.hp, current:Math.min(character.hp.max,character.hp.current+healed)}});
    return {roll,healed}; } return null; };
  const doUncanny=()=>{ const roll=Math.floor(Math.random()*d.die)+1, healed=roll+character.level;
    setCharacter({...character, focusCurrent:d.focusMaxVal, hp:{...character.hp, current:Math.min(character.hp.max,character.hp.current+healed)}});
    return {roll,healed}; };
  const handleCreateSave=(name,sourceId)=>{ if(!name) return;
    let source=character;
    if(sourceId){ const s=lsGet(saveDataKey(sourceId)); if(s) source=s; }
    createSave(name, source);
  };

  return <div style={{minHeight:"100vh",background:INK,padding:"calc(18px + env(safe-area-inset-top)) 14px calc(90px + env(safe-area-inset-bottom))",...bodyFont}}>
    {!trayOpen && <button onClick={()=>{ setTrayOpen(true); if(throwOn) load3d().catch(()=>{}); }} aria-label="Dice" style={{position:"fixed",right:"calc(16px + env(safe-area-inset-right))",bottom:"calc(16px + env(safe-area-inset-bottom))",width:56,height:56,borderRadius:"50%",border:`1px solid ${GOLD}`,background:PANEL2,color:GOLD,fontSize:26,boxShadow:"0 6px 18px rgba(0,0,0,.5)",cursor:"pointer",zIndex:5}}>🎲</button>}
    <div style={{textAlign:"center",marginBottom:4}}>
      <div style={{...displayFont,fontSize:24,color:PARCH,letterSpacing:1}}>Katsebushi <span style={{color:MUTED,fontSize:18}}>無刀土</span></div>
      <div style={{...bodyFont,fontSize:12,color:MUTED,textTransform:"uppercase",letterSpacing:2}}>Shadow Warrior · Monk {character.level} · Open Hand</div>
    </div>
    <div style={{textAlign:"center",marginBottom:12}}>
      <button onClick={()=>nav("saves")} style={{...bodyFont,fontSize:11,color:GOLD,background:"none",border:"none",cursor:"pointer"}}>💾 {activeSave?activeSave.name:"Save State"}</button>
    </div>

    <div style={{background:PANEL,border:`1px solid ${HAIRLINE}`,borderRadius:14,padding:"10px 14px",marginBottom:16}}>
      <StatRow label="HP" current={character.hp.current} max={character.hp.max}
        onDec={()=>setHp({...character.hp, current:Math.max(0,character.hp.current-1)})}
        onInc={()=>setHp({...character.hp, current:Math.min(character.hp.max,character.hp.current+1)})}/>
      <StatRow label="Focus" current={character.focusCurrent} max={d.focusMaxVal} dotsColor={GOLD} onDotChange={setFocus}/>
      <StatRow label="Wholeness" current={character.wobCurrent} max={d.wobUses} dotsColor={JADE} onDotChange={setWob}/>
      <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,...monoFont,fontSize:11,color:MUTED}}>
        <span>AC {d.ac}</span><span>Speed {d.speed}ft</span><span>Atk +{d.atkBonus}</span><span>Prof +{d.prof}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",paddingTop:4,...monoFont,fontSize:11,color:MUTED}}>
        <span>Init +{d.initiative}</span><span>Perc {d.passivePerception}</span><span>Grapple DC {d.grappleDC}</span><span>Save DC {d.stunDC}</span>
      </div>
      {hpEditOpen ? <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${HAIRLINE}`}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{...bodyFont,fontSize:10,color:MUTED,marginBottom:3}}>MAX HP</div>
            <input type="number" inputMode="numeric" value={hpEditMax} onChange={e=>setHpEditMax(e.target.value)} style={{...monoFont,width:"100%",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"8px 10px",color:PARCH,fontSize:14}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{...bodyFont,fontSize:10,color:MUTED,marginBottom:3}}>CURRENT HP</div>
            <input type="number" inputMode="numeric" value={hpEditCurrent} onChange={e=>setHpEditCurrent(e.target.value)} style={{...monoFont,width:"100%",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"8px 10px",color:PARCH,fontSize:14}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setHpEditOpen(false)} style={{flex:1,background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:8,padding:"8px 0",color:MUTED,...bodyFont,fontSize:12,cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>{ const m=parseInt(hpEditMax,10), c=parseInt(hpEditCurrent,10);
            if(m>0) setHp({max:m, current:isNaN(c)?Math.min(character.hp.current,m):Math.max(0,Math.min(m,c))});
            setHpEditOpen(false); }} style={{flex:1,background:GOLD,border:"none",borderRadius:8,padding:"8px 0",color:INK,...bodyFont,fontSize:12,fontWeight:600,cursor:"pointer"}}>Save</button>
        </div>
      </div> : (
        <div style={{paddingTop:6,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={()=>{ setHpEditMax(String(character.hp.max)); setHpEditCurrent(String(character.hp.current)); setHpEditOpen(true); }} style={{...bodyFont,fontSize:11,color:MUTED,background:"none",border:"none",cursor:"pointer"}}>edit HP</button>
        </div>
      )}
    </div>

    {screen==="home" && <div>
      {showInstall && <div style={{background:PANEL,border:`1px solid ${BLUE}66`,borderRadius:12,padding:12,marginBottom:12,position:"relative"}}>
        <button onClick={()=>{ lsSet(INSTALL_HIDE_KEY,true); setInstallHidden(true); }} aria-label="Hide" style={{position:"absolute",top:4,right:4,width:44,height:44,background:"none",border:"none",color:MUTED,fontSize:16,cursor:"pointer"}}>✕</button>
        <div style={{...displayFont,fontSize:14,color:PARCH,marginBottom:4,paddingRight:36}}>Add to your Home Screen</div>
        <div style={{...bodyFont,fontSize:12,color:MUTED,lineHeight:1.45}}>Share ⎋ → "Add to Home Screen". It opens like an app, works with no signal, and keeps saves longer. The app starts empty: export a backup here first, then import it there.</div>
      </div>}
      {needsBackup && <button onClick={()=>nav("saves")} style={{width:"100%",minHeight:44,background:"none",border:`1px dashed ${GOLD}66`,borderRadius:10,padding:"8px 12px",color:GOLD,...bodyFont,fontSize:12,cursor:"pointer",marginBottom:12,textAlign:"left"}}>💾 {lastBackup?`Last backup ${timeAgo(lastBackup)}.`:"No backup yet."} Export one so a cleared browser can't lose Katsebushi ›</button>}
      <OptionButton label="Dice" tone={GOLD} sub={`d20 ${signed(d.atkBonus)} to hit, ${d.unarmedDmg} damage, saves, initiative`} onClick={()=>nav("dice")}/>
      <OptionButton label="My Turn" sub="What do I do this round?" onClick={()=>nav("turn-root")}/>
      <OptionButton label="I Got Hit" sub="Deflect Attacks (reaction)" onClick={()=>nav("deflect")}/>
      <OptionButton label="I'm Falling" sub="Slow Fall (reaction)" onClick={()=>nav("slowfall")}/>
      <OptionButton label="My Weapon" tone={JADE} sub={`Quarterstaff of the Acrobat — currently: ${weapon.form==="staff"?"Staff":weapon.form==="pole"?"10ft Pole":"Rod (stored)"}`} onClick={()=>nav("weapon")}/>
      <OptionButton label="Rolling Initiative" sub="Uncanny Metabolism" onClick={()=>nav("initiative")}/>
      <OptionButton label="Short / Long Rest" sub="Reset resources" onClick={()=>nav("rest")}/>
      <div style={{height:8}}/>
      <OptionButton label="Level Up" tone={GOLD} sub={`Currently level ${character.level} → ${character.level<20?character.level+1:"max"}`} onClick={()=>nav("levelup")}/>
      <OptionButton label="Level Timeline" sub="Everything gained 1–20, at a glance" onClick={()=>nav("timeline")}/>
      <OptionButton label="Save States" tone={JADE} sub={`${index.length} snapshot${index.length===1?"":"s"} · active: ${activeSave?activeSave.name:"—"}`} onClick={()=>nav("saves")}/>
    </div>}

    {screen==="saves" && <SavesScreen saves={index} activeId={activeId} onBack={()=>nav("home")} onSwitch={id=>{switchTo(id); nav("home");}} onCreate={handleCreateSave} onRename={renameSave} onDelete={deleteSave} onImport={importSaves}/>}
    {screen==="dice" && <DiceScreen character={character} d={d} log={diceLog} mode={diceMode} setMode={setDiceMode} roll={roll} throwOn={throwOn} setThrowOn={setThrowOn} onBack={()=>nav("home")}/>}
    {trayOpen && <DiceTray pool={pool} setPool={setPool} mod={poolMod} setMod={setPoolMod} throwOn={throwOn} setThrowOn={setThrowOn} last={diceLog[0]} onClose={()=>setTrayOpen(false)}
      onThrow={()=>{ setTrayOpen(false); roll({kind:"pool",pool,mod:poolMod}); }} onSheetRolls={()=>{ setTrayOpen(false); nav("dice"); }}/>}
    {screen==="levelup" && <LevelUpFlow character={character} setCharacter={setCharacter} onBack={()=>nav("home")}/>}
    {screen==="timeline" && <Timeline character={character} setCharacter={setCharacter} onBack={()=>nav("home")}/>}

    {screen==="turn-root" && <div>
      <Header title="My Turn" onBack={()=>nav("home")}/>
      <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:12}}>Action + Bonus Action + (once/turn) Stunning Strike on a hit.</div>
      <OptionButton label="Priority target — control it" sub="Grapple + Topple combo, or Push it away" onClick={()=>nav("turn-control")}/>
      <OptionButton label="Priority target — stun it" sub="Shut down its whole turn" onClick={()=>nav("turn-stun")}/>
      <OptionButton label="Flurry of Blows" sub="Spend 1 Focus Point for extra strikes" onClick={()=>nav("turn-flurry")}/>
      <OptionButton label="Normal fight — conserve resources" sub="Free 3-attack rotation, no Focus spent" onClick={()=>nav("turn-free")}/>
      <OptionButton label="I need to heal now" sub="Wholeness of Body (bonus action)" onClick={()=>nav("turn-heal")}/>
      <OptionButton label="I need to escape / reposition" sub="Patient Defense or Step of the Wind" onClick={()=>nav("turn-move")}/>
      {character.level>=17 && <OptionButton label="Set up Quivering Palm" sub="4 Focus Points, save-or-die follow-up" onClick={()=>nav("turn-palm")}/>}
      {character.level>=18 && <OptionButton label="Superior Defense" sub="3 Focus Points — resist all but Force, 1 min" onClick={()=>nav("turn-superior")}/>}
    </div>}

    {screen==="turn-free" && <div>
      <Header title="Free 3-Attack Rotation" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="1" title="Attack Action: 2 Unarmed Strikes" mechanics={`+${d.atkBonus} to hit, ${d.unarmedDmg} each`} detail="Extra Attack — no resources spent."/>
      <ActionCard seal="2" title="Bonus Action: 1 more Unarmed Strike" mechanics={`+${d.atkBonus} to hit, ${d.unarmedDmg}, free`} detail="Martial Arts' Bonus Unarmed Strike — free."/>
      <ActionCard seal="?" title="Any hit lands — spend Stun?" tone={GOLD} mechanics={`1 Focus Point → CON save DC ${d.stunDC}`} detail="Once per turn. Fail = Stunned until your next turn. Success = speed halved, next attack against it has advantage."/>
      {d.hasCrusher && <ActionCard seal="★" title="Crusher feat is active" tone={GOLD} mechanics="Once/turn on this Bludgeoning hit: move it 5ft or gain advantage vs it" detail="Your Unarmed Strikes count as Bludgeoning unless you're using Empowered Strikes' Force option."/>}
    </div>}

    {screen==="turn-flurry" && <div>
      <Header title="Flurry of Blows" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="B" title="Bonus Action: Flurry of Blows" tone={GOLD} mechanics={`1 Focus Point → ${d.flurryStrikes} Unarmed Strikes, +${d.atkBonus} to hit, ${d.unarmedDmg} each`} detail={d.flurryStrikes===3?"Heightened Focus (lvl 10+) upgraded this from 2 to 3 strikes.":"2 strikes for 1 Focus Point. Becomes 3 strikes at level 10 (Heightened Focus)."}/>
      <div style={{...bodyFont,fontSize:12,color:MUTED,margin:"12px 0 8px"}}>On any Flurry hit, choose one Open Hand Technique (free):</div>
      <ActionCard seal="T" title="Topple" tone={JADE} mechanics={`DEX save DC ${d.stunDC} or Prone`} detail="Best combined with Grapple (see 'Control it') — Grappled + Prone locks a target down hard."/>
      <ActionCard seal="A" title="Addle" tone={JADE} mechanics="No saving throw — automatic" detail="Target can't make Opportunity Attacks until the start of its next turn. Great for peeling off a dangerous melee target before you or an ally disengages."/>
      <ActionCard seal="P" title="Push" tone={JADE} mechanics={`STR save DC ${d.stunDC} or pushed 15 ft`} detail="Good for shoving something off a ledge or out of a doorway. Note: pushing a creature you're also Grappling will usually break your own grapple unless you have a feature that says otherwise."/>
      {d.hasGrappler && <ActionCard seal="★" title="Grappler feat is active" tone={GOLD} mechanics="Advantage on these attacks vs a target you're Grappling" detail="If you grappled the target this turn (see 'Control it'), every Flurry strike against it — including the Topple attempt — has advantage."/>}
    </div>}

    {screen==="turn-control" && <div>
      <Header title="Control It — Grapple + Topple" onBack={()=>nav("turn-root")}/>
      <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:10}}>The full lock-down combo: pin it in place, then knock it down.</div>
      <ActionCard seal="1" title="Attack Action, Strike 1 — Grapple" mechanics={`Hit +${d.atkBonus} → target STR/DEX save DC ${d.grappleDC} or Grappled`} detail="2024 rule: Grapple is now a choice on a hit, instead of dealing damage. It uses your attack's own ability (DEX, via Dexterous Attacks) for the DC — not your Wisdom-based monk DC."/>
      <ActionCard seal="2" title="Attack Action, Strike 2 — damage or 2nd Grapple/Shove" mechanics={`+${d.atkBonus} to hit, ${d.unarmedDmg}`} detail="From Extra Attack. Use it for normal damage, or Shove the same or a different target (same DC)."/>
      <ActionCard seal="3" title="Bonus Action: Flurry of Blows" tone={GOLD} mechanics={`1 Focus Point → ${d.flurryStrikes} more Unarmed Strikes`}/>
      <ActionCard seal="4" title="On a Flurry hit vs the grappled target — Topple" tone={JADE} mechanics={`DEX save DC ${d.stunDC} or Prone`} detail="Now the target is both Grappled (can't move away) and Prone (melee attacks against it have advantage, including yours). This is the full combo in one turn."/>
      {d.hasGrappler && <ActionCard seal="★" title="Grappler feat is active" tone={GOLD} mechanics="Advantage on all attacks vs this grappled target" detail="Every strike above against the target you're grappling — including the Topple attempt — already has advantage from the feat."/>}
      <div style={{...bodyFont,fontSize:12,color:MUTED,margin:"14px 0 8px"}}>Prefer a different Open Hand effect instead of Topple?</div>
      <ActionCard seal="P" title="Push instead" mechanics={`STR save DC ${d.stunDC} or pushed 15 ft`} detail="Note: pushing a target you're Grappling typically breaks the grapple (it moves out of your reach) — use Push OR Grapple+Topple, not usually both on the same target."/>
      <ActionCard seal="A" title="Addle instead" mechanics="No save — automatic" detail="No Opportunity Attacks from the target until the start of its next turn. Useful if you need to walk away from it safely instead of holding it down."/>
    </div>}

    {screen==="turn-stun" && <div>
      <Header title="Stun Lock" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="1" title="Attack Action: 2 Unarmed Strikes" mechanics={`+${d.atkBonus} to hit, ${d.unarmedDmg} each`}/>
      <ActionCard seal="!" title="First hit lands — Stunning Strike" tone={GOLD} mechanics={`1 Focus Point → CON save DC ${d.stunDC}`} detail="Fail = Stunned until your next turn. Highest-impact single Focus Point spend."/>
      <ActionCard seal="2" title="Bonus Action: 1 more Unarmed Strike" mechanics={`+${d.atkBonus} to hit, ${d.unarmedDmg}, free`}/>
    </div>}
    {screen==="turn-heal" && <div>
      <Header title="Wholeness of Body" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="♥" title={`Uses left: ${character.wobCurrent} / ${d.wobUses}`} tone={JADE} mechanics={`Bonus Action → heal ${d.wobHeal}`}/>
      <button onClick={()=>{ const r=doWoB(); setWobResult(r ? `Rolled ${r.roll} → healed ${r.healed} HP` : "No Wholeness of Body uses left."); }} style={{width:"100%",background:JADE,border:"none",borderRadius:12,padding:14,color:INK,...displayFont,fontSize:15,cursor:"pointer"}}>Use Wholeness of Body</button>
      {wobResult && <div style={{...monoFont,fontSize:12,color:JADE,marginTop:10,textAlign:"center"}}>{wobResult}</div>}
    </div>}
    {screen==="turn-move" && <div>
      <Header title="Reposition / Escape" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="○" title="Free version (no Focus Point)" tone={MUTED} mechanics="Bonus Action: Disengage OR Dash"/>
      <ActionCard seal="1" title="Upgraded (1 Focus Point)" tone={GOLD} mechanics={character.level>=10?"Disengage+Dodge (+temp HP), or Disengage+Dash x2 jump":"Disengage+Dodge, or Disengage+Dash, jump x2"}/>
      {d.hasMobile && <ActionCard seal="★" title="Mobile feat is active" tone={GOLD} mechanics={`Speed already includes +10ft (${d.speed}ft total)`} detail="You also don't provoke an Opportunity Attack from a creature you just attacked in melee this turn, and difficult terrain doesn't slow your Dash."/>}
    </div>}
    {screen==="turn-palm" && <div><Header title="Quivering Palm" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="4" title="On an Unarmed Strike hit" tone={GOLD} mechanics="Spend 4 Focus Points to set vibrations" detail={`Lasts ${character.level} days. Ending them (or forgoing an attack) forces CON save: 10d12 Force damage on fail, half on success.`}/>
    </div>}
    {screen==="turn-superior" && <div><Header title="Superior Defense" onBack={()=>nav("turn-root")}/>
      <ActionCard seal="3" title="Start of your turn" tone={GOLD} mechanics="Spend 3 Focus Points" detail="Resistance to all damage except Force, 1 minute or until Incapacitated."/>
    </div>}
    {screen==="deflect" && <div><Header title="Deflect Attacks" onBack={()=>nav("home")}/>
      <ActionCard seal="R" title="Reaction — always free" tone={JADE} mechanics={`Reduce damage by ${d.deflectFormula}`} detail={d.deflectAnyType?"Deflect Energy (lvl 13+): any damage type now.":"Only Bludgeoning/Piercing/Slashing."}/>
      <ActionCard seal="1" title="If reduced to 0 — redirect" tone={GOLD} mechanics="1 Focus Point → nearby creature takes the same damage"/>
    </div>}
    {screen==="slowfall" && <div><Header title="Slow Fall" onBack={()=>nav("home")}/>
      <ActionCard seal="R" title="Reaction — always free" tone={JADE} mechanics={`Reduce fall damage by ${d.slowFall}`}/>
    </div>}
    {screen==="weapon" && <div>
      <Header title="Quarterstaff of the Acrobat" onBack={()=>nav("home")}/>
      <div style={{...bodyFont,fontSize:12,color:MUTED,marginBottom:12}}>Very Rare, requires attunement. +2 to attack and damage. As a Monk weapon, use your Martial Arts die and DEX instead of the weapon's own 1d6/STR.</div>

      <div style={{...displayFont,fontSize:14,color:PARCH,marginBottom:8}}>Current Form (Bonus Action to change)</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["staff","Quarterstaff"],["pole","10ft Pole"],["rod","6in Rod"]].map(([f,l])=>
          <button key={f} onClick={()=>setWeapon({form:f})} style={{flex:1,padding:"10px 4px",borderRadius:8,border:`1px solid ${weapon.form===f?GOLD:HAIRLINE}`,background:weapon.form===f?`${GOLD}22`:PANEL2,color:weapon.form===f?GOLD:PARCH,...bodyFont,fontSize:12,cursor:"pointer"}}>{l}</button>
        )}
      </div>

      {(weapon.form==="staff"||weapon.form==="pole") && (
        <ActionCard seal="1" title="Melee Attack" mechanics={`+${d.weaponAtk} to hit, ${d.weaponDmg} Bludgeoning`} detail="Uses your Martial Arts die (not the weapon's base 1d6) plus DEX and the weapon's +2. Note: this is a weapon attack, not an Unarmed Strike — Flurry of Blows still requires Unarmed Strikes and can't be made with this weapon."/>
      )}

      {weapon.form==="pole" && (
        <ActionCard seal="↔" title="Extended Reach" tone={GOLD} mechanics="~10 ft reach while in Pole form" detail="The item says it elongates as far as the surrounding space allows — treating that as roughly 10ft of melee reach in this form is this app's practical interpretation, not exact printed reach-property wording. Good for opportunity attacks at range, prodding switches/traps, or fishing something out of a pit."/>
      )}

      {weapon.form==="staff" && (
        <ActionCard seal="2" title="Ranged Attack (Thrown)" mechanics={`+${d.weaponAtk} to hit, ${d.weaponDmg} Bludgeoning, range 30/120 ft`} detail="Throw it, it flies back to your hand right after the attack. Only works in Quarterstaff form."/>
      )}

      {(weapon.form==="staff"||weapon.form==="pole") && (
        <ActionCard seal="★" title="Acrobatic Assist" tone={JADE} mechanics="Advantage on DEX (Acrobatics) checks" detail="Passive, while holding the weapon in Quarterstaff or Pole form."/>
      )}

      {weapon.form==="staff" && (
        <ActionCard seal="R" title="Attack Deflection" tone={weapon.deflectUsed?MUTED:GOLD} mechanics={weapon.deflectUsed?"Already used — resets on a Short or Long Rest":"Reaction: +5 AC vs the triggering attack"} detail="Quarterstaff form only. Twirl it to add +5 AC against one incoming attack, possibly turning a hit into a miss.">
        </ActionCard>
      )}
      {weapon.form==="staff" && !weapon.deflectUsed && (
        <button onClick={()=>setWeapon({deflectUsed:true})} style={{width:"100%",background:GOLD,border:"none",borderRadius:12,padding:12,color:INK,...displayFont,fontSize:14,cursor:"pointer",marginBottom:10}}>Use Attack Deflection</button>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:12,padding:14,marginTop:4}}>
        <div>
          <div style={{...displayFont,fontSize:14,color:PARCH}}>Dim Light (10ft)</div>
          <div style={{...bodyFont,fontSize:11,color:MUTED,marginTop:2}}>Bonus Action to toggle, or free when you roll Initiative</div>
        </div>
        <button onClick={()=>setWeapon({dimLight:!weapon.dimLight})} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${weapon.dimLight?GOLD:HAIRLINE}`,background:weapon.dimLight?`${GOLD}22`:PANEL2,color:weapon.dimLight?GOLD:MUTED,...bodyFont,fontSize:12,cursor:"pointer"}}>{weapon.dimLight?"On":"Off"}</button>
      </div>
    </div>}
    {screen==="initiative" && <div><Header title="Rolling Initiative" onBack={()=>nav("home")}/>
      <ActionCard seal="1/day" title="Uncanny Metabolism" tone={GOLD} mechanics={`Refill all Focus Points + heal ${d.uncannyHeal}`}/>
      <button onClick={()=>{ const r=doUncanny(); setUncannyResult(`Focus refilled. Rolled ${r.roll} → healed ${r.healed} HP.`); }} style={{width:"100%",background:GOLD,border:"none",borderRadius:12,padding:14,color:INK,...displayFont,fontSize:15,cursor:"pointer"}}>Trigger Uncanny Metabolism</button>
      {uncannyResult && <div style={{...monoFont,fontSize:12,color:GOLD,marginTop:10,textAlign:"center"}}>{uncannyResult}</div>}
    </div>}
    {screen==="rest" && <div><Header title="Rest" onBack={()=>nav("home")}/>
      <ActionCard seal="S" title="Short or Long Rest" tone={JADE} mechanics="All spent Focus Points return · Attack Deflection resets"/>
      <ActionCard seal="L" title="Long Rest only" tone={JADE} mechanics="Wholeness of Body uses reset · HP fully restored"/>
      <button onClick={()=>{ setCharacter({...character, focusCurrent:d.focusMaxVal, weapon:{...weapon, deflectUsed:false}}); setRestDone("Focus refilled, Attack Deflection ready."); }} style={{width:"100%",background:PANEL2,border:`1px solid ${HAIRLINE}`,borderRadius:12,padding:12,color:PARCH,...bodyFont,fontSize:14,cursor:"pointer",marginBottom:10}}>Refill Focus Points (Short/Long Rest)</button>
      <button onClick={()=>{ setCharacter({...character, focusCurrent:d.focusMaxVal, wobCurrent:d.wobUses, hp:{...character.hp, current:character.hp.max}, weapon:{...weapon, deflectUsed:false}}); setRestDone("Long rest: HP, Focus, Wholeness and Deflection all reset."); }} style={{width:"100%",background:RED,border:"none",borderRadius:12,padding:12,color:PARCH,...bodyFont,fontSize:14,cursor:"pointer"}}>Take a Long Rest (full reset)</button>
      {restDone && <div style={{...monoFont,fontSize:12,color:JADE,marginTop:10,textAlign:"center"}}>{restDone}</div>}
    </div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
