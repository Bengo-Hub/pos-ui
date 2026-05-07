import { useState, useEffect } from "react";

const C = {
  purple:"#6B2D8B",purpleLight:"#8B4DAB",purplePale:"#F3ECF8",
  white:"#FFFFFF",bg:"#F8F7FA",
  border:"#E8E5ED",borderLight:"#F0EDF4",
  text:"#1A1A1A",textMid:"#4A4555",textMuted:"#8A849A",textDim:"#B5B0C0",
  green:"#10B981",greenPale:"#ECFDF5",
  red:"#EF4444",redPale:"#FEF2F2",
  orange:"#F59E0B",orangePale:"#FFFBEB",
  blue:"#3B82F6",bluePale:"#EFF6FF",
  yellow:"#EAB308",yellowPale:"#FEFCE8",
  teal:"#14B8A6",tealPale:"#CCFBF1",
  pink:"#EC4899",pinkPale:"#FCE7F3",
  indigo:"#6366F1",indigoPale:"#E0E7FF",
};

const ROLES={
  admin:{label:"Admin",icon:"🛡️",color:C.purple,tabs:["dashboard","tables","kitchen","bar","cashier","rooms","facilities","stock","users"],canVoid:true},
  manager:{label:"Manager",icon:"👔",color:C.indigo,tabs:["dashboard","tables","kitchen","bar","cashier","rooms"],canVoid:true},
  receptionist:{label:"Receptionist",icon:"🛎️",color:C.teal,tabs:["rooms","facilities"]},
  cashier:{label:"Cashier",icon:"💰",color:C.green,tabs:["cashier"]},
  waiter:{label:"Waiter",icon:"🍽️",color:C.blue,tabs:["tables","mybills"]},
  kitchen:{label:"Kitchen",icon:"🍳",color:C.orange,tabs:["kitchen"]},
  bar:{label:"Bar",icon:"🍺",color:C.blue,tabs:["bar"]},
};

const INIT_USERS=[
  {id:1,name:"System Admin",role:"admin",pin:"0000",active:true,phone:"0700000000"},
  {id:2,name:"Mary Akinyi",role:"waiter",pin:"1234",active:true,phone:"0712345678"},
  {id:3,name:"John Otieno",role:"waiter",pin:"5678",active:true,phone:"0723456789"},
  {id:4,name:"Grace Wanjiku",role:"waiter",pin:"4321",active:true,phone:"0734567890"},
  {id:5,name:"Samuel Kamau",role:"cashier",pin:"1111",active:true,phone:"0745678901"},
  {id:6,name:"James Omondi",role:"kitchen",pin:"2222",active:true,phone:"0756789012"},
  {id:7,name:"Peter Njoroge",role:"bar",pin:"3333",active:true,phone:"0767890123"},
  {id:8,name:"Faith Njeri",role:"receptionist",pin:"4444",active:true,phone:"0778901234"},
  {id:9,name:"Daniel Kiprop",role:"manager",pin:"9999",active:true,phone:"0789012345"},
];

const ROOM_ST={available:{l:"Available",c:C.green,bg:C.greenPale,i:"✅"},occupied:{l:"Occupied",c:C.blue,bg:C.bluePale,i:"🔵"},reserved:{l:"Reserved",c:C.orange,bg:C.orangePale,i:"📅"},cleaning:{l:"Cleaning",c:C.yellow,bg:C.yellowPale,i:"🧹"},maintenance:{l:"Maintenance",c:C.red,bg:C.redPale,i:"🔧"}};

const INIT_ROOMS=[
  {id:101,name:"101",type:"Standard",floor:1,rate:5000,status:"occupied",guest:{name:"Mr. Odhiambo",phone:"0712345678",checkIn:"May 4",nights:3},folio:[{desc:"Room 3 nights",amount:15000,time:"May 4"}]},
  {id:102,name:"102",type:"Standard",floor:1,rate:5000,status:"available",guest:null,folio:[]},
  {id:103,name:"103",type:"Standard",floor:1,rate:5000,status:"cleaning",guest:null,folio:[]},
  {id:201,name:"201",type:"Deluxe",floor:2,rate:8500,status:"occupied",guest:{name:"Mrs. Kamau",phone:"0734567890",checkIn:"May 3",nights:4},folio:[{desc:"Room 4 nights",amount:34000,time:"May 3"}]},
  {id:202,name:"202",type:"Deluxe",floor:2,rate:8500,status:"available",guest:null,folio:[]},
  {id:301,name:"301",type:"Suite",floor:3,rate:15000,status:"occupied",guest:{name:"Mr. Johnson",phone:"0745678901",checkIn:"May 5",nights:5},folio:[{desc:"Room 5 nights",amount:75000,time:"May 5"}]},
  {id:302,name:"302",type:"Suite",floor:3,rate:15000,status:"available",guest:null,folio:[]},
  {id:401,name:"401",type:"Presidential",floor:4,rate:35000,status:"available",guest:null,folio:[]},
];

const FACILITIES=[
  {id:1,name:"Swimming Pool",icon:"🏊",status:"open",capacity:30,current:8,rate:500,hours:"6:00-20:00"},
  {id:2,name:"Gym & Fitness",icon:"🏋️",status:"open",capacity:15,current:3,rate:800,hours:"5:00-22:00"},
  {id:3,name:"Conference Room A",icon:"🏢",status:"booked",capacity:50,current:0,rate:15000,hours:"8:00-18:00"},
  {id:4,name:"Spa & Wellness",icon:"💆",status:"open",capacity:8,current:2,rate:3000,hours:"9:00-21:00"},
  {id:5,name:"Kids Play Area",icon:"🎠",status:"open",capacity:20,current:5,rate:300,hours:"8:00-18:00"},
];

const INIT_TABLES=Array.from({length:12},(_,i)=>({
  id:i+1,name:i<6?`Table ${i+1}`:i<9?`Table ${i+1}`:`Bar ${i-8}`,
  seats:i<6?[2,4,4,2,6,8][i]:i<9?[2,4,4][i-6]:1,
  zone:i<6?"Indoor":i<9?"Outdoor":"Bar",status:"available",currentOrder:null,
}));

const MENU=[
  {id:1,name:"Mushroom Soup",price:450,dest:"kitchen",cat:"Starters",sold:45},
  {id:2,name:"Caesar Salad",price:550,dest:"kitchen",cat:"Starters",sold:38},
  {id:3,name:"Garlic Bread",price:350,dest:"kitchen",cat:"Starters",sold:62},
  {id:5,name:"Chicken Wings",price:650,dest:"kitchen",cat:"Starters",sold:78},
  {id:7,name:"Grilled Tilapia",price:1200,dest:"kitchen",cat:"Mains",sold:95},
  {id:8,name:"Nyama Choma",price:1500,dest:"kitchen",cat:"Mains",sold:112},
  {id:9,name:"Chicken Tikka",price:950,dest:"kitchen",cat:"Mains",sold:67},
  {id:10,name:"Beef Steak",price:1800,dest:"kitchen",cat:"Mains",sold:54},
  {id:14,name:"Pilau + Beef",price:850,dest:"kitchen",cat:"Mains",sold:88},
  {id:15,name:"Ugali",price:100,dest:"kitchen",cat:"Sides",sold:142},
  {id:16,name:"Chips",price:250,dest:"kitchen",cat:"Sides",sold:118},
  {id:17,name:"Rice",price:200,dest:"kitchen",cat:"Sides",sold:95},
  {id:18,name:"Kachumbari",price:150,dest:"kitchen",cat:"Sides",sold:85},
  {id:21,name:"Tusker Lager",price:350,dest:"bar",cat:"Drinks",sold:198},
  {id:22,name:"White Cap",price:350,dest:"bar",cat:"Drinks",sold:145},
  {id:23,name:"Soda 500ml",price:150,dest:"bar",cat:"Drinks",sold:210},
  {id:24,name:"Water 500ml",price:100,dest:"bar",cat:"Drinks",sold:180},
  {id:25,name:"Fresh Juice",price:300,dest:"bar",cat:"Drinks",sold:92},
  {id:26,name:"Cocktail",price:650,dest:"bar",cat:"Drinks",sold:48},
  {id:27,name:"House Wine",price:550,dest:"bar",cat:"Drinks",sold:63},
  {id:28,name:"Kenyan Coffee",price:250,dest:"bar",cat:"Hot Drinks",sold:156},
  {id:32,name:"Chocolate Cake",price:450,dest:"kitchen",cat:"Desserts",sold:42},
  {id:33,name:"Ice Cream",price:350,dest:"kitchen",cat:"Desserts",sold:55},
];

const STOCK=[
  {id:1,name:"Tusker Lager",cat:"Beverages",unit:"Btl",qty:120,reorder:24,cost:200},
  {id:2,name:"White Cap",cat:"Beverages",unit:"Btl",qty:85,reorder:24,cost:200},
  {id:3,name:"House Wine",cat:"Beverages",unit:"Btl",qty:8,reorder:10,cost:400},
  {id:5,name:"Tilapia",cat:"Protein",unit:"Kg",qty:4,reorder:5,cost:600},
  {id:6,name:"Beef",cat:"Protein",unit:"Kg",qty:20,reorder:5,cost:800},
  {id:7,name:"Rice",cat:"Grains",unit:"Kg",qty:50,reorder:10,cost:120},
];

const fmt=n=>`KSh ${n.toLocaleString()}`;
const timeNow=()=>new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
const Dot=({color})=><span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block"}}/>;
const Btn=({children,primary,danger,small,disabled,onClick,style:sx})=>(
  <button onClick={disabled?undefined:onClick} style={{padding:small?"5px 10px":"10px 18px",borderRadius:small?7:10,border:primary||danger?"none":`1px solid ${C.border}`,background:danger?C.red:primary?C.purple:C.white,color:danger||primary?"#fff":C.textMid,fontSize:small?11:13,fontWeight:primary||danger?700:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx}}>{children}</button>
);
const Badge=({color,bg,children})=><span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:bg,color,fontWeight:700}}>{children}</span>;

