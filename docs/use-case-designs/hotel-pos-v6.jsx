import { useState, useEffect, useRef } from "react";

const C = {
  purple: "#6B2D8B", purpleLight: "#8B4DAB", purplePale: "#F3ECF8",
  white: "#FFFFFF", bg: "#F8F7FA",
  border: "#E8E5ED", borderLight: "#F0EDF4",
  text: "#1A1A1A", textMid: "#4A4555", textMuted: "#8A849A", textDim: "#B5B0C0",
  green: "#10B981", greenPale: "#ECFDF5",
  red: "#EF4444", redPale: "#FEF2F2",
  orange: "#F59E0B", orangePale: "#FFFBEB",
  blue: "#3B82F6", bluePale: "#EFF6FF",
  yellow: "#EAB308", yellowPale: "#FEFCE8",
};

const ROLES = {
  admin: { label: "Admin", icon: "🛡️", color: C.purple, tabs: ["tables","kitchen","bar","cashier","users"] },
  cashier: { label: "Cashier", icon: "💰", color: C.green, tabs: ["cashier"] },
  waiter: { label: "Waiter", icon: "🍽️", color: C.blue, tabs: ["tables"] },
  kitchen: { label: "Kitchen", icon: "🍳", color: C.orange, tabs: ["kitchen"] },
  bar: { label: "Bar", icon: "🍺", color: C.blue, tabs: ["bar"] },
};

const INIT_USERS = [
  { id:1, username:"admin", name:"System Admin", role:"admin", password:"admin123", mustChange:false, active:true },
  { id:2, username:"mary.a", name:"Mary Akinyi", role:"waiter", password:"1234", mustChange:false, active:true },
  { id:3, username:"john.o", name:"John Otieno", role:"waiter", password:"1234", mustChange:false, active:true },
  { id:4, username:"grace.w", name:"Grace Wanjiku", role:"waiter", password:"1234", mustChange:false, active:true },
  { id:5, username:"samuel.k", name:"Samuel Kamau", role:"cashier", password:"cash123", mustChange:false, active:true },
  { id:6, username:"chef.james", name:"James Omondi", role:"kitchen", password:"kitchen1", mustChange:false, active:true },
  { id:7, username:"barman.pete", name:"Peter Njoroge", role:"bar", password:"bar123", mustChange:false, active:true },
];

const INIT_TABLES = Array.from({length:12},(_,i) => ({
  id:i+1, name: i<6?`Table ${i+1}`:i<9?`Table ${i+1}`:`Bar ${i-8}`,
  seats: i<6?[2,4,4,2,6,8][i]:i<9?[2,4,4][i-6]:1,
  zone: i<6?"Indoor":i<9?"Outdoor":"Bar", status:"available",
  currentOrder: null,
}));

const MENU = {
  "🍜 Starters":[
    {id:1,name:"Mushroom Soup",price:450,dest:"kitchen"},{id:2,name:"Caesar Salad",price:550,dest:"kitchen"},
    {id:3,name:"Garlic Bread",price:350,dest:"kitchen"},{id:4,name:"Spring Rolls",price:400,dest:"kitchen"},
    {id:5,name:"Chicken Wings",price:650,dest:"kitchen"},
  ],
  "🥩 Mains":[
    {id:7,name:"Grilled Tilapia",price:1200,dest:"kitchen"},{id:8,name:"Nyama Choma",price:1500,dest:"kitchen"},
    {id:9,name:"Chicken Tikka",price:950,dest:"kitchen"},{id:10,name:"Beef Steak",price:1800,dest:"kitchen"},
    {id:12,name:"Veggie Stir Fry",price:750,dest:"kitchen"},{id:14,name:"Pilau + Beef",price:850,dest:"kitchen"},
  ],
  "🥗 Sides":[
    {id:15,name:"Ugali",price:100,dest:"kitchen"},{id:16,name:"Chips",price:250,dest:"kitchen"},
    {id:17,name:"Rice",price:200,dest:"kitchen"},{id:18,name:"Kachumbari",price:150,dest:"kitchen"},
  ],
  "🍺 Drinks":[
    {id:21,name:"Tusker Lager",price:350,dest:"bar"},{id:22,name:"White Cap",price:350,dest:"bar"},
    {id:23,name:"Soda 500ml",price:150,dest:"bar"},{id:24,name:"Water 500ml",price:100,dest:"bar"},
    {id:25,name:"Fresh Juice",price:300,dest:"bar"},{id:26,name:"Cocktail",price:650,dest:"bar"},
    {id:27,name:"House Wine",price:550,dest:"bar"},
  ],
  "☕ Hot Drinks":[
    {id:28,name:"Kenyan Coffee",price:250,dest:"bar"},{id:29,name:"Chai Latte",price:300,dest:"bar"},
    {id:30,name:"Hot Chocolate",price:350,dest:"bar"},
  ],
  "🍰 Desserts":[
    {id:32,name:"Chocolate Cake",price:450,dest:"kitchen"},{id:33,name:"Ice Cream",price:350,dest:"kitchen"},
    {id:34,name:"Fruit Platter",price:400,dest:"kitchen"},
  ],
};

const fmt = n => `KSh ${n.toLocaleString()}`;
const timeNow = () => new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
const Dot = ({color}) => <span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block"}}/>;
const Btn = ({children,primary,danger,small,disabled,onClick,style:sx}) => (
  <button onClick={disabled?undefined:onClick} style={{padding:small?"6px 12px":"11px 20px",borderRadius:small?8:12,border:primary||danger?"none":`1px solid ${C.border}`,background:danger?C.red:primary?C.purple:C.white,color:danger||primary?"#fff":C.textMid,fontSize:small?12:14,fontWeight:primary||danger?700:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all 0.15s",...sx}}>{children}</button>
);

/* ═══════ LOGIN ═══════ */
const Login = ({users, shifts, onLogin}) => {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [show,setShow]=useState(false); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const go = () => {
    setErr("");
    if(!u.trim()||!p){setErr("Enter username and password");return;}
    const user = users.find(x => x.username.toLowerCase()===u.toLowerCase().trim()&&x.active);
    if(!user){setErr("User not found or disabled");return;}
    if(user.password!==p){setErr("Wrong password");return;}
    setLoading(true); setTimeout(()=>{setLoading(false);onLogin(user);},400);
  };
  const activeShifts = shifts.filter(s => s.active);
  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.white,borderRadius:24,padding:32,maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:14,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><span style={{color:"#fff",fontSize:20,fontWeight:800}}>CV</span></div>
          <h1 style={{fontSize:22,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:2}}>Codevertex POS</h1>
          <p style={{color:C.textMuted,fontSize:13}}>Hotel & Restaurant</p>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:600,color:C.textMid,display:"block",marginBottom:5}}>Username</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,opacity:0.4}}>👤</span>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Enter username" style={{width:"100%",padding:"11px 14px 11px 36px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.white,color:C.text,fontSize:14,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:600,color:C.textMid,display:"block",marginBottom:5}}>Password</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,opacity:0.4}}>🔒</span>
          <input type={show?"text":"password"} value={p} onChange={e=>setP(e.target.value)} placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&go()}
            style={{width:"100%",padding:"11px 40px 11px 36px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.white,color:C.text,fontSize:14,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
          <button onClick={()=>setShow(!show)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.textMuted}}>{show?"🙈":"👁"}</button></div>
        </div>
        {err&&<div style={{padding:"8px 12px",borderRadius:8,background:C.redPale,color:C.red,fontSize:12,fontWeight:600,marginBottom:14}}>⚠ {err}</div>}
        <button onClick={go} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:loading?C.textDim:C.purple,color:"#fff",fontSize:15,fontWeight:700,cursor:loading?"wait":"pointer",fontFamily:"'Outfit',sans-serif",boxShadow:"0 4px 14px rgba(107,45,139,0.3)"}}>
          {loading?"Signing in...":"Sign In"}
        </button>
        {activeShifts.length > 0 && (
          <div style={{marginTop:16,padding:"10px 12px",background:C.greenPale,borderRadius:10,fontSize:11,color:C.green}}>
            <strong>{activeShifts.length} active shift{activeShifts.length>1?"s":""}:</strong> {activeShifts.map(s=>s.userName).join(", ")}
          </div>
        )}
        <div style={{textAlign:"center",marginTop:16,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <p style={{fontSize:10,color:C.textDim,marginBottom:4}}>Demo: admin/admin123 · mary.a/1234 · samuel.k/cash123 · chef.james/kitchen1 · barman.pete/bar123</p>
        </div>
      </div>
    </div>
  );
};

/* ═══════ CHANGE PW ═══════ */
const ChangePW = ({user, onDone}) => {
  const [pw,setPw]=useState(""); const [pw2,setPw2]=useState(""); const [err,setErr]=useState("");
  const go = () => { if(pw.length<4){setErr("Min 4 chars");return;} if(pw!==pw2){setErr("Passwords don't match");return;} onDone(pw); };
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:20,padding:32,maxWidth:380,width:"100%",border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:28,marginBottom:6}}>🔐</div>
          <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Set New Password</h2>
          <p style={{fontSize:12,color:C.textMuted,marginTop:4}}>Hi {user.name.split(" ")[0]}, choose a secure password</p></div>
        <div style={{background:C.orangePale,borderRadius:8,padding:10,marginBottom:16,fontSize:11,color:C.orange}}>⚠ Default password detected. You must change it.</div>
        <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>New Password</label>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,outline:"none"}}/></div>
        <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Confirm</label>
          <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);setErr("");}} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${err?C.red:C.border}`,fontSize:14,outline:"none"}}/>
          {err&&<p style={{fontSize:11,color:C.red,marginTop:3}}>{err}</p>}</div>
        <Btn primary onClick={go} style={{width:"100%"}}>Set Password & Continue</Btn>
      </div>
    </div>
  );
};

/* ═══════ START SHIFT ═══════ */
const StartShift = ({user, showFloat, onStart, onLogout}) => {
  const [f,setF]=useState("0");
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:20,padding:28,maxWidth:380,width:"100%",border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:28,marginBottom:6}}>⏰</div>
          <h2 style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Begin Shift</h2>
          <p style={{fontSize:12,color:C.textMuted,marginTop:4}}>{user.name} · {ROLES[user.role].label}</p>
          <p style={{fontSize:11,color:C.textDim}}>{timeNow()}</p></div>
        {showFloat && <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:C.textMid,display:"block",marginBottom:5}}>Opening Cash Float (KSh)</label>
          <input value={f} onChange={e=>setF(e.target.value.replace(/\D/g,""))} style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",outline:"none"}}/>
        </div>}
        <div style={{display:"flex",gap:8}}><Btn onClick={onLogout}>Back</Btn><Btn primary onClick={()=>onStart(parseInt(f)||0)} style={{flex:1}}>Start Shift →</Btn></div>
      </div>
    </div>
  );
};

/* ═══════ VOID MODAL ═══════ */
const VoidModal = ({item, onVoid, onCancel}) => {
  const [r,setR]=useState("");
  const rs = ["Customer changed mind","Wrong item entered","Out of stock","Quality issue","Other"];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:C.white,borderRadius:18,padding:22,maxWidth:340,width:"100%",boxShadow:"0 16px 48px rgba(0,0,0,0.15)"}}>
        <h3 style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>🗑 Remove Item</h3>
        <p style={{fontSize:11,color:C.textMuted,marginBottom:12}}>This action will be logged for accountability</p>
        <div style={{background:C.redPale,borderRadius:8,padding:10,marginBottom:12,fontSize:13,fontWeight:600}}>{item.qty}x {item.name} — {fmt(item.price*item.qty)}</div>
        <label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:6}}>Reason *</label>
        {rs.map(x=><div key={x} onClick={()=>setR(x)} style={{padding:"8px 12px",borderRadius:7,cursor:"pointer",border:`1.5px solid ${r===x?C.purple:C.border}`,background:r===x?C.purplePale:C.white,fontSize:12,fontWeight:r===x?600:400,color:r===x?C.purple:C.textMid,marginBottom:4}}>{x}</div>)}
        <div style={{display:"flex",gap:8,marginTop:12}}><Btn onClick={onCancel} style={{flex:1}}>Cancel</Btn><Btn danger disabled={!r} onClick={()=>onVoid(r)} style={{flex:1}}>Remove</Btn></div>
      </div>
    </div>
  );
};

/* ═══════ HEADER ═══════ */
const Header = ({user, shift, tab, setTab, onEndShift, kBadge, bBadge, billsBadge}) => {
  const elapsed = Math.round((Date.now()-shift.startTime)/60000);
  const allTabs = [
    {id:"tables",label:"🪑 Tables",perm:"tables"},
    {id:"kitchen",label:"🍳 Kitchen",perm:"kitchen",badge:kBadge},
    {id:"bar",label:"🍺 Bar",perm:"bar",badge:bBadge},
    {id:"cashier",label:"💰 Bills",perm:"cashier",badge:billsBadge},
    {id:"users",label:"👥 Users",perm:"users"},
  ];
  const tabs = allTabs.filter(t=>ROLES[user.role].tabs.includes(t.perm));
  return (
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      <div style={{padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:7,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:800}}>CV</div>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Codevertex POS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{padding:"3px 7px",borderRadius:5,background:C.greenPale,display:"flex",alignItems:"center",gap:4}}>
            <Dot color={C.green}/><span style={{fontSize:9,fontWeight:600,color:C.green}}>{elapsed}m</span></div>
          <span style={{fontSize:11,fontWeight:600,color:C.text}}>{user.name.split(" ")[0]}</span>
          <span style={{fontSize:9,color:C.textMuted}}>{ROLES[user.role].label}</span>
          <button onClick={onEndShift} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.red}30`,background:C.redPale,color:C.red,fontSize:9,fontWeight:600,cursor:"pointer"}}>End Shift</button>
        </div>
      </div>
      <div style={{display:"flex",gap:1,padding:"0 10px",borderTop:`1px solid ${C.border}`,overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 12px",border:"none",cursor:"pointer",background:"transparent",fontSize:11,fontWeight:600,color:tab===t.id?C.purple:C.textMuted,borderBottom:`2.5px solid ${tab===t.id?C.purple:"transparent"}`,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
            {t.label}{t.badge>0&&<span style={{background:C.red,color:"#fff",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:6}}>{t.badge}</span>}
          </button>))}
      </div>
    </div>
  );
};