/* ═══════════════════════════════════════════════════
   TOUCHSCREEN PIN LOGIN
   ═══════════════════════════════════════════════════ */
const PinLogin=({users,shifts,onLogin,onForgot})=>{
  const [pin,setPin]=useState("");const [err,setErr]=useState("");const [shake,setShake]=useState(false);

  const digit=d=>{if(pin.length>=6)return;const p=pin+d;setPin(p);setErr("");
    // Auto-login when PIN matches any user
    if(p.length>=4){const user=users.find(u=>u.pin===p&&u.active);
      if(user){setTimeout(()=>onLogin(user),200);}
      else if(p.length===6){setErr("Invalid PIN");setShake(true);setTimeout(()=>{setPin("");setShake(false);},600);}
    }
  };

  const activeShifts=shifts.filter(s=>s.active);

  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.purple} 0%,${C.purpleLight} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.white,borderRadius:28,padding:"36px 32px",maxWidth:360,width:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.25)",textAlign:"center"}}>
        {/* Logo */}
        <div style={{width:56,height:56,borderRadius:16,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
          <span style={{color:"#fff",fontSize:22,fontWeight:800}}>CV</span>
        </div>
        <h1 style={{fontSize:22,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:2}}>Codevertex POS</h1>
        <p style={{color:C.textMuted,fontSize:12,marginBottom:24}}>Enter your PIN to sign in</p>

        {/* PIN Dots */}
        <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:8,animation:shake?"shake 0.4s":"none"}}>
          {[0,1,2,3,4,5].map(i=>(
            <div key={i} style={{
              width:16,height:16,borderRadius:"50%",
              background:i<pin.length?C.purple:C.border,
              transform:i<pin.length?"scale(1.15)":"scale(1)",
              transition:"all 0.15s",
              boxShadow:i<pin.length?`0 0 8px ${C.purple}40`:"none",
            }}/>
          ))}
        </div>
        <p style={{fontSize:10,color:C.textDim,marginBottom:4}}>4-6 digit PIN</p>
        {err&&<div style={{padding:"5px 10px",borderRadius:6,background:C.redPale,color:C.red,fontSize:11,fontWeight:600,marginBottom:8}}>⚠ {err}</div>}

        {/* Numpad */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:16,maxWidth:280,margin:"16px auto 0"}}>
          {[1,2,3,4,5,6,7,8,9].map(d=>(
            <button key={d} onClick={()=>digit(String(d))} style={{
              height:58,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.white,
              fontSize:22,fontWeight:700,color:C.text,cursor:"pointer",
              transition:"all 0.1s",fontFamily:"'Outfit',sans-serif",
            }}
            onMouseDown={e=>{e.currentTarget.style.background=C.purplePale;e.currentTarget.style.borderColor=C.purple;}}
            onMouseUp={e=>{e.currentTarget.style.background=C.white;e.currentTarget.style.borderColor=C.border;}}
            onTouchStart={e=>{e.currentTarget.style.background=C.purplePale;}}
            onTouchEnd={e=>{e.currentTarget.style.background=C.white;}}
            >{d}</button>
          ))}
          <button onClick={onForgot} style={{
            height:58,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.white,
            fontSize:10,fontWeight:600,color:C.textMuted,cursor:"pointer",
          }}>Forgot?</button>
          <button onClick={()=>digit("0")} style={{
            height:58,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.white,
            fontSize:22,fontWeight:700,color:C.text,cursor:"pointer",fontFamily:"'Outfit',sans-serif",
          }}>0</button>
          <button onClick={()=>setPin(p=>p.slice(0,-1))} style={{
            height:58,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.white,
            fontSize:18,color:C.textMuted,cursor:"pointer",
          }}>⌫</button>
        </div>

        {activeShifts.length>0&&(
          <div style={{marginTop:16,padding:"6px 10px",background:C.greenPale,borderRadius:8,fontSize:9,color:C.green}}>
            <strong>{activeShifts.length} active:</strong> {activeShifts.map(s=>s.userName).join(", ")}
          </div>
        )}

        <p style={{fontSize:8,color:C.textDim,marginTop:12}}>PINs: 0000(Admin) · 1234/5678/4321(Waiters) · 1111(Cashier) · 2222(Kitchen) · 3333(Bar) · 4444(Reception) · 9999(Manager)</p>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    </div>
  );
};