/* ═══════ WAITER: TABLES ═══════ */
const WaiterTables = ({tables, onNew, onAddToBill}) => {
  const [zone,setZone]=useState("All");
  const zones=["All","Indoor","Outdoor","Bar"];
  const f = zone==="All"?tables:tables.filter(t=>t.zone===zone);
  return (
    <div style={{padding:14,overflowY:"auto",flex:1}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Floor Plan</h2>
        <p style={{fontSize:11,color:C.textMuted}}>{tables.filter(t=>t.status==="available").length} available · {tables.filter(t=>t.status==="occupied").length} occupied</p>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {zones.map(z=><button key={z} onClick={()=>setZone(z)} style={{padding:"5px 10px",borderRadius:6,border:zone===z?"none":`1px solid ${C.border}`,background:zone===z?C.purple:C.white,color:zone===z?"#fff":C.textMid,fontSize:10,fontWeight:600,cursor:"pointer"}}>{z}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:8}}>
        {f.map(t=>{
          const a=t.status==="available"; const bc=a?C.green:C.blue;
          return (
            <div key={t.id} onClick={()=>a?onNew(t):t.currentOrder?onAddToBill(t):null}
              style={{background:C.white,borderRadius:12,padding:12,border:`2px solid ${bc}20`,cursor:"pointer",position:"relative",overflow:"hidden",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=a?C.purple:C.blue;e.currentTarget.style.transform="translateY(-1px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${bc}20`;e.currentTarget.style.transform="none";}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bc,opacity:0.4}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:800,color:C.text}}>{t.name}</span><Dot color={bc}/>
              </div>
              <div style={{fontSize:10,color:C.textMuted}}>{t.seats}s · {t.zone}</div>
              {a&&<div style={{marginTop:6,padding:"4px 0",textAlign:"center",background:C.purplePale,borderRadius:5,color:C.purple,fontSize:10,fontWeight:600}}>Tap to seat guests</div>}
              {!a&&t.currentOrder&&<>
                <div style={{marginTop:6,fontSize:10,color:C.blue,fontWeight:600}}>{t.currentOrder.orderNo} · {fmt(t.currentOrder.total)}</div>
                <div style={{marginTop:4,padding:"4px 0",textAlign:"center",background:C.bluePale,borderRadius:5,color:C.blue,fontSize:10,fontWeight:600}}>+ Add to bill</div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════ GUEST MODAL ═══════ */
const GuestModal = ({table, onOk, onBack}) => {
  const [c,setC]=useState(2);
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:20,padding:24,maxWidth:320,width:"100%",textAlign:"center",border:`1px solid ${C.border}`}}>
        <div style={{fontSize:24,marginBottom:6}}>🪑</div>
        <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>{table.name}</h2>
        <p style={{fontSize:11,color:C.textMuted,marginBottom:18}}>{table.seats} seats · {table.zone}</p>
        <div style={{fontSize:11,fontWeight:600,color:C.textMid,marginBottom:6}}>Guests</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:18}}>
          <button onClick={()=>setC(Math.max(1,c-1))} style={{width:36,height:36,borderRadius:9,border:`1px solid ${C.border}`,background:C.white,fontSize:15,cursor:"pointer",color:C.textMid}}>−</button>
          <span style={{fontSize:30,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{c}</span>
          <button onClick={()=>setC(c+1)} style={{width:36,height:36,borderRadius:9,border:`1px solid ${C.border}`,background:C.white,fontSize:15,cursor:"pointer",color:C.textMid}}>+</button>
        </div>
        <div style={{display:"flex",gap:8}}><Btn onClick={onBack} style={{flex:1}}>Back</Btn><Btn primary onClick={()=>onOk(c)} style={{flex:1}}>Start Order</Btn></div>
      </div>
    </div>
  );
};

/* ═══════ ORDER SCREEN (new + add-to-bill) ═══════ */
const OrderScreen = ({user, table, guests, existingItems, onPlace, onBack, isAddition}) => {
  const [cat,setCat]=useState(Object.keys(MENU)[0]);
  const [items,setItems]=useState([]);
  const [search,setSearch]=useState("");
  const [voidItem,setVoidItem]=useState(null);
  const [voided,setVoided]=useState([]);
  const add = i => setItems(p=>{const e=p.find(x=>x.id===i.id);return e?p.map(x=>x.id===i.id?{...x,qty:x.qty+1}:x):[...p,{...i,qty:1}];});
  const updQ = (id,d) => setItems(p=>p.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+d)}:i));
  const doVoid = r => {setVoided(p=>[...p,{...voidItem,reason:r,voidedAt:timeNow(),voidedBy:user.name}]);setItems(p=>p.filter(i=>i.id!==voidItem.id));setVoidItem(null);};
  const sub = items.reduce((s,i)=>s+i.price*i.qty,0);
  const kit=items.filter(i=>i.dest==="kitchen"), bar=items.filter(i=>i.dest==="bar");
  const all = search?Object.values(MENU).flat().filter(i=>i.name.toLowerCase().includes(search.toLowerCase())):MENU[cat];

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg}}>
      {voidItem&&<VoidModal item={voidItem} onVoid={doVoid} onCancel={()=>setVoidItem(null)}/>}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={onBack} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,color:C.textMid,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
          <span style={{fontSize:14,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>{table.name}</span>
          <span style={{fontSize:10,color:C.textMuted}}>{guests}p · {user.name.split(" ")[0]}</span>
          {isAddition&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.bluePale,color:C.blue,fontWeight:700}}>ADDING TO BILL</span>}
        </div>
        <div style={{display:"flex",gap:4}}>
          {kit.length>0&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.orangePale,color:C.orange,fontWeight:600}}>🍳{kit.reduce((s,i)=>s+i.qty,0)}</span>}
          {bar.length>0&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.bluePale,color:C.blue,fontWeight:600}}>🍺{bar.reduce((s,i)=>s+i.qty,0)}</span>}
        </div>
      </div>
      {/* Existing items banner */}
      {isAddition&&existingItems&&existingItems.length>0&&(
        <div style={{padding:"8px 14px",background:C.bluePale,borderBottom:`1px solid ${C.blue}20`,fontSize:11,color:C.blue}}>
          <strong>Existing bill: {existingItems.length} items · {fmt(existingItems.reduce((s,i)=>s+i.price*i.qty,0))}</strong> — Adding new items below
        </div>
      )}
      <div style={{flex:1,display:"flex",overflow:"hidden",flexWrap:"wrap"}}>
        {/* Menu */}
        <div style={{flex:"1 1 56%",minWidth:260,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`,background:C.white}}>
          <div style={{padding:8}}><input placeholder="Search menu..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:12,outline:"none"}}/></div>
          {!search&&<div style={{display:"flex",gap:3,padding:"0 8px 6px",overflowX:"auto",flexShrink:0}}>
            {Object.keys(MENU).map(c2=><button key={c2} onClick={()=>setCat(c2)} style={{padding:"5px 9px",borderRadius:7,border:cat===c2?"none":`1px solid ${C.border}`,background:cat===c2?C.purple:C.white,color:cat===c2?"#fff":C.textMid,fontSize:10,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{c2}</button>)}
          </div>}
          <div style={{flex:1,overflowY:"auto",padding:"2px 8px 8px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:5}}>
              {(all||[]).map(item=>{const ic=items.find(i=>i.id===item.id);return(
                <div key={item.id} onClick={()=>add(item)} style={{background:ic?C.purplePale:C.bg,borderRadius:9,padding:9,cursor:"pointer",border:`1.5px solid ${ic?C.purple+"40":C.border}`,position:"relative"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple} onMouseLeave={e=>e.currentTarget.style.borderColor=ic?C.purple+"40":C.border}>
                  {ic&&<div style={{position:"absolute",top:4,right:4,width:17,height:17,borderRadius:5,background:C.purple,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{ic.qty}</div>}
                  <div style={{fontSize:11,fontWeight:600,color:C.text,marginBottom:3,paddingRight:ic?20:0,lineHeight:1.3}}>{item.name}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.purple}}>{fmt(item.price)}</span>
                    <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,fontWeight:600,background:item.dest==="bar"?C.bluePale:C.orangePale,color:item.dest==="bar"?C.blue:C.orange}}>{item.dest==="bar"?"Bar":"Kit"}</span>
                  </div></div>);})}
            </div></div>
        </div>
        {/* Order */}
        <div style={{flex:"1 1 36%",minWidth:230,display:"flex",flexDirection:"column",background:C.bg}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,background:C.white}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text}}>{isAddition?"New Items":"Order"}</div></div>
          <div style={{flex:1,overflowY:"auto"}}>
            {items.length===0?<div style={{textAlign:"center",padding:24,color:C.textDim,fontSize:11}}>🍽️ Tap items</div>:<>
              {kit.length>0&&<><div style={{padding:"6px 10px 2px",fontSize:9,fontWeight:700,color:C.orange,textTransform:"uppercase",letterSpacing:1}}>🍳 Kitchen</div>
              {kit.map(i=><ORow key={i.id} item={i} updQ={updQ} onVoid={()=>setVoidItem(i)}/>)}</>}
              {bar.length>0&&<><div style={{padding:"6px 10px 2px",fontSize:9,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:1}}>🍺 Bar</div>
              {bar.map(i=><ORow key={i.id} item={i} updQ={updQ} onVoid={()=>setVoidItem(i)}/>)}</>}
            </>}
          </div>
          {items.length>0&&<div style={{padding:10,borderTop:`1px solid ${C.border}`,background:C.white}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>
              <span>{isAddition?"New Items":"Total"}</span><span style={{color:C.purple}}>{fmt(sub)}</span></div>
            <button onClick={()=>onPlace(items,sub,voided)} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:C.purple,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(107,45,139,0.25)"}}>
              {isAddition?"Add to Bill →":"Place Order →"}
            </button>
            <p style={{fontSize:9,color:C.textDim,textAlign:"center",marginTop:4}}>You'll be logged out after placing · Shift stays open</p>
          </div>}
        </div>
      </div>
    </div>
  );
};

const ORow = ({item, updQ, onVoid}) => (
  <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 8px",background:C.white,margin:"0 5px 2px",borderRadius:6,border:`1px solid ${C.border}`}}>
    <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.text}}>{item.name}</div><div style={{fontSize:9,color:C.textMuted}}>{fmt(item.price)}</div></div>
    <button onClick={()=>updQ(item.id,-1)} style={{width:20,height:20,borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:11,cursor:"pointer",color:C.textMid,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
    <span style={{fontSize:11,fontWeight:700,color:C.text,minWidth:12,textAlign:"center"}}>{item.qty}</span>
    <button onClick={()=>updQ(item.id,1)} style={{width:20,height:20,borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:11,cursor:"pointer",color:C.textMid,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    <span style={{fontSize:10,fontWeight:700,color:C.purple,minWidth:45,textAlign:"right"}}>{fmt(item.price*item.qty)}</span>
    <button onClick={onVoid} style={{width:18,height:18,borderRadius:4,border:"none",background:C.redPale,color:C.red,cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
  </div>
);

/* ═══════ KDS (Kitchen + Bar) ═══════ */
const KDS = ({orders, onUpdate, onComplete, title, icon, emptyIcon, emptyText}) => {
  const [,tick]=useState(0); useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),10000);return()=>clearInterval(t);},[]);
  const active=orders.filter(o=>o.status!=="completed");
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"12px 14px",background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2 style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>{icon} {title}</h2>
          <p style={{fontSize:10,color:C.textMuted}}>{active.length} active</p></div>
        <span style={{fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{timeNow()}</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:10}}>
        {active.length===0?<div style={{textAlign:"center",padding:50}}><div style={{fontSize:40,marginBottom:8}}>{emptyIcon}</div><h3 style={{fontSize:15,fontWeight:700,color:C.text}}>All clear!</h3><p style={{fontSize:11,color:C.textMuted}}>{emptyText}</p></div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
          {active.map(order=>{
            const el=Math.round((Date.now()-order.placedAt)/60000);const urg=el>15;const ar=order.items.every(i=>i.itemStatus==="ready");
            const bc=order.status==="new"?C.yellow:ar?C.green:C.orange;
            return(
              <div key={order.id} style={{background:C.white,borderRadius:12,border:`2px solid ${bc}`,overflow:"hidden",animation:order.status==="new"?"pulse 2s infinite":"none"}}>
                <div style={{padding:"8px 12px",background:order.status==="new"?C.yellowPale:ar?C.greenPale:C.orangePale,borderBottom:`1px solid ${bc}30`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:14,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{order.table}</span>
                    <span style={{fontSize:8,fontWeight:800,padding:"2px 5px",borderRadius:3,background:bc,color:"#fff"}}>{order.status==="new"?"NEW":ar?"READY":"COOKING"}</span>
                    {order.isAddition&&<span style={{fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:3,background:C.bluePale,color:C.blue}}>+ADD</span>}
                  </div>
                  <div style={{fontSize:9,color:C.textMuted,marginTop:1}}>{order.orderNo} · {order.waiter}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:urg?C.red:C.text}}>{el}m</div>
                  {urg&&<div style={{fontSize:8,color:C.red,fontWeight:600}}>⚠ URGENT</div>}</div>
                </div>
                {order.items.map((item,idx)=>(
                  <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderBottom:idx<order.items.length-1?`1px solid ${C.borderLight}`:"none",background:item.itemStatus==="ready"?`${C.green}08`:"transparent"}}>
                    <span style={{flex:1,fontSize:12,fontWeight:600,color:item.itemStatus==="ready"?C.green:C.text,textDecoration:item.itemStatus==="ready"?"line-through":"none"}}>{item.qty}x {item.name}</span>
                    {item.itemStatus==="pending"&&<button onClick={()=>onUpdate(order.id,idx,"cooking")} style={{padding:"3px 7px",borderRadius:4,border:"none",background:C.orangePale,color:C.orange,fontSize:9,fontWeight:700,cursor:"pointer"}}>Start 🔥</button>}
                    {item.itemStatus==="cooking"&&<button onClick={()=>onUpdate(order.id,idx,"ready")} style={{padding:"3px 7px",borderRadius:4,border:"none",background:C.greenPale,color:C.green,fontSize:9,fontWeight:700,cursor:"pointer"}}>Done ✓</button>}
                    {item.itemStatus==="ready"&&<span style={{color:C.green,fontSize:12}}>✓</span>}
                  </div>))}
                {ar&&<div style={{padding:"6px 12px",borderTop:`2px solid ${C.green}30`}}>
                  <button onClick={()=>onComplete(order.id)} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.green,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔔 Ready — Call Waiter</button></div>}
                {order.status==="new"&&!ar&&<div style={{padding:"6px 12px",borderTop:`2px solid ${C.yellow}30`}}>
                  <button onClick={()=>order.items.forEach((_,idx)=>onUpdate(order.id,idx,"cooking"))} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.orange,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔥 Start All</button></div>}
              </div>);})}
        </div>}
      </div>
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(234,179,8,0.15)}50%{box-shadow:0 0 0 6px rgba(234,179,8,0.3)}}`}</style>
    </div>
  );
};

/* ═══════ CASHIER: BILL SETTLEMENT ═══════ */
const CashierView = ({tables, allOrders, onSettle}) => {
  const occupied = tables.filter(t=>t.status==="occupied"&&t.currentOrder);
  const settled = allOrders.filter(o=>o.settled);
  const totalToday = settled.reduce((s,o)=>s+o.total,0);
  return (
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:2}}>💰 Cashier — Bills</h2>
      <p style={{fontSize:11,color:C.textMuted,marginBottom:14}}>{occupied.length} open bill{occupied.length!==1?"s":""} · {settled.length} settled today · {fmt(totalToday)} collected</p>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:16}}>
        {[{l:"Open Bills",v:occupied.length,c:C.orange},{l:"Settled Today",v:settled.length,c:C.green},{l:"Revenue",v:fmt(totalToday),c:C.purple}].map((s,i)=>(
          <div key={i} style={{background:C.white,borderRadius:10,padding:12,textAlign:"center",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:9,color:C.textDim,fontWeight:600,marginBottom:2}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif"}}>{s.v}</div></div>))}
      </div>
      {/* Open Bills */}
      <h3 style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:8}}>Open Bills</h3>
      {occupied.length===0?<p style={{fontSize:12,color:C.textMuted}}>No open bills</p>:
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {occupied.map(t=>{const o=t.currentOrder;return(
            <div key={t.id} style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontSize:14,fontWeight:800,color:C.text}}>{t.name} · {o.orderNo}</div>
                  <div style={{fontSize:10,color:C.textMuted}}>{o.guests}p · Waiter: {o.waiter} · {o.time}</div></div>
                <span style={{fontSize:16,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{fmt(o.total)}</span>
              </div>
              <div style={{borderTop:`1px solid ${C.borderLight}`,paddingTop:8,marginBottom:8}}>
                {o.items.map((i,idx)=><div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:C.textMid}}>
                  <span>{i.qty}x {i.name}</span><span>{fmt(i.price*i.qty)}</span></div>)}
              </div>
              <Btn primary small onClick={()=>onSettle(t)} style={{width:"100%"}}>Settle Bill — {fmt(o.total)}</Btn>
            </div>
          );})}
        </div>
      }
    </div>
  );
};