/* ═══════ FORGOT PIN ═══════ */
const ForgotPin=({users,onBack,onReset})=>{
  const [phone,setPhone]=useState("");const [step,setStep]=useState("phone");const [foundUser,setFoundUser]=useState(null);
  const [newPin,setNewPin]=useState("");const [confirmPin,setConfirmPin]=useState("");const [err,setErr]=useState("");
  const lookup=()=>{const u=users.find(x=>x.phone===phone.trim()&&x.active);if(!u){setErr("Phone not found");return;}setFoundUser(u);setStep("reset");setErr("");};
  const reset=()=>{if(newPin.length<4){setErr("Min 4 digits");return;}if(newPin!==confirmPin){setErr("PINs don't match");return;}onReset(foundUser.id,newPin);};
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.white,borderRadius:20,padding:28,maxWidth:380,width:"100%",border:`1px solid ${C.border}`}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,marginBottom:4}}>🔐</div>
          <h2 style={{fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>Reset Your PIN</h2>
        </div>
        {step==="phone"&&<>
          <p style={{fontSize:12,color:C.textMuted,marginBottom:12}}>Enter the phone number registered to your account</p>
          <input value={phone} onChange={e=>{setPhone(e.target.value);setErr("");}} placeholder="e.g. 0712345678" style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:16,fontWeight:600,textAlign:"center",outline:"none",fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}/>
          {err&&<p style={{fontSize:11,color:C.red,fontWeight:600,marginBottom:6}}>⚠ {err}</p>}
          <div style={{display:"flex",gap:8}}><Btn onClick={onBack}>Back</Btn><Btn primary onClick={lookup} disabled={!phone.trim()} style={{flex:1}}>Find Account</Btn></div>
        </>}
        {step==="reset"&&<>
          <div style={{background:C.greenPale,borderRadius:8,padding:10,marginBottom:14,fontSize:12,color:C.green}}>
            ✓ Account found: <strong>{foundUser.name}</strong> ({ROLES[foundUser.role].label})
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>New PIN (4-6 digits)</label>
            <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,6))} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:18,fontWeight:700,textAlign:"center",outline:"none",letterSpacing:8}}/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Confirm PIN</label>
            <input type="password" value={confirmPin} onChange={e=>{setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,6));setErr("");}} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${err?C.red:C.border}`,fontSize:18,fontWeight:700,textAlign:"center",outline:"none",letterSpacing:8}}/>
          </div>
          {err&&<p style={{fontSize:11,color:C.red,fontWeight:600,marginBottom:6}}>⚠ {err}</p>}
          <div style={{display:"flex",gap:8}}><Btn onClick={()=>{setStep("phone");setPhone("");setFoundUser(null);}}>Back</Btn><Btn primary onClick={reset} style={{flex:1}}>Set New PIN</Btn></div>
        </>}
      </div>
    </div>
  );
};

/* ═══════ START SHIFT ═══════ */
const StartShift=({user,showFloat,onStart,onBack})=>{const [f,setF]=useState("0");return(
  <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:C.white,borderRadius:18,padding:26,maxWidth:360,width:"100%",border:`1px solid ${C.border}`,textAlign:"center"}}>
      <div style={{fontSize:26,marginBottom:4}}>⏰</div>
      <h2 style={{fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>Begin Shift</h2>
      <p style={{fontSize:11,color:C.textMuted,marginTop:2,marginBottom:16}}>{user.name} · {ROLES[user.role].label}</p>
      {showFloat&&<div style={{marginBottom:14,textAlign:"left"}}><label style={{fontSize:11,fontWeight:600,color:C.textMid}}>Opening Float (KSh)</label>
        <input value={f} onChange={e=>setF(e.target.value.replace(/\D/g,""))} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:18,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",outline:"none",marginTop:4}}/></div>}
      <div style={{display:"flex",gap:6}}><Btn onClick={onBack}>Back</Btn><Btn primary onClick={()=>onStart(parseInt(f)||0)} style={{flex:1}}>Start Shift →</Btn></div>
    </div></div>
);};

/* ═══════ HEADER WITH NOTIFICATIONS ═══════ */
const Header=({user,shift,tab,setTab,onLogout,onEndShift,badges,notifications,onViewNotifs})=>{
  const elapsed=Math.round((Date.now()-shift.startTime)/60000);
  const allTabs=[
    {id:"dashboard",label:"📊 Dashboard",perm:"dashboard"},
    {id:"tables",label:"🪑 Tables",perm:"tables"},
    {id:"mybills",label:"📋 My Bills",perm:"mybills"},
    {id:"kitchen",label:"🍳 Kitchen",perm:"kitchen",badge:badges.kitchen},
    {id:"bar",label:"🍺 Bar",perm:"bar",badge:badges.bar},
    {id:"cashier",label:"💰 Bills",perm:"cashier",badge:badges.bills},
    {id:"rooms",label:"🏨 Rooms",perm:"rooms"},
    {id:"facilities",label:"🏊 Facilities",perm:"facilities"},
    {id:"stock",label:"📦 Stock",perm:"stock"},
    {id:"users",label:"⚙ Users",perm:"users"},
  ];
  const tabs=allTabs.filter(t=>ROLES[user.role].tabs.includes(t.perm));
  const unread=notifications.filter(n=>!n.read).length;
  return(
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      <div style={{padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:24,height:24,borderRadius:6,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800}}>CV</div>
          <span style={{fontSize:11,fontWeight:700,color:C.text}}>Codevertex POS</span></div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Badge color={C.green} bg={C.greenPale}>⏱ {elapsed}m</Badge>
          {/* Notification bell */}
          {(user.role==="waiter"||user.role==="admin"||user.role==="manager")&&(
            <button onClick={onViewNotifs} style={{position:"relative",width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:unread>0?C.orangePale:C.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
              🔔
              {unread>0&&<span style={{position:"absolute",top:-3,right:-3,width:16,height:16,borderRadius:"50%",background:C.red,color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
            </button>
          )}
          <span style={{fontSize:10,fontWeight:600,color:C.text}}>{user.name.split(" ")[0]}</span>
          <Badge color={ROLES[user.role].color} bg={`${ROLES[user.role].color}15`}>{ROLES[user.role].label}</Badge>
          <button onClick={onLogout} style={{padding:"3px 6px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:8,fontWeight:600,cursor:"pointer",color:C.textMuted}}>Logout</button>
          <button onClick={onEndShift} style={{padding:"3px 6px",borderRadius:4,border:`1px solid ${C.red}30`,background:C.redPale,fontSize:8,fontWeight:600,cursor:"pointer",color:C.red}}>End Shift</button>
        </div></div>
      <div style={{display:"flex",padding:"0 8px",borderTop:`1px solid ${C.border}`,overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"6px 9px",border:"none",cursor:"pointer",background:"transparent",fontSize:10,fontWeight:600,color:tab===t.id?C.purple:C.textMuted,borderBottom:`2px solid ${tab===t.id?C.purple:"transparent"}`,display:"flex",alignItems:"center",gap:2,whiteSpace:"nowrap"}}>
            {t.label}{t.badge>0&&<span style={{background:C.red,color:"#fff",fontSize:7,fontWeight:800,padding:"0 4px",borderRadius:4,marginLeft:2}}>{t.badge}</span>}
          </button>))}
      </div></div>
  );
};

/* ═══════ NOTIFICATIONS PANEL ═══════ */
const NotifPanel=({notifications,onClose,onClear})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:1000,display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{width:340,maxWidth:"90vw",background:C.white,height:"100%",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.1)",padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h3 style={{fontSize:15,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>🔔 Notifications</h3>
        <div style={{display:"flex",gap:4}}>
          {notifications.length>0&&<button onClick={onClear} style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:9,fontWeight:600,color:C.textMuted,cursor:"pointer"}}>Clear all</button>}
          <button onClick={onClose} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      </div>
      {notifications.length===0?<div style={{textAlign:"center",padding:30,color:C.textDim}}><div style={{fontSize:32,marginBottom:6}}>🔕</div><p style={{fontSize:12}}>No notifications</p></div>:
        notifications.map((n,i)=>(
          <div key={i} style={{padding:10,borderRadius:8,background:n.read?C.white:n.type==="ready"?C.greenPale:C.orangePale,border:`1px solid ${n.read?C.border:n.type==="ready"?C.green+"30":C.orange+"30"}`,marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontSize:12,fontWeight:700,color:C.text}}>{n.type==="ready"?"✅ Order Ready!":"📢 "+n.title}</div>
                <div style={{fontSize:10,color:C.textMid,marginTop:2}}>{n.message}</div></div>
              <span style={{fontSize:8,color:C.textDim,whiteSpace:"nowrap"}}>{n.time}</span>
            </div>
          </div>
        ))}
    </div>
  </div>
);

/* ═══════ DASHBOARD WITH DETAILED ANALYTICS ═══════ */
const Dashboard=({orders,tables,rooms,stock,kitchenQ,barQ,facilities,onDownload})=>{
  const settled=orders.filter(o=>o.settled);
  const foodRev=settled.reduce((s,o)=>s+o.items.filter(i=>i.dest==="kitchen").reduce((a,i)=>a+i.price*i.qty,0),0);
  const barRev=settled.reduce((s,o)=>s+o.items.filter(i=>i.dest==="bar").reduce((a,i)=>a+i.price*i.qty,0),0);
  const roomRev=rooms.filter(r=>r.status==="occupied").reduce((s,r)=>s+r.folio.reduce((a,f)=>a+f.amount,0),0);
  const totalRev=foodRev+barRev+roomRev;
  const occRooms=rooms.filter(r=>r.status==="occupied").length;
  const occRate=Math.round((occRooms/rooms.length)*100);
  const lowStock=stock.filter(s=>s.qty<=s.reorder);
  const topFood=[...MENU].filter(i=>i.dest==="kitchen").sort((a,b)=>b.sold-a.sold).slice(0,5);
  const topDrinks=[...MENU].filter(i=>i.dest==="bar").sort((a,b)=>b.sold-a.sold).slice(0,5);
  const maxSold=Math.max(...MENU.map(i=>i.sold));
  const avgOrderValue=settled.length?Math.round(settled.reduce((s,o)=>s+o.total,0)/settled.length):0;
  const hrs=["8am","9am","10am","11am","12pm","1pm","2pm","3pm"];
  const revData=[2400,4800,6200,8500,15200,22400,26800,totalRev||30100];
  const maxR=Math.max(...revData);

  return(
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><h2 style={{fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>📊 Analytics Dashboard</h2>
          <p style={{fontSize:10,color:C.textMuted}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p></div>
        <div style={{display:"flex",gap:4}}>
          <Btn small onClick={onDownload}>📥 Download Report</Btn>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(125px,1fr))",gap:6,marginBottom:14}}>
        {[
          {l:"Total Revenue",v:fmt(totalRev),i:"💰",c:C.green,bg:C.greenPale},
          {l:"Room Revenue",v:fmt(roomRev),i:"🏨",c:C.purple,bg:C.purplePale},
          {l:"Food Revenue",v:fmt(foodRev),i:"🍽️",c:C.orange,bg:C.orangePale},
          {l:"Bar Revenue",v:fmt(barRev),i:"🍺",c:C.blue,bg:C.bluePale},
          {l:"Occupancy",v:`${occRate}%`,i:"📊",c:occRate>70?C.green:C.orange,bg:occRate>70?C.greenPale:C.orangePale},
          {l:"Orders Today",v:settled.length,i:"📋",c:C.indigo,bg:C.indigoPale},
          {l:"Avg Order",v:fmt(avgOrderValue),i:"📈",c:C.teal,bg:C.tealPale},
          {l:"Low Stock",v:lowStock.length,i:"⚠️",c:lowStock.length>0?C.red:C.green,bg:lowStock.length>0?C.redPale:C.greenPale},
        ].map((s,i)=>(
          <div key={i} style={{background:C.white,borderRadius:10,padding:10,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,width:30,height:30,background:s.bg,borderRadius:"0 0 0 30px",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:"3px 4px 0 0",fontSize:11}}>{s.i}</div>
            <div style={{fontSize:8,color:C.textDim,fontWeight:600,textTransform:"uppercase"}}>{s.l}</div>
            <div style={{fontSize:16,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif",marginTop:2}}>{s.v}</div>
          </div>))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {/* Revenue Chart */}
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <h3 style={{fontSize:12,fontWeight:700}}>📈 Revenue Today</h3>
            <span style={{fontSize:10,fontWeight:700,color:C.green}}>{fmt(totalRev)}</span>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:90}}>
            {revData.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:7,color:C.textDim}}>{(v/1000).toFixed(0)}k</span>
                <div style={{width:"100%",height:`${(v/maxR)*70}px`,background:`linear-gradient(180deg,${C.purple},${C.purpleLight})`,borderRadius:"3px 3px 0 0",minHeight:3}}/>
                <span style={{fontSize:7,color:C.textDim}}>{hrs[i]}</span>
              </div>))}
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:10}}>Revenue Split</h3>
          {[{l:"Rooms",v:roomRev,c:C.purple},{l:"Food",v:foodRev,c:C.orange},{l:"Drinks",v:barRev,c:C.blue}].map((r,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                <span style={{fontWeight:600}}>{r.l}</span><span style={{fontWeight:700,color:r.c}}>{fmt(r.v)} ({totalRev?Math.round(r.v/totalRev*100):0}%)</span></div>
              <div style={{height:6,background:C.bg,borderRadius:3}}><div style={{height:"100%",width:`${totalRev?r.v/totalRev*100:0}%`,background:r.c,borderRadius:3}}/></div>
            </div>))}
          <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
            {Object.entries(ROOM_ST).map(([k,st])=>{const cnt=rooms.filter(r=>r.status===k).length;return cnt>0?(
              <div key={k} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:st.bg,borderRadius:4}}>
                <span style={{fontSize:12}}>{st.i}</span><span style={{fontSize:9,fontWeight:700,color:st.c}}>{cnt} {st.l}</span>
              </div>):null;})}
          </div>
        </div>
      </div>

      {/* Popular Items */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🔥 Top Food</h3>
          {topFood.map((item,i)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <span style={{fontSize:10,fontWeight:800,color:C.purple,minWidth:14}}>{i+1}</span>
              <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{item.name}</div>
                <div style={{height:3,background:C.bg,borderRadius:2,marginTop:1}}><div style={{height:"100%",width:`${(item.sold/maxSold)*100}%`,background:C.orange,borderRadius:2}}/></div></div>
              <div style={{textAlign:"right"}}><span style={{fontSize:9,fontWeight:700,color:C.orange}}>{item.sold}</span><div style={{fontSize:7,color:C.textDim}}>{fmt(item.price)}</div></div>
            </div>))}
        </div>
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🍺 Top Drinks</h3>
          {topDrinks.map((item,i)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <span style={{fontSize:10,fontWeight:800,color:C.purple,minWidth:14}}>{i+1}</span>
              <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{item.name}</div>
                <div style={{height:3,background:C.bg,borderRadius:2,marginTop:1}}><div style={{height:"100%",width:`${(item.sold/maxSold)*100}%`,background:C.blue,borderRadius:2}}/></div></div>
              <div style={{textAlign:"right"}}><span style={{fontSize:9,fontWeight:700,color:C.blue}}>{item.sold}</span><div style={{fontSize:7,color:C.textDim}}>{fmt(item.price)}</div></div>
            </div>))}
        </div>
      </div>

      {/* Facilities */}
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
        <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🏊 Facilities</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>
          {facilities.map(f=>(
            <div key={f.id} style={{padding:8,borderRadius:8,background:f.status==="booked"?C.orangePale:C.greenPale,border:`1px solid ${f.status==="booked"?C.orange:C.green}15`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:14}}>{f.icon}</span>
                <Badge color={f.status==="booked"?C.orange:C.green} bg="transparent">{f.status}</Badge></div>
              <div style={{fontSize:10,fontWeight:700}}>{f.name}</div>
              <div style={{fontSize:8,color:C.textMuted}}>{f.current}/{f.capacity} · {fmt(f.rate)}</div>
            </div>))}
        </div>
      </div>
    </div>
  );
};

/* ═══════ WAITER: MY BILLS (Recall past orders) ═══════ */
const MyBills=({orders,user})=>{
  const myOrders=orders.filter(o=>o.waiter===user.name);
  const active=myOrders.filter(o=>!o.settled&&!o.voided);
  const settled=myOrders.filter(o=>o.settled);
  const voided=myOrders.filter(o=>o.voided);
  return(
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:2}}>📋 My Bills</h2>
      <p style={{fontSize:10,color:C.textMuted,marginBottom:12}}>{myOrders.length} total · {fmt(myOrders.filter(o=>o.settled).reduce((s,o)=>s+o.total,0))} settled</p>

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{l:"Active",v:active.length,c:C.blue,bg:C.bluePale},{l:"Settled",v:settled.length,c:C.green,bg:C.greenPale},{l:"Voided",v:voided.length,c:C.red,bg:C.redPale}].map((s,i)=>(
          <div key={i} style={{padding:"8px 12px",borderRadius:8,background:s.bg,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:16,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif"}}>{s.v}</span>
            <span style={{fontSize:10,fontWeight:600,color:s.c}}>{s.l}</span>
          </div>))}
      </div>

      {myOrders.length===0?<div style={{textAlign:"center",padding:30}}><div style={{fontSize:32}}>📋</div><p style={{fontSize:12,color:C.textMuted,marginTop:4}}>No bills yet this shift</p></div>:
        [...myOrders].reverse().map(o=>(
          <div key={o.id} style={{background:C.white,borderRadius:10,padding:12,border:`1px solid ${C.border}`,marginBottom:6,opacity:o.voided?0.5:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <div><span style={{fontSize:13,fontWeight:800}}>{o.orderNo}</span>
                <span style={{fontSize:10,color:C.textMuted,marginLeft:6}}>{o.table} · {o.guests}p · {o.time}</span></div>
              <Badge color={o.voided?C.red:o.settled?C.green:C.blue} bg={o.voided?C.redPale:o.settled?C.greenPale:C.bluePale}>
                {o.voided?"Voided":o.settled?"Settled":"Active"}
              </Badge>
            </div>
            <div style={{borderTop:`1px solid ${C.borderLight}`,paddingTop:4}}>
              {o.items.map((i,idx)=><div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMid,padding:"1px 0"}}>
                <span>{i.qty}x {i.name}</span><span>{fmt(i.price*i.qty)}</span></div>)}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,paddingTop:4,borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:12,fontWeight:800,color:C.purple}}>{fmt(o.total)}</span>
              {o.voided&&<span style={{fontSize:9,color:C.red}}>Voided by {o.voidedBy} — {o.voidReason}</span>}
            </div>
          </div>
        ))}
    </div>
  );
};

/* ═══════ TABLES ═══════ */
const TablesView=({tables,canOrder,onNew,onAdd})=>{const [z,setZ]=useState("All");const f=z==="All"?tables:tables.filter(t=>t.zone===z);return(
  <div style={{padding:14,overflowY:"auto",flex:1}}>
    <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>Floor Plan</h2>
    <div style={{display:"flex",gap:3,marginBottom:10}}>{["All","Indoor","Outdoor","Bar"].map(x=><button key={x} onClick={()=>setZ(x)} style={{padding:"4px 9px",borderRadius:5,border:z===x?"none":`1px solid ${C.border}`,background:z===x?C.purple:C.white,color:z===x?"#fff":C.textMid,fontSize:10,fontWeight:600,cursor:"pointer"}}>{x}</button>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:6}}>
      {f.map(t=>{const a=t.status==="available";const bc=a?C.green:C.blue;return(
        <div key={t.id} onClick={()=>{if(!canOrder)return;a?onNew(t):t.currentOrder&&onAdd(t);}} style={{background:C.white,borderRadius:10,padding:10,border:`2px solid ${bc}20`,cursor:canOrder?"pointer":"default",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>{if(canOrder){e.currentTarget.style.borderColor=C.purple;e.currentTarget.style.transform="translateY(-1px)";}}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=`${bc}20`;e.currentTarget.style.transform="none";}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:bc,opacity:0.4}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,fontWeight:800}}>{t.name}</span><Dot color={bc}/></div>
          <div style={{fontSize:9,color:C.textMuted}}>{t.seats}s · {t.zone}</div>
          {a&&canOrder&&<div style={{marginTop:4,padding:"3px",textAlign:"center",background:C.purplePale,borderRadius:4,color:C.purple,fontSize:9,fontWeight:600}}>Seat guests</div>}
          {!a&&t.currentOrder&&<div style={{marginTop:4}}><div style={{fontSize:9,color:C.blue,fontWeight:600}}>{t.currentOrder.orderNo} · {fmt(t.currentOrder.total)}</div>
            {canOrder&&<div style={{marginTop:2,padding:"2px",textAlign:"center",background:C.bluePale,borderRadius:3,color:C.blue,fontSize:8,fontWeight:600}}>+ Add to bill</div>}
          </div>}
        </div>);})}
    </div></div>
);};

/* ═══════ ORDER SCREEN ═══════ */
const OrderScreen=({user,table,guests,existing,isAdd,onPlace,onBack})=>{
  const cats={};MENU.forEach(i=>{if(!cats[i.cat])cats[i.cat]=[];cats[i.cat].push(i);});
  const [cat,setCat]=useState(Object.keys(cats)[0]);const [items,setItems]=useState([]);const [search,setSearch]=useState("");
  const [voidItem,setVoidItem]=useState(null);const [voided,setVoided]=useState([]);
  const add=i=>setItems(p=>{const e=p.find(x=>x.id===i.id);return e?p.map(x=>x.id===i.id?{...x,qty:x.qty+1}:x):[...p,{...i,qty:1}];});
  const updQ=(id,d)=>setItems(p=>p.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+d)}:i));
  const sub=items.reduce((s,i)=>s+i.price*i.qty,0);
  const all=search?MENU.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())):cats[cat]||[];
  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg}}>
      {voidItem&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
        <div style={{background:C.white,borderRadius:14,padding:18,maxWidth:300,width:"100%"}}>
          <h3 style={{fontSize:13,fontWeight:700,marginBottom:6}}>🗑 Remove {voidItem.name}?</h3>
          {["Customer changed mind","Wrong item","Out of stock","Other"].map(r=><div key={r} onClick={()=>{setVoided(p=>[...p,{...voidItem,reason:r}]);setItems(p=>p.filter(i=>i.id!==voidItem.id));setVoidItem(null);}} style={{padding:"7px 10px",borderRadius:6,border:`1px solid ${C.border}`,marginBottom:3,fontSize:11,cursor:"pointer"}}>{r}</div>)}
          <Btn small onClick={()=>setVoidItem(null)} style={{width:"100%",marginTop:4}}>Cancel</Btn>
        </div></div>}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={onBack} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <span style={{fontSize:13,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{table.name}</span>
        <span style={{fontSize:9,color:C.textMuted}}>{guests}p · {user.name.split(" ")[0]}</span>
        {isAdd&&<Badge color={C.blue} bg={C.bluePale}>+ADD TO BILL</Badge>}
      </div>
      {isAdd&&existing?.length>0&&<div style={{padding:"5px 12px",background:C.bluePale,fontSize:9,color:C.blue}}>Current bill: {existing.length} items · {fmt(existing.reduce((s,i)=>s+i.price*i.qty,0))}</div>}
      <div style={{flex:1,display:"flex",overflow:"hidden",flexWrap:"wrap"}}>
        <div style={{flex:"1 1 55%",minWidth:240,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`,background:C.white}}>
          <div style={{padding:6}}><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
          {!search&&<div style={{display:"flex",gap:2,padding:"0 6px 4px",overflowX:"auto",flexShrink:0}}>
            {Object.keys(cats).map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"4px 8px",borderRadius:5,border:cat===c?"none":`1px solid ${C.border}`,background:cat===c?C.purple:C.white,color:cat===c?"#fff":C.textMid,fontSize:9,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{c}</button>)}</div>}
          <div style={{flex:1,overflowY:"auto",padding:"2px 6px 6px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(108px,1fr))",gap:4}}>
              {all.map(item=>{const ic=items.find(i=>i.id===item.id);return(
                <div key={item.id} onClick={()=>add(item)} style={{background:ic?C.purplePale:C.bg,borderRadius:7,padding:7,cursor:"pointer",border:`1px solid ${ic?C.purple+"40":C.border}`,position:"relative"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple} onMouseLeave={e=>e.currentTarget.style.borderColor=ic?C.purple+"40":C.border}
                  onTouchStart={e=>e.currentTarget.style.background=C.purplePale} onTouchEnd={e=>e.currentTarget.style.background=ic?C.purplePale:C.bg}>
                  {ic&&<div style={{position:"absolute",top:3,right:3,width:15,height:15,borderRadius:4,background:C.purple,color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{ic.qty}</div>}
                  <div style={{fontSize:10,fontWeight:600,lineHeight:1.2,marginBottom:2}}>{item.name}</div>
                  <span style={{fontSize:10,fontWeight:700,color:C.purple}}>{fmt(item.price)}</span>
                </div>);})}
            </div></div></div>
        <div style={{flex:"1 1 35%",minWidth:210,display:"flex",flexDirection:"column",background:C.bg}}>
          <div style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`,background:C.white,fontSize:12,fontWeight:700}}>Order · {items.reduce((s,i)=>s+i.qty,0)} items</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {items.length===0?<div style={{textAlign:"center",padding:20,color:C.textDim,fontSize:10}}>🍽️ Tap items from menu</div>:
              items.map(i=>(
                <div key={i.id} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 7px",background:C.white,margin:"0 4px 2px",borderRadius:5,border:`1px solid ${C.border}`}}>
                  <div style={{flex:1,fontSize:10,fontWeight:600}}>{i.name}</div>
                  <button onClick={()=>updQ(i.id,-1)} style={{width:20,height:20,borderRadius:5,border:`1px solid ${C.border}`,background:C.white,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{fontSize:10,fontWeight:700,minWidth:10,textAlign:"center"}}>{i.qty}</span>
                  <button onClick={()=>updQ(i.id,1)} style={{width:20,height:20,borderRadius:5,border:`1px solid ${C.border}`,background:C.white,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  <span style={{fontSize:10,fontWeight:700,color:C.purple,minWidth:40,textAlign:"right"}}>{fmt(i.price*i.qty)}</span>
                  <button onClick={()=>setVoidItem(i)} style={{width:16,height:16,borderRadius:3,border:"none",background:C.redPale,color:C.red,fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>))}
          </div>
          {items.length>0&&<div style={{padding:8,borderTop:`1px solid ${C.border}`,background:C.white}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:6}}><span>Total</span><span style={{color:C.purple}}>{fmt(sub)}</span></div>
            <button onClick={()=>onPlace(items,sub,voided)} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:C.purple,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{isAdd?"Add to Bill →":"Place Order →"}</button>
            <p style={{fontSize:7,color:C.textDim,textAlign:"center",marginTop:3}}>Waiters auto-logout after placing</p>
          </div>}
        </div>
      </div>
    </div>
  );
};

/* ═══════ KDS WITH NOTIFY WAITER ═══════ */
const KDS=({orders,onUpdate,onComplete,title,icon,emptyIcon})=>{
  const [,tick]=useState(0);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),10000);return()=>clearInterval(t);},[]);
  const active=orders.filter(o=>o.status!=="completed");
  const someCooking=(o)=>o.items.some(i=>i.itemStatus==="cooking");
  const allCooking=(o)=>o.items.every(i=>i.itemStatus==="cooking"||i.itemStatus==="ready");
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"10px 14px",background:C.white,borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",flexShrink:0}}>
        <div><h2 style={{fontSize:15,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{icon} {title}</h2><p style={{fontSize:9,color:C.textMuted}}>{active.length} active</p></div>
        <span style={{fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{timeNow()}</span></div>
      <div style={{flex:1,overflowY:"auto",padding:8}}>
        {active.length===0?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:32}}>{emptyIcon}</div><p style={{fontSize:11,color:C.textMuted,marginTop:4}}>All clear!</p></div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:6}}>
          {active.map(o=>{const el=Math.round((Date.now()-o.placedAt)/60000);const ar=o.items.every(i=>i.itemStatus==="ready");const bc=o.status==="new"?C.yellow:ar?C.green:C.orange;
            return(<div key={o.id} style={{background:C.white,borderRadius:10,border:`2px solid ${bc}`,overflow:"hidden"}}>
              <div style={{padding:"6px 10px",background:o.status==="new"?C.yellowPale:ar?C.greenPale:C.orangePale,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><span style={{fontSize:13,fontWeight:800}}>{o.table}</span>
                  <span style={{fontSize:7,fontWeight:800,padding:"2px 4px",borderRadius:3,background:bc,color:"#fff",marginLeft:4}}>{o.status==="new"?"NEW":ar?"READY":"COOKING"}</span>
                  <div style={{fontSize:8,color:C.textMuted}}>{o.orderNo} · {o.waiter}</div></div>
                <span style={{fontSize:14,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:el>15?C.red:C.text}}>{el}m</span></div>
              {o.items.map((item,idx)=>(
                <div key={idx} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderBottom:idx<o.items.length-1?`1px solid ${C.borderLight}`:"none"}}>
                  <span style={{flex:1,fontSize:11,fontWeight:600,color:item.itemStatus==="ready"?C.green:C.text,textDecoration:item.itemStatus==="ready"?"line-through":"none"}}>{item.qty}x {item.name}</span>
                  {item.itemStatus==="pending"&&<button onClick={()=>onUpdate(o.id,idx,"cooking")} style={{padding:"2px 6px",borderRadius:3,border:"none",background:C.orangePale,color:C.orange,fontSize:8,fontWeight:700,cursor:"pointer"}}>Start</button>}
                  {item.itemStatus==="cooking"&&<button onClick={()=>onUpdate(o.id,idx,"ready")} style={{padding:"2px 6px",borderRadius:3,border:"none",background:C.greenPale,color:C.green,fontSize:8,fontWeight:700,cursor:"pointer"}}>Done✓</button>}
                  {item.itemStatus==="ready"&&<span style={{color:C.green,fontSize:10}}>✓</span>}
                </div>))}
              {/* Action buttons area */}
              <div style={{padding:"6px 10px",display:"flex",flexDirection:"column",gap:4}}>
                {/* NEW order: Start All */}
                {o.status==="new"&&<button onClick={()=>o.items.forEach((_,i)=>onUpdate(o.id,i,"cooking"))} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.orange,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔥 Start All Items</button>}
                {/* All cooking: Mark All Done */}
                {allCooking(o)&&!ar&&someCooking(o)&&<button onClick={()=>o.items.forEach((_,i)=>{if(o.items[i].itemStatus==="cooking")onUpdate(o.id,i,"ready");})} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.teal,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Mark All Done</button>}
                {/* All ready: Notify Waiter */}
                {ar&&<button onClick={()=>onComplete(o.id)} style={{width:"100%",padding:"10px",borderRadius:6,border:"none",background:C.green,color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 2px 8px rgba(16,185,129,0.3)"}}>🔔 NOTIFY WAITER — ORDER READY</button>}
              </div>
            </div>);})}
        </div>}</div></div>);};

/* ═══════ CASHIER ═══════ */
const CashierView=({tables,orders,onSettle,onVoidBill,canVoid})=>{
  const occ=tables.filter(t=>t.status==="occupied"&&t.currentOrder);const settled=orders.filter(o=>o.settled);const tot=settled.reduce((s,o)=>s+o.total,0);
  return(<div style={{flex:1,overflowY:"auto",padding:14}}>
    <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>💰 Bills</h2>
    <div style={{display:"flex",gap:6,marginBottom:12}}>{[{l:"Open",v:occ.length,c:C.orange},{l:"Settled",v:settled.length,c:C.green},{l:"Revenue",v:fmt(tot),c:C.purple}].map((s,i)=>(
      <div key={i} style={{background:C.white,borderRadius:8,padding:8,flex:1,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:8,color:C.textDim}}>{s.l}</div><div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div></div>))}</div>
    {occ.length===0?<div style={{textAlign:"center",padding:20,color:C.textMuted,fontSize:12}}>No open bills</div>:
    occ.map(t=>{const o=t.currentOrder;return(
      <div key={t.id} style={{background:C.white,borderRadius:10,padding:10,border:`1px solid ${C.border}`,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div><span style={{fontSize:12,fontWeight:800}}>{t.name} · {o.orderNo}</span><div style={{fontSize:9,color:C.textMuted}}>{o.guests}p · {o.waiter}</div></div>
          <span style={{fontSize:14,fontWeight:800,color:C.purple}}>{fmt(o.total)}</span></div>
        {o.items.map((i,idx)=><div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMid}}><span>{i.qty}x {i.name}</span><span>{fmt(i.price*i.qty)}</span></div>)}
        <div style={{display:"flex",gap:4,marginTop:8}}>
          <Btn primary small onClick={()=>onSettle(t)} style={{flex:1}}>Settle — {fmt(o.total)}</Btn>
          {canVoid&&<Btn danger small onClick={()=>onVoidBill(t)}>Void</Btn>}
        </div>
      </div>);})}
  </div>);
};

/* ═══════ VOID BILL MODAL ═══════ */
const VoidBillModal=({table,onVoid,onCancel})=>{
  const [reason,setReason]=useState("");
  const reasons=["Customer complaint","Duplicate order","System error","Manager override","Other"];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:C.white,borderRadius:16,padding:22,maxWidth:360,width:"100%"}}>
        <h3 style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:4}}>⚠ Void Entire Bill</h3>
        <p style={{fontSize:11,color:C.textMuted,marginBottom:10}}>This will cancel {table.currentOrder.orderNo} ({table.name}) — {fmt(table.currentOrder.total)}</p>
        <div style={{background:C.redPale,borderRadius:8,padding:8,marginBottom:12,fontSize:10,color:C.red}}>This action is logged and cannot be undone. Only managers and admins can void bills.</div>
        <label style={{fontSize:10,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Reason for voiding *</label>
        {reasons.map(r=><div key={r} onClick={()=>setReason(r)} style={{padding:"7px 10px",borderRadius:6,border:`1.5px solid ${reason===r?C.red:C.border}`,background:reason===r?C.redPale:C.white,fontSize:11,fontWeight:reason===r?600:400,color:reason===r?C.red:C.textMid,marginBottom:3,cursor:"pointer"}}>{r}</div>)}
        <div style={{display:"flex",gap:6,marginTop:10}}><Btn onClick={onCancel} style={{flex:1}}>Cancel</Btn><Btn danger disabled={!reason} onClick={()=>onVoid(reason)} style={{flex:1}}>Void Bill</Btn></div>
      </div>
    </div>
  );
};

/* ═══════ PAYMENT MODAL ═══════ */
const PayModal=({table,order,onDone,onCancel})=>{
  const [method,setMethod]=useState(null);const [mode,setMode]=useState("full");const [splitN,setSplitN]=useState(2);
  const [payments,setPayments]=useState([]);const [done,setDone]=useState(false);const [customAmt,setCustomAmt]=useState("");const [customM,setCustomM]=useState(null);
  const total=order.total;const methods=[{id:"mpesa",icon:"📱",l:"M-Pesa"},{id:"cash",icon:"💵",l:"Cash"},{id:"card",icon:"💳",l:"Card"},{id:"room",icon:"🏨",l:"Room"}];
  const paid=payments.reduce((s,p)=>s+p.amount,0);const rem=total-paid;
  if(done)return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}><div style={{background:C.white,borderRadius:16,padding:22,maxWidth:340,textAlign:"center"}}>
    <div style={{fontSize:32,marginBottom:6}}>✅</div><h2 style={{fontSize:16,fontWeight:800}}>Bill Settled!</h2><p style={{fontSize:11,color:C.textMuted}}>{fmt(total)}</p><p style={{fontSize:9,color:C.green,marginTop:4}}>eTIMS: INV-{Math.floor(Math.random()*90000)+10000}</p>
    <div style={{display:"flex",gap:4,marginTop:10,justifyContent:"center"}}><Btn small>Print</Btn><Btn small>SMS</Btn><Btn primary small onClick={()=>onDone(payments.length?payments:[{amount:total,method:method||"cash"}])}>Done</Btn></div></div></div>);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14,overflowY:"auto"}}>
    <div style={{background:C.white,borderRadius:16,padding:20,maxWidth:400,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h2 style={{fontSize:15,fontWeight:800}}>Settle Bill</h2>
        <button onClick={onCancel} style={{background:"none",border:"none",fontSize:14,cursor:"pointer"}}>✕</button></div>
      <div style={{textAlign:"center",padding:12,background:C.purplePale,borderRadius:10,marginBottom:12}}>
        <div style={{fontSize:8,color:C.purple,fontWeight:600}}>TOTAL</div><div style={{fontSize:26,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{fmt(total)}</div></div>
      <div style={{display:"flex",gap:3,marginBottom:12}}>{[{id:"full",l:"Full"},{id:"split",l:"Split Equal"},{id:"custom",l:"Custom"}].map(m=>(
        <button key={m.id} onClick={()=>{setMode(m.id);setPayments([]);}} style={{flex:1,padding:"6px",borderRadius:6,border:`1.5px solid ${mode===m.id?C.purple:C.border}`,background:mode===m.id?C.purplePale:C.white,color:mode===m.id?C.purple:C.textMid,fontSize:10,fontWeight:600,cursor:"pointer"}}>{m.l}</button>))}</div>
      {mode==="full"&&<><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:10}}>
        {methods.map(m=><div key={m.id} onClick={()=>setMethod(m.id)} style={{padding:8,borderRadius:7,border:`2px solid ${method===m.id?C.purple:C.border}`,textAlign:"center",cursor:"pointer",background:method===m.id?C.purplePale:C.white}}>
          <div style={{fontSize:16}}>{m.icon}</div><div style={{fontSize:8,fontWeight:600}}>{m.l}</div></div>)}</div>
        <button onClick={()=>setDone(true)} disabled={!method} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:method?C.purple:C.textDim,color:"#fff",fontSize:12,fontWeight:700,cursor:method?"pointer":"not-allowed"}}>Pay {fmt(total)}</button></>}
      {mode==="split"&&<><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
        <button onClick={()=>setSplitN(Math.max(2,splitN-1))} style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer"}}>−</button>
        <span style={{fontSize:20,fontWeight:800,color:C.purple}}>{splitN}</span>
        <button onClick={()=>setSplitN(splitN+1)} style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer"}}>+</button></div>
        <div style={{textAlign:"center",fontSize:10,marginBottom:8}}>Each: <strong style={{color:C.purple}}>{fmt(Math.ceil(total/splitN))}</strong></div>
        {Array.from({length:splitN}).map((_,i)=>{const p=payments[i];return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",background:p?C.greenPale:C.bg,borderRadius:5,marginBottom:2}}>
            <span style={{fontSize:10,fontWeight:700,minWidth:50}}>Person {i+1}</span>
            <span style={{flex:1,fontSize:10,color:p?C.green:C.textMid}}>{p?`✓ ${p.method}`:fmt(Math.ceil(total/splitN))}</span>
            {!p&&methods.map(m=><button key={m.id} onClick={()=>setPayments(pr=>[...pr,{amount:Math.ceil(total/splitN),method:m.l}])} style={{padding:"2px 5px",borderRadius:3,border:`1px solid ${C.border}`,background:C.white,fontSize:8,cursor:"pointer"}}>{m.icon}</button>)}
          </div>);})}
        {payments.length===splitN&&<button onClick={()=>setDone(true)} style={{width:"100%",padding:"9px",borderRadius:7,border:"none",background:C.green,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>✓ Complete</button>}</>}
      {mode==="custom"&&<><div style={{background:C.bg,borderRadius:7,padding:8,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}><span>Paid</span><span style={{color:C.green,fontWeight:700}}>{fmt(paid)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,color:rem>0?C.orange:C.green}}><span>Remaining</span><span>{fmt(rem)}</span></div></div>
        {payments.map((p,i)=><div key={i} style={{fontSize:9,color:C.green}}>✓ {fmt(p.amount)} via {p.method}</div>)}
        {rem>0&&<div style={{marginTop:4}}>
          <input value={customAmt} onChange={e=>setCustomAmt(e.target.value.replace(/\D/g,""))} placeholder="Amount" style={{width:"100%",padding:"7px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,textAlign:"center",outline:"none",marginBottom:4}}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginBottom:4}}>
            {methods.map(m=><div key={m.id} onClick={()=>setCustomM(m.id)} style={{padding:5,borderRadius:5,border:`1.5px solid ${customM===m.id?C.purple:C.border}`,textAlign:"center",cursor:"pointer",background:customM===m.id?C.purplePale:C.white}}><span style={{fontSize:12}}>{m.icon}</span></div>)}</div>
          <button onClick={()=>{const a=Math.min(parseInt(customAmt)||0,rem);if(a>0&&customM){setPayments(p=>[...p,{amount:a,method:methods.find(m=>m.id===customM).l}]);setCustomAmt("");setCustomM(null);}}} disabled={!customM||!parseInt(customAmt)} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.purple,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",opacity:!customM?0.5:1}}>Add Payment</button></div>}
        {rem<=0&&<button onClick={()=>setDone(true)} style={{width:"100%",padding:"9px",borderRadius:7,border:"none",background:C.green,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>✓ Complete</button>}</>}
    </div></div>);
};

/* ═══════ ROOMS + FACILITIES + STOCK + USERS (compact) ═══════ */
const RoomsView=({rooms,onCheckIn,onCheckOut,onStatus})=>{const [f,setF]=useState("all");const [showCI,setShowCI]=useState(null);const [g,setG]=useState({name:"",phone:"",nights:1});
  const filtered=f==="all"?rooms:rooms.filter(r=>r.status===f);
  return(<div style={{flex:1,overflowY:"auto",padding:14}}>
    <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>🏨 Rooms</h2>
    <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap"}}>
      <button onClick={()=>setF("all")} style={{padding:"4px 9px",borderRadius:5,border:f==="all"?"none":`1px solid ${C.border}`,background:f==="all"?C.purple:C.white,color:f==="all"?"#fff":C.textMid,fontSize:9,fontWeight:600,cursor:"pointer"}}>All ({rooms.length})</button>
      {Object.entries(ROOM_ST).map(([k,st])=>{const cnt=rooms.filter(r=>r.status===k).length;return cnt>0?<button key={k} onClick={()=>setF(k)} style={{padding:"4px 9px",borderRadius:5,border:f===k?"none":`1px solid ${C.border}`,background:f===k?st.c:C.white,color:f===k?"#fff":st.c,fontSize:9,fontWeight:600,cursor:"pointer"}}>{st.i} {st.l} ({cnt})</button>:null;})}
    </div>
    {showCI&&<div style={{background:C.white,borderRadius:10,padding:14,border:`2px solid ${C.teal}30`,marginBottom:10}}>
      <h3 style={{fontSize:12,fontWeight:700,marginBottom:6}}>🛎️ Check In — Rm {showCI.name} ({showCI.type} · {fmt(showCI.rate)}/n)</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Guest Name *</label><input value={g.name} onChange={e=>setG(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Phone *</label><input value={g.phone} onChange={e=>setG(p=>({...p,phone:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
      </div>
      <div style={{marginBottom:6}}><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Nights</label><input type="number" value={g.nights} onChange={e=>setG(p=>({...p,nights:parseInt(e.target.value)||1}))} min="1" style={{width:60,padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none",marginLeft:6}}/></div>
      <div style={{background:C.tealPale,borderRadius:5,padding:6,marginBottom:6,fontSize:10,color:C.teal}}>Total: {fmt(showCI.rate*g.nights)}</div>
      <div style={{display:"flex",gap:4}}><Btn small onClick={()=>{setShowCI(null);setG({name:"",phone:"",nights:1});}}>Cancel</Btn>
        <Btn primary small disabled={!g.name||!g.phone} onClick={()=>{onCheckIn(showCI.id,g,showCI.rate*g.nights);setShowCI(null);setG({name:"",phone:"",nights:1});}} style={{flex:1}}>Check In</Btn></div>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:6}}>
      {filtered.map(r=>{const st=ROOM_ST[r.status]||ROOM_ST.available;const fol=r.folio.reduce((s,f)=>s+f.amount,0);return(
        <div key={r.id} style={{background:C.white,borderRadius:10,padding:12,border:`2px solid ${st.c}15`,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:st.c,opacity:0.4}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:16,fontWeight:800}}>Rm {r.name}</span><Badge color={st.c} bg={st.bg}>{st.i} {st.l}</Badge></div>
          <div style={{fontSize:9,color:C.textMuted,marginBottom:4}}>{r.type} · Fl {r.floor} · {fmt(r.rate)}/n</div>
          {r.status==="occupied"&&r.guest&&<><div style={{background:C.bg,borderRadius:6,padding:6,marginBottom:4}}>
            <div style={{fontSize:11,fontWeight:700}}>{r.guest.name}</div><div style={{fontSize:8,color:C.textMuted}}>📞 {r.guest.phone} · {r.guest.checkIn} · {r.guest.nights}n</div></div>
            <div style={{fontSize:9,fontWeight:600,color:C.purple,marginBottom:4}}>Folio: {fmt(fol)}</div>
            <div style={{display:"flex",gap:3}}><button onClick={()=>onCheckOut(r.id)} style={{flex:1,padding:"4px",borderRadius:4,border:`1px solid ${C.red}30`,background:C.redPale,fontSize:8,fontWeight:600,color:C.red,cursor:"pointer"}}>Check Out</button></div></>}
          {r.status==="available"&&<Btn primary small onClick={()=>setShowCI(r)} style={{width:"100%",marginTop:4}}>🛎️ Check In</Btn>}
          {r.status==="cleaning"&&<Btn small onClick={()=>onStatus(r.id,"available")} style={{width:"100%",marginTop:4}}>Mark Clean ✓</Btn>}
          {r.status==="maintenance"&&<Btn small onClick={()=>onStatus(r.id,"available")} style={{width:"100%",marginTop:4}}>Mark Fixed ✓</Btn>}
          {r.status==="reserved"&&r.guest&&<><div style={{background:C.orangePale,borderRadius:6,padding:6,marginBottom:4,fontSize:10,color:C.orange}}>Reserved: {r.guest.name}</div>
            <Btn primary small onClick={()=>setShowCI(r)} style={{width:"100%"}}>Check In Now</Btn></>}
        </div>);})}
    </div></div>);};

const FacilitiesView=({facilities})=>(<div style={{flex:1,overflowY:"auto",padding:14}}>
  <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>🏊 Facilities</h2>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
    {facilities.map(f=>(<div key={f.id} style={{background:C.white,borderRadius:10,padding:12,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:20}}>{f.icon}</span><div><div style={{fontSize:12,fontWeight:700}}>{f.name}</div><div style={{fontSize:9,color:C.textMuted}}>{f.hours} · {fmt(f.rate)}</div></div></div>
        <Badge color={f.status==="booked"?C.orange:C.green} bg={f.status==="booked"?C.orangePale:C.greenPale}>{f.status}</Badge></div>
      <div style={{marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",fontSize:8,marginBottom:1}}><span>Capacity</span><span>{f.current}/{f.capacity}</span></div>
        <div style={{height:4,background:C.bg,borderRadius:2}}><div style={{height:"100%",width:`${(f.current/f.capacity)*100}%`,background:f.current/f.capacity>0.8?C.red:C.green,borderRadius:2}}/></div></div>
      <Btn small primary style={{width:"100%"}}>+ Book</Btn>
    </div>))}</div></div>);

const StockView=({stock})=>(<div style={{flex:1,overflowY:"auto",padding:14}}>
  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>📦 Stock</h2><Btn primary small>+ Add</Btn></div>
  {stock.filter(s=>s.qty<=s.reorder).length>0&&<div style={{background:C.redPale,borderRadius:7,padding:6,marginBottom:8,fontSize:9,color:C.red}}>⚠ Low: {stock.filter(s=>s.qty<=s.reorder).map(s=>s.name).join(", ")}</div>}
  <div style={{background:C.white,borderRadius:8,border:`1px solid ${C.border}`,overflow:"hidden"}}>
    {stock.map(s=>{const l=s.qty<=s.reorder;return(<div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderBottom:`1px solid ${C.borderLight}`}}>
      <div><div style={{fontSize:11,fontWeight:600}}>{s.name}</div><div style={{fontSize:8,color:C.textMuted}}>{s.cat}</div></div>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:700,color:l?C.red:C.text}}>{s.qty} {s.unit}</span><Badge color={l?C.red:C.green} bg={l?C.redPale:C.greenPale}>{l?"Low":"OK"}</Badge></div>
    </div>);})}</div></div>);

const UsersView=({users,onAdd,onToggle})=>{const [show,setShow]=useState(false);const [nu,setNu]=useState({name:"",role:"waiter",phone:""});return(
  <div style={{flex:1,overflowY:"auto",padding:14}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>⚙ Users</h2><Btn primary small onClick={()=>setShow(!show)}>+ Add</Btn></div>
    {show&&<div style={{background:C.white,borderRadius:10,padding:12,border:`2px solid ${C.purple}30`,marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Name</label><input value={nu.name} onChange={e=>setNu(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Phone</label><input value={nu.phone} onChange={e=>setNu(p=>({...p,phone:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div></div>
      <div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:6}}>
        {Object.entries(ROLES).map(([k,v])=><div key={k} onClick={()=>setNu(p=>({...p,role:k}))} style={{padding:"3px 7px",borderRadius:4,border:`1px solid ${nu.role===k?v.color:C.border}`,background:nu.role===k?`${v.color}10`:C.white,fontSize:9,fontWeight:nu.role===k?700:400,color:nu.role===k?v.color:C.textMid,cursor:"pointer"}}>{v.icon} {v.label}</div>)}</div>
      <div style={{fontSize:8,color:C.blue,background:C.bluePale,borderRadius:4,padding:4,marginBottom:6}}>Default PIN: <strong>0000</strong> — user changes on first login</div>
      <div style={{display:"flex",gap:4}}><Btn small onClick={()=>setShow(false)}>Cancel</Btn><Btn primary small disabled={!nu.name||!nu.phone} onClick={()=>{onAdd(nu);setNu({name:"",role:"waiter",phone:""});setShow(false);}} style={{flex:1}}>Create</Btn></div>
    </div>}
    {users.map(u=>{const r=ROLES[u.role];return(
      <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,borderRadius:7,padding:8,border:`1px solid ${C.border}`,marginBottom:3,opacity:u.active?1:0.5}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{width:24,height:24,borderRadius:6,background:`${r.color}15`,color:r.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800}}>{u.name.split(" ").map(n=>n[0]).join("")}</div>
          <div><div style={{fontSize:10,fontWeight:700}}>{u.name}</div><div style={{fontSize:8,color:C.textMuted}}>{r.label} · {u.phone}</div></div></div>
        <button onClick={()=>onToggle(u.id)} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${C.border}`,fontSize:7,fontWeight:600,color:u.active?C.red:C.green,cursor:"pointer",background:C.white}}>{u.active?"Disable":"Enable"}</button>
      </div>);})}
  </div>);};

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App(){
  const [users,setUsers]=useState(INIT_USERS);const [step,setStep]=useState("login");const [user,setUser]=useState(null);
  const [shifts,setShifts]=useState([]);const [shift,setShift]=useState(null);
  const [tables,setTables]=useState(INIT_TABLES);const [rooms,setRooms]=useState(INIT_ROOMS);
  const [tab,setTab]=useState("dashboard");
  const [selTable,setSelTable]=useState(null);const [guests,setGuests]=useState(2);const [isAdd,setIsAdd]=useState(false);
  const [allOrders,setAllOrders]=useState([]);const [kitchenQ,setKitchenQ]=useState([]);const [barQ,setBarQ]=useState([]);
  const [orderCtr,setOrderCtr]=useState(1);const [payTable,setPayTable]=useState(null);const [voidTable,setVoidTable]=useState(null);
  const [showAutoLogout,setShowAutoLogout]=useState(false);const [lastOrd,setLastOrd]=useState("");
  const [notifications,setNotifications]=useState([]);const [showNotifs,setShowNotifs]=useState(false);
  const [,tick]=useState(0);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),15000);return()=>clearInterval(t);},[]);

  const canOrder=user&&["waiter","admin","manager"].includes(user.role);
  const canVoid=user&&ROLES[user.role]?.canVoid;

  const handleLogin=u=>{setUser(u);const ex=shifts.find(s=>s.userId===u.id&&s.active);
    if(ex){setShift(ex);setStep("main");setTab(ROLES[u.role].tabs[0]);return;}
    if(["kitchen","bar"].includes(u.role)){const s={id:Date.now(),userId:u.id,userName:u.name,role:u.role,startTime:Date.now(),float:0,active:true};setShifts(p=>[...p,s]);setShift(s);setStep("main");setTab(u.role);return;}
    setStep("startShift");};

  const handlePlace=(items,total,voided)=>{
    const no=`ORD-${String(orderCtr).padStart(4,"0")}`;setOrderCtr(c=>c+1);const now=Date.now();
    if(isAdd&&selTable.currentOrder){
      const ex=selTable.currentOrder;const merged=[...ex.items];
      items.forEach(ni=>{const e=merged.find(m=>m.id===ni.id);if(e)e.qty+=ni.qty;else merged.push({...ni});});
      const nt=merged.reduce((s,i)=>s+i.price*i.qty,0);const upd={...ex,items:merged,total:nt};
      setTables(p=>p.map(t=>t.id===selTable.id?{...t,currentOrder:upd}:t));setAllOrders(p=>p.map(o=>o.id===ex.id?upd:o));
    }else{
      const order={id:now,orderNo:no,table:selTable.name,tableId:selTable.id,guests,items,total,voidedItems:voided,time:timeNow(),status:"active",waiter:user.name,settled:false,voided:false};
      setAllOrders(p=>[...p,order]);setTables(p=>p.map(t=>t.id===selTable.id?{...t,status:"occupied",currentOrder:order}:t));}
    const ki=items.filter(i=>i.dest==="kitchen"),bi=items.filter(i=>i.dest==="bar");
    if(ki.length)setKitchenQ(p=>[...p,{id:now+"-k",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],waiterFull:user.name,guests,placedAt:now,status:"new",items:ki.map(i=>({...i,itemStatus:"pending"}))}]);
    if(bi.length)setBarQ(p=>[...p,{id:now+"-b",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],waiterFull:user.name,guests,placedAt:now,status:"new",items:bi.map(i=>({...i,itemStatus:"pending"}))}]);
    setLastOrd(no);if(user.role==="waiter")setShowAutoLogout(true);else{setSelTable(null);setGuests(2);setIsAdd(false);setStep("main");}};

  const updateKDS=(oid,iid,s,q)=>{const set=q==="kitchen"?setKitchenQ:setBarQ;set(p=>p.map(o=>{if(o.id!==oid)return o;const ni=o.items.map((i,idx)=>idx===iid?{...i,itemStatus:s}:i);return{...o,items:ni,status:ni.every(i=>i.itemStatus==="ready")?"ready":ni.some(i=>i.itemStatus==="cooking")?"cooking":o.status};}));};

  // Kitchen/Bar notify waiter
  const completeKDS=(oid,q)=>{
    const queue=q==="kitchen"?kitchenQ:barQ;
    const order=queue.find(o=>o.id===oid);
    if(order){
      setNotifications(p=>[{type:"ready",title:`${q==="kitchen"?"🍳 Food":"🍺 Drinks"} Ready`,message:`${order.orderNo} (${order.table}) — ready for pickup`,time:timeNow(),read:false,waiter:order.waiterFull},...p]);
    }
    (q==="kitchen"?setKitchenQ:setBarQ)(p=>p.map(o=>o.id===oid?{...o,status:"completed"}:o));
  };

  const handleSettle=payments=>{setTables(p=>p.map(x=>x.id===payTable.id?{...x,status:"available",currentOrder:null}:x));setAllOrders(p=>p.map(o=>o.id===payTable.currentOrder.id?{...o,settled:true,payments}:o));setPayTable(null);};

  const handleVoidBill=(reason)=>{
    const t=voidTable;const o=t.currentOrder;
    setAllOrders(p=>p.map(x=>x.id===o.id?{...x,voided:true,voidedBy:user.name,voidReason:reason}:x));
    setTables(p=>p.map(x=>x.id===t.id?{...x,status:"available",currentOrder:null}:x));
    setVoidTable(null);
  };

  const checkIn=(rid,g,total)=>{setRooms(p=>p.map(r=>r.id===rid?{...r,status:"occupied",guest:{...g,checkIn:"Today"},folio:[{desc:`Room (${g.nights} nights)`,amount:total,time:timeNow()}]}:r));};
  const checkOut=rid=>{setRooms(p=>p.map(r=>r.id===rid?{...r,status:"cleaning",guest:null,folio:[]}:r));};
  const roomStatus=(rid,s)=>{setRooms(p=>p.map(r=>r.id===rid?{...r,status:s}:r));};

  const logout=()=>{setUser(null);setStep("login");setSelTable(null);setGuests(2);setIsAdd(false);};
  const endShift=()=>{setShifts(p=>p.map(s=>s.id===shift?.id?{...s,active:false}:s));logout();setShift(null);};
  const autoLogout=()=>{setShowAutoLogout(false);logout();};
  const resetPin=(uid,pin)=>{setUsers(p=>p.map(u=>u.id===uid?{...u,pin}:u));};

  const downloadReport=()=>{
    const data=`Codevertex POS — Daily Report\n${new Date().toLocaleDateString()}\n\nTotal Orders: ${allOrders.length}\nSettled: ${allOrders.filter(o=>o.settled).length}\nVoided: ${allOrders.filter(o=>o.voided).length}\nRevenue: ${fmt(allOrders.filter(o=>o.settled).reduce((s,o)=>s+o.total,0))}\n\nRooms Occupied: ${rooms.filter(r=>r.status==="occupied").length}/${rooms.length}`;
    const blob=new Blob([data],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="pos-report.txt";a.click();
  };

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {showAutoLogout&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
        <div style={{background:C.white,borderRadius:16,padding:22,maxWidth:340,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:4}}>✅</div><h2 style={{fontSize:16,fontWeight:800}}>Order Placed!</h2>
          <p style={{fontSize:11,color:C.textMuted}}>{lastOrd} → Kitchen & Bar</p>
          <div style={{background:C.orangePale,borderRadius:6,padding:8,margin:"10px 0",fontSize:10,color:C.orange}}>🔒 Auto-logout. Shift stays active.</div>
          <Btn primary onClick={autoLogout} style={{width:"100%"}}>OK</Btn></div></div>}

      {payTable&&<PayModal table={payTable} order={payTable.currentOrder} onDone={handleSettle} onCancel={()=>setPayTable(null)}/>}
      {voidTable&&<VoidBillModal table={voidTable} onVoid={handleVoidBill} onCancel={()=>setVoidTable(null)}/>}
      {showNotifs&&<NotifPanel notifications={user?.role==="waiter"?notifications.filter(n=>n.waiter===user.name):notifications} onClose={()=>setShowNotifs(false)} onClear={()=>{setNotifications([]);setShowNotifs(false);}}/>}

      {step==="login"&&<PinLogin users={users} shifts={shifts} onLogin={handleLogin} onForgot={()=>setStep("forgot")}/>}
      {step==="forgot"&&<ForgotPin users={users} onBack={()=>setStep("login")} onReset={(id,pin)=>{resetPin(id,pin);setStep("login");}}/>}
      {step==="startShift"&&<StartShift user={user} showFloat={user?.role==="cashier"} onStart={f=>{const s={id:Date.now(),userId:user.id,userName:user.name,role:user.role,startTime:Date.now(),float:f,active:true};setShifts(p=>[...p,s]);setShift(s);setStep("main");setTab(ROLES[user.role].tabs[0]);}} onBack={()=>{setUser(null);setStep("login");}}/>}

      {step==="main"&&<div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <Header user={user} shift={shift} tab={tab} setTab={setTab} onLogout={logout} onEndShift={endShift}
          badges={{kitchen:kitchenQ.filter(o=>o.status==="new").length,bar:barQ.filter(o=>o.status==="new").length,bills:tables.filter(t=>t.status==="occupied").length}}
          notifications={user?.role==="waiter"?notifications.filter(n=>n.waiter===user.name):notifications}
          onViewNotifs={()=>setShowNotifs(true)}/>
        {tab==="dashboard"&&<Dashboard orders={allOrders} tables={tables} rooms={rooms} stock={STOCK} kitchenQ={kitchenQ} barQ={barQ} facilities={FACILITIES} onDownload={downloadReport}/>}
        {tab==="tables"&&<TablesView tables={tables} canOrder={canOrder} onNew={t=>{setSelTable(t);setIsAdd(false);setStep("guests");}} onAdd={t=>{setSelTable(t);setGuests(t.currentOrder?.guests||2);setIsAdd(true);setStep("order");}}/>}
        {tab==="mybills"&&<MyBills orders={allOrders} user={user}/>}
        {tab==="kitchen"&&<KDS orders={kitchenQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"kitchen")} onComplete={o=>completeKDS(o,"kitchen")} title="Kitchen Display" icon="🍳" emptyIcon="👨‍🍳"/>}
        {tab==="bar"&&<KDS orders={barQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"bar")} onComplete={o=>completeKDS(o,"bar")} title="Bar Display" icon="🍺" emptyIcon="🍹"/>}
        {tab==="cashier"&&<CashierView tables={tables} orders={allOrders} onSettle={t=>setPayTable(t)} onVoidBill={t=>setVoidTable(t)} canVoid={canVoid}/>}
        {tab==="rooms"&&<RoomsView rooms={rooms} onCheckIn={checkIn} onCheckOut={checkOut} onStatus={roomStatus}/>}
        {tab==="facilities"&&<FacilitiesView facilities={FACILITIES}/>}
        {tab==="stock"&&<StockView stock={STOCK}/>}
        {tab==="users"&&<UsersView users={users} onAdd={nu=>setUsers(p=>[...p,{...nu,id:Date.now(),pin:"0000",active:true}])} onToggle={id=>setUsers(p=>p.map(u=>u.id===id?{...u,active:!u.active}:u))}/>}
      </div>}

      {step==="guests"&&selTable&&<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{background:C.white,borderRadius:16,padding:22,maxWidth:300,width:"100%",textAlign:"center",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:22,marginBottom:4}}>🪑</div>
          <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{selTable.name}</h2>
          <p style={{fontSize:10,color:C.textMuted,marginBottom:14}}>{selTable.seats} seats</p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:14}}>
            <button onClick={()=>setGuests(Math.max(1,guests-1))} style={{width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:15,cursor:"pointer"}}>−</button>
            <span style={{fontSize:28,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{guests}</span>
            <button onClick={()=>setGuests(guests+1)} style={{width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:15,cursor:"pointer"}}>+</button></div>
          <div style={{display:"flex",gap:6}}><Btn onClick={()=>{setSelTable(null);setStep("main");}} style={{flex:1}}>Back</Btn>
            <Btn primary onClick={()=>setStep("order")} style={{flex:1}}>Start Order</Btn></div>
        </div></div>}

      {step==="order"&&<OrderScreen user={user} table={selTable} guests={guests} existing={isAdd?selTable?.currentOrder?.items:null} isAdd={isAdd} onPlace={handlePlace} onBack={()=>{if(isAdd){setIsAdd(false);setStep("main");}else setStep("guests");}}/>}
    </div>
  );
}