/* ═══════ PAYMENT MODAL ═══════ */
const PaymentModal = ({table, order, onComplete, onCancel}) => {
  const [mode,setMode]=useState("full"); // full, split_equal, split_items
  const [method,setMethod]=useState(null);
  const [phone,setPhone]=useState("");
  const [splitCount,setSplitCount]=useState(2);
  const [splitPayments,setSplitPayments]=useState([]);
  const [processing,setProcessing]=useState(false);
  const [done,setDone]=useState(false);
  const [itemAssign,setItemAssign]=useState({}); // itemIdx -> personIdx for split_items

  const total = order.total;
  const methods = [{id:"mpesa",label:"M-Pesa",icon:"📱",desc:"STK Push"},{id:"cash",label:"Cash",icon:"💵",desc:"Cash payment"},{id:"card",label:"Card",icon:"💳",desc:"Visa/MC"}];

  const handlePay = () => { setProcessing(true); setTimeout(()=>{setProcessing(false);setDone(true);},1500); };

  // Split equal
  const perPerson = Math.ceil(total/splitCount);

  // For split payment tracking
  const addSplitPayment = (amt, m) => {
    setSplitPayments(p=>[...p,{amount:amt,method:m,time:timeNow()}]);
  };
  const paidSoFar = splitPayments.reduce((s,p)=>s+p.amount,0);
  const remaining = total - paidSoFar;

  if(done) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:C.white,borderRadius:20,padding:28,maxWidth:400,width:"100%",textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:C.greenPale,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:26}}>✅</div>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Bill Settled!</h2>
        <p style={{fontSize:13,color:C.textMuted,marginTop:4}}>{order.orderNo} · {table.name} · {fmt(total)}</p>
        <p style={{fontSize:11,color:C.green,fontWeight:600,marginTop:6}}>eTIMS invoice generated · KRA ref: INV-{Math.floor(Math.random()*90000)+10000}</p>
        {splitPayments.length>0&&<div style={{marginTop:12,textAlign:"left"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginBottom:4}}>Payments:</div>
          {splitPayments.map((p,i)=><div key={i} style={{fontSize:11,color:C.textMid,padding:"2px 0"}}>{fmt(p.amount)} via {p.method} · {p.time}</div>)}
        </div>}
        <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center"}}>
          <Btn small>Print Receipt</Btn><Btn small>SMS Receipt</Btn>
          <Btn primary small onClick={()=>onComplete(splitPayments.length>0?splitPayments:[{amount:total,method:method,time:timeNow()}])}>Done</Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16,overflowY:"auto"}}>
      <div style={{background:C.white,borderRadius:20,padding:24,maxWidth:440,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div><h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Settle Bill</h2>
            <p style={{fontSize:11,color:C.textMuted}}>{table.name} · {order.orderNo} · {order.guests}p</p></div>
          <button onClick={onCancel} style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,color:C.textMid,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Amount */}
        <div style={{textAlign:"center",padding:16,background:C.purplePale,borderRadius:12,marginBottom:16}}>
          <div style={{fontSize:10,color:C.purple,fontWeight:600,marginBottom:2}}>TOTAL DUE</div>
          <div style={{fontSize:32,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{fmt(total)}</div>
          <div style={{fontSize:10,color:C.textDim,marginTop:2}}>{order.items.reduce((s,i)=>s+i.qty,0)} items</div>
        </div>

        {/* Payment Mode */}
        <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginBottom:6}}>PAYMENT TYPE</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[{id:"full",label:"Full Payment"},{id:"split_equal",label:"Split Equally"},{id:"split_custom",label:"Split Custom"}].map(m=>(
            <button key={m.id} onClick={()=>{setMode(m.id);setMethod(null);setSplitPayments([]);}} style={{
              flex:1,padding:"8px 6px",borderRadius:8,border:`1.5px solid ${mode===m.id?C.purple:C.border}`,
              background:mode===m.id?C.purplePale:C.white,color:mode===m.id?C.purple:C.textMid,
              fontSize:11,fontWeight:mode===m.id?700:500,cursor:"pointer",
            }}>{m.label}</button>
          ))}
        </div>

        {/* FULL PAYMENT */}
        {mode==="full"&&<>
          <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginBottom:6}}>METHOD</div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {methods.map(m=>(
              <div key={m.id} onClick={()=>setMethod(m.id)} style={{flex:1,padding:12,borderRadius:10,cursor:"pointer",border:`2px solid ${method===m.id?C.purple:C.border}`,background:method===m.id?C.purplePale:C.white,textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:2}}>{m.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:C.text}}>{m.label}</div>
                <div style={{fontSize:9,color:C.textDim}}>{m.desc}</div>
              </div>))}
          </div>
          {method==="mpesa"&&<div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Customer Phone</label>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0712 345 678" style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",outline:"none",textAlign:"center"}}/>
          </div>}
          <button onClick={handlePay} disabled={!method||processing||(method==="mpesa"&&!phone)} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:processing?C.textDim:C.purple,color:"#fff",fontSize:14,fontWeight:700,cursor:processing?"wait":"pointer",opacity:!method?0.5:1}}>
            {processing?"Processing...":` Pay ${fmt(total)}`}
          </button>
        </>}

        {/* SPLIT EQUALLY */}
        {mode==="split_equal"&&<>
          <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginBottom:6}}>SPLIT BETWEEN</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:12}}>
            <button onClick={()=>setSplitCount(Math.max(2,splitCount-1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:14,cursor:"pointer"}}>−</button>
            <span style={{fontSize:24,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{splitCount}</span>
            <button onClick={()=>setSplitCount(splitCount+1)} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:14,cursor:"pointer"}}>+</button>
          </div>
          <div style={{textAlign:"center",padding:12,background:C.bg,borderRadius:10,marginBottom:12,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.textDim}}>Each person pays</div>
            <div style={{fontSize:22,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{fmt(perPerson)}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
            {Array.from({length:splitCount}).map((_,i)=>{
              const paid = splitPayments[i];
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:paid?C.greenPale:C.bg,borderRadius:8,border:`1px solid ${paid?C.green+"30":C.border}`}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.text,minWidth:70}}>Person {i+1}</span>
                  <span style={{flex:1,fontSize:12,fontWeight:600,color:paid?C.green:C.textMid}}>{paid?`✓ Paid ${fmt(paid.amount)} via ${paid.method}`:fmt(perPerson)}</span>
                  {!paid&&<div style={{display:"flex",gap:3}}>
                    {methods.map(m=><button key={m.id} onClick={()=>addSplitPayment(perPerson,m.label)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,fontSize:9,fontWeight:600,cursor:"pointer"}}>{m.icon}</button>)}
                  </div>}
                </div>);
            })}
          </div>
          {splitPayments.length===splitCount&&<button onClick={handlePay} disabled={processing} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:C.green,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {processing?"Processing...":"✓ Complete All Payments"}</button>}
        </>}

        {/* SPLIT CUSTOM */}
        {mode==="split_custom"&&<>
          <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginBottom:6}}>CUSTOM SPLIT</div>
          <div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:12,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
              <span style={{color:C.textMid}}>Total</span><span style={{fontWeight:700}}>{fmt(total)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
              <span style={{color:C.green}}>Paid</span><span style={{fontWeight:700,color:C.green}}>{fmt(paidSoFar)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,color:remaining>0?C.orange:C.green,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
              <span>Remaining</span><span>{fmt(remaining)}</span></div>
          </div>
          {splitPayments.length>0&&<div style={{marginBottom:10}}>
            {splitPayments.map((p,i)=><div key={i} style={{fontSize:11,color:C.green,padding:"2px 0"}}>✓ {fmt(p.amount)} via {p.method}</div>)}</div>}
          {remaining>0&&<>
            <CustomPayment max={remaining} methods={methods} onPay={(amt,m)=>addSplitPayment(amt,m)}/>
          </>}
          {remaining<=0&&<button onClick={handlePay} disabled={processing} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:C.green,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:8}}>
            {processing?"Processing...":"✓ Complete Bill"}</button>}
        </>}
      </div>
    </div>
  );
};

const CustomPayment = ({max, methods, onPay}) => {
  const [amt,setAmt]=useState(String(max)); const [m,setM]=useState(null); const [phone,setPhone]=useState("");
  return (
    <div style={{background:C.bg,borderRadius:10,padding:12,border:`1px solid ${C.border}`}}>
      <label style={{fontSize:10,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Amount (max {fmt(max)})</label>
      <input value={amt} onChange={e=>setAmt(e.target.value.replace(/\D/g,""))} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",outline:"none",marginBottom:8}}/>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {methods.map(x=><div key={x.id} onClick={()=>setM(x.id)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`1.5px solid ${m===x.id?C.purple:C.border}`,background:m===x.id?C.purplePale:C.white,textAlign:"center",cursor:"pointer"}}>
          <div style={{fontSize:16}}>{x.icon}</div><div style={{fontSize:10,fontWeight:600,color:m===x.id?C.purple:C.textMid}}>{x.label}</div></div>)}
      </div>
      {m==="mpesa"&&<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone" style={{width:"100%",padding:"8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13,outline:"none",marginBottom:6,textAlign:"center"}}/>}
      <button onClick={()=>{const a=Math.min(parseInt(amt)||0,max);if(a>0&&m)onPay(a,methods.find(x=>x.id===m).label);}} disabled={!m||!parseInt(amt)} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:C.purple,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:!m?0.5:1}}>
        Add Payment
      </button>
    </div>
  );
};

/* ═══════ USER MANAGEMENT ═══════ */
const Users = ({users, onAdd, onToggle, onReset}) => {
  const [show,setShow]=useState(false);
  const [nu,setNu]=useState({name:"",username:"",role:"waiter"});
  return (
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>User Management</h2>
          <p style={{fontSize:11,color:C.textMuted}}>{users.length} users · {users.filter(u=>u.active).length} active</p></div>
        <Btn primary small onClick={()=>setShow(!show)}>+ Add User</Btn>
      </div>
      {show&&<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.purple}30`,marginBottom:12}}>
        <h3 style={{fontSize:13,fontWeight:700,marginBottom:10}}>New User</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><label style={{fontSize:10,fontWeight:600,color:C.textMid,display:"block",marginBottom:3}}>Full Name</label>
            <input value={nu.name} onChange={e=>setNu(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
          <div><label style={{fontSize:10,fontWeight:600,color:C.textMid,display:"block",marginBottom:3}}>Username</label>
            <input value={nu.username} onChange={e=>setNu(p=>({...p,username:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
        </div>
        <label style={{fontSize:10,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Role</label>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
          {Object.entries(ROLES).map(([k,v])=><div key={k} onClick={()=>setNu(p=>({...p,role:k}))} style={{padding:"6px 10px",borderRadius:7,cursor:"pointer",border:`1.5px solid ${nu.role===k?v.color:C.border}`,background:nu.role===k?`${v.color}10`:C.white,fontSize:11,fontWeight:nu.role===k?700:500,color:nu.role===k?v.color:C.textMid}}>{v.icon} {v.label}</div>)}
        </div>
        <div style={{background:C.bluePale,borderRadius:7,padding:8,marginBottom:10,fontSize:10,color:C.blue}}>Default password: <strong>changeme</strong> — user will be prompted to change on first login</div>
        <div style={{display:"flex",gap:6}}><Btn small onClick={()=>setShow(false)}>Cancel</Btn><Btn primary small disabled={!nu.name.trim()||!nu.username.trim()} onClick={()=>{onAdd(nu);setNu({name:"",username:"",role:"waiter"});setShow(false);}} style={{flex:1}}>Create</Btn></div>
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {users.map(u=>{const r=ROLES[u.role];return(
          <div key={u.id} style={{background:C.white,borderRadius:10,padding:12,border:`1px solid ${C.border}`,opacity:u.active?1:0.5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${r.color}15`,color:r.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800}}>
                  {u.name.split(" ").map(n=>n[0]).join("")}</div>
                <div><div style={{fontSize:12,fontWeight:700,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:10,color:C.textMuted}}>@{u.username} · {r.icon} {r.label}</div></div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {u.mustChange&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:C.orangePale,color:C.orange,fontWeight:600}}>Default PW</span>}
                <span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:u.active?C.greenPale:C.redPale,color:u.active?C.green:C.red,fontWeight:600}}>{u.active?"Active":"Off"}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:4,marginTop:8,borderTop:`1px solid ${C.borderLight}`,paddingTop:6}}>
              <button onClick={()=>onToggle(u.id)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,fontSize:9,fontWeight:600,color:u.active?C.red:C.green,cursor:"pointer"}}>{u.active?"Disable":"Enable"}</button>
              <button onClick={()=>onReset(u.id)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,fontSize:9,fontWeight:600,color:C.orange,cursor:"pointer"}}>Reset PW</button>
            </div>
          </div>);})}
      </div>
    </div>
  );
};

/* ═══════ END SHIFT ═══════ */
const EndShiftView = ({user, shift, orders, showFloat, onOk, onCancel}) => {
  const [cc,setCc]=useState("");
  const tot=orders.reduce((s,o)=>s+o.total,0);const voids=orders.reduce((s,o)=>s+(o.voidedItems?.length||0),0);
  const elapsed=Math.round((Date.now()-shift.startTime)/60000);
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:20,padding:28,maxWidth:420,width:"100%",border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:28,marginBottom:6}}>🏁</div>
          <h2 style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>End Shift</h2>
          <p style={{fontSize:12,color:C.textMuted}}>{user.name}</p></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
          {[{l:"Duration",v:`${Math.floor(elapsed/60)}h ${elapsed%60}m`,c:C.purple},{l:"Orders",v:orders.length,c:C.blue},{l:"Sales",v:fmt(tot),c:C.green},{l:"Voided",v:voids,c:voids>0?C.red:C.green}].map((s,i)=>(
            <div key={i} style={{background:C.bg,borderRadius:8,padding:"8px 10px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.textDim,fontWeight:600,marginBottom:1}}>{s.l}</div>
              <div style={{fontSize:15,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif"}}>{s.v}</div></div>))}
        </div>
        {showFloat&&<div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Closing Cash Count</label>
          <input value={cc} onChange={e=>setCc(e.target.value.replace(/\D/g,""))} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:18,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",outline:"none"}}/>
        </div>}
        <div style={{display:"flex",gap:8}}><Btn onClick={onCancel}>Cancel</Btn><Btn danger onClick={()=>onOk(parseInt(cc)||0)} style={{flex:1}}>End Shift & Sign Out</Btn></div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════ */
export default function App() {
  const [users,setUsers]=useState(INIT_USERS);
  const [step,setStep]=useState("login");
  const [user,setUser]=useState(null);
  const [shifts,setShifts]=useState([]);
  const [shift,setShift]=useState(null);
  const [tables,setTables]=useState(INIT_TABLES);
  const [tab,setTab]=useState("tables");
  const [selTable,setSelTable]=useState(null);
  const [guests,setGuests]=useState(0);
  const [allOrders,setAllOrders]=useState([]);
  const [kitchenQ,setKitchenQ]=useState([]);
  const [barQ,setBarQ]=useState([]);
  const [orderCtr,setOrderCtr]=useState(1);
  const [payTable,setPayTable]=useState(null);
  const [isAddition,setIsAddition]=useState(false);
  const [,tick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),15000);return()=>clearInterval(t);},[]);

  // Auto-logout confirmation
  const [showAutoLogout,setShowAutoLogout]=useState(false);
  const [lastOrderNo,setLastOrderNo]=useState("");

  const handleLogin = u => {
    setUser(u);
    // Check if shift exists
    const existing = shifts.find(s=>s.userId===u.id&&s.active);
    if(u.mustChange){setStep("changePW");return;}
    if(existing){
      setShift(existing);
      setStep("main");
      setTab(ROLES[u.role].tabs[0]);
      return;
    }
    if(["kitchen","bar"].includes(u.role)){
      const s = {id:Date.now(),userId:u.id,userName:u.name,role:u.role,startTime:Date.now(),float:0,active:true};
      setShifts(p=>[...p,s]); setShift(s); setStep("main"); setTab(u.role); return;
    }
    setStep("startShift");
  };

  const handleChangePW = pw => {
    setUsers(p=>p.map(x=>x.id===user.id?{...x,password:pw,mustChange:false}:x));
    setUser(p=>({...p,password:pw,mustChange:false}));
    const existing = shifts.find(s=>s.userId===user.id&&s.active);
    if(existing){setShift(existing);setStep("main");setTab(ROLES[user.role].tabs[0]);return;}
    if(["kitchen","bar"].includes(user.role)){
      const s={id:Date.now(),userId:user.id,userName:user.name,role:user.role,startTime:Date.now(),float:0,active:true};
      setShifts(p=>[...p,s]);setShift(s);setStep("main");setTab(user.role);return;
    }
    setStep("startShift");
  };

  const handleStartShift = f => {
    const s={id:Date.now(),userId:user.id,userName:user.name,role:user.role,startTime:Date.now(),float:f,active:true};
    setShifts(p=>[...p,s]);setShift(s);setStep("main");setTab(ROLES[user.role].tabs[0]);
  };

  const handlePlaceOrder = (items,total,voided) => {
    const no = `ORD-${String(orderCtr).padStart(4,"0")}`;
    setOrderCtr(c=>c+1); const now=Date.now();

    if(isAddition && selTable.currentOrder) {
      // Add to existing order
      const existing = selTable.currentOrder;
      const merged = [...existing.items];
      items.forEach(ni => {
        const ex = merged.find(m=>m.id===ni.id);
        if(ex) ex.qty += ni.qty;
        else merged.push({...ni});
      });
      const newTotal = merged.reduce((s,i)=>s+i.price*i.qty,0);
      const updatedOrder = {...existing, items:merged, total:newTotal, additions:[...(existing.additions||[]),{items,total,waiter:user.name,time:timeNow(),orderNo:no}]};
      setTables(p=>p.map(t=>t.id===selTable.id?{...t,currentOrder:updatedOrder}:t));
      setAllOrders(p=>p.map(o=>o.id===existing.id?updatedOrder:o));
      // Send new items to kitchen/bar
      const ki=items.filter(i=>i.dest==="kitchen"), bi=items.filter(i=>i.dest==="bar");
      if(ki.length>0)setKitchenQ(p=>[...p,{id:now+"-k",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",isAddition:true,items:ki.map(i=>({...i,itemStatus:"pending"}))}]);
      if(bi.length>0)setBarQ(p=>[...p,{id:now+"-b",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",isAddition:true,items:bi.map(i=>({...i,itemStatus:"pending"}))}]);
    } else {
      // New order
      const order = {id:now,orderNo:no,table:selTable.name,tableId:selTable.id,guests,items,total,voidedItems:voided,time:timeNow(),status:"active",waiter:user.name,settled:false,additions:[]};
      setAllOrders(p=>[...p,order]);
      setTables(p=>p.map(t=>t.id===selTable.id?{...t,status:"occupied",currentOrder:order}:t));
      const ki=items.filter(i=>i.dest==="kitchen"), bi=items.filter(i=>i.dest==="bar");
      if(ki.length>0)setKitchenQ(p=>[...p,{id:now+"-k",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",items:ki.map(i=>({...i,itemStatus:"pending"}))}]);
      if(bi.length>0)setBarQ(p=>[...p,{id:now+"-b",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",items:bi.map(i=>({...i,itemStatus:"pending"}))}]);
    }
    setLastOrderNo(no);
    setShowAutoLogout(true);
  };

  const autoLogout = () => {
    setShowAutoLogout(false);setUser(null);setSelTable(null);setGuests(0);setIsAddition(false);setStep("login");
  };

  const updateKDS = (oid,iid,s,q) => {
    const set=q==="kitchen"?setKitchenQ:setBarQ;
    set(p=>p.map(o=>{if(o.id!==oid)return o;const ni=o.items.map((i,idx)=>idx===iid?{...i,itemStatus:s}:i);const ac=ni.some(i=>i.itemStatus==="cooking");const ar=ni.every(i=>i.itemStatus==="ready");return{...o,items:ni,status:ar?"ready":ac?"cooking":o.status};}));
  };
  const completeKDS = (oid,q) => {const set=q==="kitchen"?setKitchenQ:setBarQ;set(p=>p.map(o=>o.id===oid?{...o,status:"completed"}:o));};

  const handleSettle = payments => {
    const t = payTable;
    setTables(p=>p.map(x=>x.id===t.id?{...x,status:"available",currentOrder:null}:x));
    setAllOrders(p=>p.map(o=>o.id===t.currentOrder.id?{...o,settled:true,payments,settledAt:timeNow()}:o));
    setPayTable(null);
  };

  const endShift = () => {
    setShifts(p=>p.map(s=>s.id===shift.id?{...s,active:false}:s));
    setUser(null);setShift(null);setStep("login");
  };

  const addUser = nu => setUsers(p=>[...p,{...nu,id:Date.now(),password:"changeme",mustChange:true,active:true}]);
  const toggleUser = id => setUsers(p=>p.map(u=>u.id===id?{...u,active:!u.active}:u));
  const resetPW = id => setUsers(p=>p.map(u=>u.id===id?{...u,password:"changeme",mustChange:true}:u));

  // Auto-logout overlay
  const AutoLogoutOverlay = () => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:20}}>
      <div style={{background:C.white,borderRadius:20,padding:28,maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:C.greenPale,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:26}}>✅</div>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Order Placed!</h2>
        <p style={{fontSize:13,color:C.textMuted,marginTop:4}}>{lastOrderNo} sent to Kitchen & Bar</p>
        <div style={{background:C.orangePale,borderRadius:10,padding:12,marginTop:14,fontSize:12,color:C.orange,fontWeight:500}}>
          🔒 You will now be logged out for security. Your shift remains active — log back in to take the next order.
        </div>
        <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center"}}>
          <Btn primary onClick={autoLogout} style={{flex:1}}>OK — Log Out</Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      {showAutoLogout&&<AutoLogoutOverlay/>}
      {payTable&&<PaymentModal table={payTable} order={payTable.currentOrder} onComplete={handleSettle} onCancel={()=>setPayTable(null)}/>}

      {step==="login"&&<Login users={users} shifts={shifts} onLogin={handleLogin}/>}
      {step==="changePW"&&<ChangePW user={user} onDone={handleChangePW}/>}
      {step==="startShift"&&<StartShift user={user} showFloat={user?.role==="cashier"} onStart={handleStartShift} onLogout={()=>{setUser(null);setStep("login");}}/>}

      {step==="main"&&<div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <Header user={user} shift={shift} tab={tab} setTab={setTab} onEndShift={()=>setStep("endShift")}
          kBadge={kitchenQ.filter(o=>o.status==="new").length} bBadge={barQ.filter(o=>o.status==="new").length}
          billsBadge={tables.filter(t=>t.status==="occupied").length}/>
        {tab==="tables"&&<WaiterTables tables={tables}
          onNew={t=>{setSelTable(t);setIsAddition(false);setStep("guests");}}
          onAddToBill={t=>{setSelTable(t);setGuests(t.currentOrder.guests);setIsAddition(true);setStep("order");}}/>}
        {tab==="kitchen"&&<KDS orders={kitchenQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"kitchen")} onComplete={o=>completeKDS(o,"kitchen")} title="Kitchen Display" icon="🍳" emptyIcon="👨‍🍳" emptyText="No food orders"/>}
        {tab==="bar"&&<KDS orders={barQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"bar")} onComplete={o=>completeKDS(o,"bar")} title="Bar Display" icon="🍺" emptyIcon="🍹" emptyText="No drink orders"/>}
        {tab==="cashier"&&<CashierView tables={tables} allOrders={allOrders} onSettle={t=>setPayTable(t)}/>}
        {tab==="users"&&<Users users={users} onAdd={addUser} onToggle={toggleUser} onReset={resetPW}/>}
      </div>}

      {step==="guests"&&<GuestModal table={selTable} onOk={c=>{setGuests(c);setStep("order");}} onBack={()=>{setSelTable(null);setStep("main");}}/>}
      {step==="order"&&<OrderScreen user={user} table={selTable} guests={guests} existingItems={isAddition?selTable?.currentOrder?.items:null} isAddition={isAddition} onPlace={handlePlaceOrder} onBack={()=>{if(isAddition){setIsAddition(false);setStep("main");}else setStep("guests");}}/>}
      {step==="endShift"&&<EndShiftView user={user} shift={shift} orders={allOrders.filter(o=>o.waiter===user.name)} showFloat={user?.role==="cashier"} onOk={endShift} onCancel={()=>setStep("main")}/>}
    </div>
  );
}
