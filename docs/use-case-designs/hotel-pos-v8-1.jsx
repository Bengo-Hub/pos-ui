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
  cyan:"#06B6D4",cyanPale:"#CFFAFE",
};

const ROLES={
  admin:{label:"Admin",icon:"🛡️",color:C.purple,tabs:["dashboard","tables","kitchen","bar","cashier","rooms","facilities","menu","stock","staff","users"]},
  receptionist:{label:"Receptionist",icon:"🛎️",color:C.teal,tabs:["rooms","facilities"]},
  cashier:{label:"Cashier",icon:"💰",color:C.green,tabs:["cashier"]},
  waiter:{label:"Waiter",icon:"🍽️",color:C.blue,tabs:["tables"]},
  kitchen:{label:"Kitchen",icon:"🍳",color:C.orange,tabs:["kitchen"]},
  bar:{label:"Bar",icon:"🍺",color:C.blue,tabs:["bar"]},
};

const INIT_USERS=[
  {id:1,username:"admin",name:"System Admin",role:"admin",password:"admin123",active:true},
  {id:2,username:"mary.a",name:"Mary Akinyi",role:"waiter",password:"1234",active:true},
  {id:3,username:"john.o",name:"John Otieno",role:"waiter",password:"1234",active:true},
  {id:4,username:"samuel.k",name:"Samuel Kamau",role:"cashier",password:"cash123",active:true},
  {id:5,username:"chef.james",name:"James Omondi",role:"kitchen",password:"kitchen1",active:true},
  {id:6,username:"barman.pete",name:"Peter Njoroge",role:"bar",password:"bar123",active:true},
  {id:7,username:"reception",name:"Faith Njeri",role:"receptionist",password:"front1",active:true},
];

const ROOM_STATUSES={
  available:{label:"Available",color:C.green,bg:C.greenPale,icon:"✅"},
  occupied:{label:"Occupied",color:C.blue,bg:C.bluePale,icon:"🔵"},
  reserved:{label:"Reserved",color:C.orange,bg:C.orangePale,icon:"📅"},
  cleaning:{label:"Cleaning",color:C.yellow,bg:C.yellowPale,icon:"🧹"},
  maintenance:{label:"Maintenance",color:C.red,bg:C.redPale,icon:"🔧"},
  checkout:{label:"Checking Out",color:C.pink,bg:C.pinkPale,icon:"🚪"},
};

const INIT_ROOMS=[
  {id:101,name:"101",type:"Standard",floor:1,rate:5000,status:"occupied",guest:{name:"Mr. Odhiambo",phone:"0712345678",id:"ID-34521",checkIn:"2026-05-04",nights:3},folio:[{desc:"Room (3 nights)",amount:15000,time:"May 4"},{desc:"Room Service - Dinner",amount:2400,time:"May 4"},{desc:"Laundry",amount:800,time:"May 5"}]},
  {id:102,name:"102",type:"Standard",floor:1,rate:5000,status:"available",guest:null,folio:[]},
  {id:103,name:"103",type:"Standard",floor:1,rate:5000,status:"cleaning",guest:null,folio:[]},
  {id:104,name:"104",type:"Standard",floor:1,rate:5000,status:"reserved",guest:{name:"Mrs. Wambui",phone:"0723456789",checkIn:"2026-05-07",nights:2},folio:[]},
  {id:201,name:"201",type:"Deluxe",floor:2,rate:8500,status:"occupied",guest:{name:"Mrs. Kamau",phone:"0734567890",id:"PP-A4521",checkIn:"2026-05-03",nights:4},folio:[{desc:"Room (4 nights)",amount:34000,time:"May 3"},{desc:"Spa Treatment",amount:5000,time:"May 4"},{desc:"Mini Bar",amount:1200,time:"May 5"}]},
  {id:202,name:"202",type:"Deluxe",floor:2,rate:8500,status:"available",guest:null,folio:[]},
  {id:203,name:"203",type:"Deluxe",floor:2,rate:8500,status:"maintenance",guest:null,folio:[]},
  {id:204,name:"204",type:"Deluxe",floor:2,rate:8500,status:"available",guest:null,folio:[]},
  {id:301,name:"301",type:"Suite",floor:3,rate:15000,status:"occupied",guest:{name:"Mr. Johnson",phone:"0745678901",id:"PP-UK8821",checkIn:"2026-05-05",nights:5},folio:[{desc:"Room (5 nights)",amount:75000,time:"May 5"},{desc:"Conference Room",amount:12000,time:"May 6"}]},
  {id:302,name:"302",type:"Suite",floor:3,rate:15000,status:"available",guest:null,folio:[]},
  {id:401,name:"401",type:"Presidential",floor:4,rate:35000,status:"available",guest:null,folio:[]},
  {id:402,name:"402",type:"Presidential",floor:4,rate:35000,status:"reserved",guest:{name:"Hon. Mutua",phone:"0756789012",checkIn:"2026-05-08",nights:2},folio:[]},
];

const FACILITIES=[
  {id:1,name:"Swimming Pool",icon:"🏊",status:"open",capacity:30,current:8,rate:500,hours:"6:00-20:00",bookings:[{guest:"Mr. Odhiambo",room:"101",time:"14:00-16:00"},{guest:"Walk-in",room:null,time:"10:00-12:00"}]},
  {id:2,name:"Gym & Fitness",icon:"🏋️",status:"open",capacity:15,current:3,rate:800,hours:"5:00-22:00",bookings:[{guest:"Mrs. Kamau",room:"201",time:"06:00-07:00"}]},
  {id:3,name:"Conference Room A",icon:"🏢",status:"booked",capacity:50,current:0,rate:15000,hours:"8:00-18:00",bookings:[{guest:"Mr. Johnson",room:"301",time:"09:00-17:00",event:"Board Meeting"}]},
  {id:4,name:"Conference Room B",icon:"🏢",status:"open",capacity:20,current:0,rate:8000,hours:"8:00-18:00",bookings:[]},
  {id:5,name:"Spa & Wellness",icon:"💆",status:"open",capacity:8,current:2,rate:3000,hours:"9:00-21:00",bookings:[{guest:"Mrs. Kamau",room:"201",time:"15:00-16:30",service:"Full Body Massage"}]},
  {id:6,name:"Kids Play Area",icon:"🎠",status:"open",capacity:20,current:5,rate:300,hours:"8:00-18:00",bookings:[]},
];

const INIT_TABLES=Array.from({length:12},(_,i)=>({
  id:i+1,name:i<6?`Table ${i+1}`:i<9?`Table ${i+1}`:`Bar ${i-8}`,
  seats:i<6?[2,4,4,2,6,8][i]:i<9?[2,4,4][i-6]:1,
  zone:i<6?"Indoor":i<9?"Outdoor":"Bar",status:"available",currentOrder:null,
}));

const MENU_ITEMS=[
  {id:1,name:"Mushroom Soup",price:450,dest:"kitchen",cat:"Starters",orders:45},
  {id:2,name:"Caesar Salad",price:550,dest:"kitchen",cat:"Starters",orders:38},
  {id:3,name:"Garlic Bread",price:350,dest:"kitchen",cat:"Starters",orders:62},
  {id:5,name:"Chicken Wings",price:650,dest:"kitchen",cat:"Starters",orders:78},
  {id:7,name:"Grilled Tilapia",price:1200,dest:"kitchen",cat:"Mains",orders:95},
  {id:8,name:"Nyama Choma",price:1500,dest:"kitchen",cat:"Mains",orders:112},
  {id:9,name:"Chicken Tikka",price:950,dest:"kitchen",cat:"Mains",orders:67},
  {id:10,name:"Beef Steak",price:1800,dest:"kitchen",cat:"Mains",orders:54},
  {id:12,name:"Veggie Stir Fry",price:750,dest:"kitchen",cat:"Mains",orders:29},
  {id:14,name:"Pilau + Beef",price:850,dest:"kitchen",cat:"Mains",orders:88},
  {id:15,name:"Ugali",price:100,dest:"kitchen",cat:"Sides",orders:142},
  {id:16,name:"Chips",price:250,dest:"kitchen",cat:"Sides",orders:118},
  {id:17,name:"Rice",price:200,dest:"kitchen",cat:"Sides",orders:95},
  {id:18,name:"Kachumbari",price:150,dest:"kitchen",cat:"Sides",orders:85},
  {id:21,name:"Tusker Lager",price:350,dest:"bar",cat:"Drinks",orders:198},
  {id:22,name:"White Cap",price:350,dest:"bar",cat:"Drinks",orders:145},
  {id:23,name:"Soda 500ml",price:150,dest:"bar",cat:"Drinks",orders:210},
  {id:24,name:"Water 500ml",price:100,dest:"bar",cat:"Drinks",orders:180},
  {id:25,name:"Fresh Juice",price:300,dest:"bar",cat:"Drinks",orders:92},
  {id:26,name:"Cocktail",price:650,dest:"bar",cat:"Drinks",orders:48},
  {id:27,name:"House Wine",price:550,dest:"bar",cat:"Drinks",orders:63},
  {id:28,name:"Kenyan Coffee",price:250,dest:"bar",cat:"Hot Drinks",orders:156},
  {id:29,name:"Chai Latte",price:300,dest:"bar",cat:"Hot Drinks",orders:74},
  {id:32,name:"Chocolate Cake",price:450,dest:"kitchen",cat:"Desserts",orders:42},
  {id:33,name:"Ice Cream",price:350,dest:"kitchen",cat:"Desserts",orders:55},
];

const STOCK=[
  {id:1,name:"Tusker Lager",cat:"Beverages",unit:"Btl",qty:120,reorder:24,cost:200},
  {id:2,name:"White Cap",cat:"Beverages",unit:"Btl",qty:85,reorder:24,cost:200},
  {id:3,name:"House Wine",cat:"Beverages",unit:"Btl",qty:8,reorder:10,cost:400},
  {id:4,name:"Soda 500ml",cat:"Beverages",unit:"Btl",qty:200,reorder:48,cost:60},
  {id:5,name:"Tilapia",cat:"Protein",unit:"Kg",qty:4,reorder:5,cost:600},
  {id:6,name:"Beef",cat:"Protein",unit:"Kg",qty:20,reorder:5,cost:800},
  {id:7,name:"Rice",cat:"Grains",unit:"Kg",qty:50,reorder:10,cost:120},
  {id:8,name:"Cooking Oil",cat:"Supplies",unit:"Ltr",qty:25,reorder:5,cost:300},
];

const fmt=n=>`KSh ${n.toLocaleString()}`;
const timeNow=()=>new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
const Dot=({color})=><span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block"}}/>;
const Btn=({children,primary,danger,small,disabled,onClick,style:sx})=>(
  <button onClick={disabled?undefined:onClick} style={{padding:small?"5px 10px":"10px 18px",borderRadius:small?7:10,border:primary||danger?"none":`1px solid ${C.border}`,background:danger?C.red:primary?C.purple:C.white,color:danger||primary?"#fff":C.textMid,fontSize:small?11:13,fontWeight:primary||danger?700:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx}}>{children}</button>
);
const Badge=({color,bg,children})=><span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:bg,color,fontWeight:700}}>{children}</span>;

/* ═══════ LOGIN ═══════ */
const Login=({users,shifts,onLogin})=>{
  const [u,setU]=useState("");const [p,setP]=useState("");const [show,setShow]=useState(false);const [err,setErr]=useState("");
  const go=()=>{setErr("");if(!u.trim()||!p){setErr("Enter credentials");return;}
    const user=users.find(x=>x.username.toLowerCase()===u.toLowerCase().trim()&&x.active);
    if(!user){setErr("User not found");return;}if(user.password!==p){setErr("Wrong password");return;}onLogin(user);};
  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.white,borderRadius:22,padding:30,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{width:48,height:48,borderRadius:12,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}><span style={{color:"#fff",fontSize:18,fontWeight:800}}>CV</span></div>
          <h1 style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>Codevertex POS</h1>
          <p style={{color:C.textMuted,fontSize:12}}>Hotel & Restaurant Management</p>
        </div>
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Username</label>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Username" style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${C.border}`,fontSize:13,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:600,color:C.textMid,display:"block",marginBottom:4}}>Password</label>
          <div style={{position:"relative"}}><input type={show?"text":"password"} value={p} onChange={e=>setP(e.target.value)} placeholder="Password" onKeyDown={e=>e.key==="Enter"&&go()}
            style={{width:"100%",padding:"10px 36px 10px 12px",borderRadius:9,border:`1.5px solid ${C.border}`,fontSize:13,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
          <button onClick={()=>setShow(!show)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.textMuted}}>{show?"🙈":"👁"}</button></div></div>
        {err&&<div style={{padding:"6px 10px",borderRadius:7,background:C.redPale,color:C.red,fontSize:11,fontWeight:600,marginBottom:10}}>⚠ {err}</div>}
        <button onClick={go} style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:C.purple,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif",boxShadow:"0 4px 14px rgba(107,45,139,0.3)"}}>Sign In</button>
        <div style={{marginTop:14,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:9,color:C.textDim,textAlign:"center",lineHeight:1.6}}>
          admin/admin123 · reception/front1 · mary.a/1234<br/>samuel.k/cash123 · chef.james/kitchen1 · barman.pete/bar123
        </div>
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

/* ═══════ HEADER ═══════ */
const Header=({user,shift,tab,setTab,onLogout,onEndShift,badges})=>{
  const elapsed=Math.round((Date.now()-shift.startTime)/60000);
  const allTabs=[
    {id:"dashboard",label:"📊 Dashboard",perm:"dashboard"},
    {id:"tables",label:"🪑 Tables",perm:"tables"},
    {id:"kitchen",label:"🍳 Kitchen",perm:"kitchen",badge:badges.kitchen},
    {id:"bar",label:"🍺 Bar",perm:"bar",badge:badges.bar},
    {id:"cashier",label:"💰 Bills",perm:"cashier",badge:badges.bills},
    {id:"rooms",label:"🏨 Rooms",perm:"rooms"},
    {id:"facilities",label:"🏊 Facilities",perm:"facilities"},
    {id:"menu",label:"📋 Menu",perm:"menu"},
    {id:"stock",label:"📦 Stock",perm:"stock"},
    {id:"staff",label:"👥 Staff",perm:"staff"},
    {id:"users",label:"⚙ Users",perm:"users"},
  ];
  const tabs=allTabs.filter(t=>ROLES[user.role].tabs.includes(t.perm));
  return(
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
      <div style={{padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:24,height:24,borderRadius:6,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800}}>CV</div>
          <span style={{fontSize:11,fontWeight:700,color:C.text}}>Codevertex POS</span></div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Badge color={C.green} bg={C.greenPale}>⏱ {elapsed}m</Badge>
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

/* ═══════ ENHANCED DASHBOARD ═══════ */
const Dashboard=({orders,tables,rooms,stock,kitchenQ,barQ,facilities})=>{
  const settled=orders.filter(o=>o.settled);const foodRev=settled.reduce((s,o)=>s+o.items.filter(i=>i.dest==="kitchen").reduce((a,i)=>a+i.price*i.qty,0),0);
  const barRev=settled.reduce((s,o)=>s+o.items.filter(i=>i.dest==="bar").reduce((a,i)=>a+i.price*i.qty,0),0);
  const roomRev=rooms.filter(r=>r.status==="occupied").reduce((s,r)=>s+r.folio.reduce((a,f)=>a+f.amount,0),0);
  const totalRev=foodRev+barRev+roomRev;
  const occRooms=rooms.filter(r=>r.status==="occupied").length;const totalRooms=rooms.length;
  const occRate=Math.round((occRooms/totalRooms)*100);
  const lowStock=stock.filter(s=>s.qty<=s.reorder).length;
  const topFood=[...MENU_ITEMS].filter(i=>i.dest==="kitchen").sort((a,b)=>b.orders-a.orders).slice(0,5);
  const topDrinks=[...MENU_ITEMS].filter(i=>i.dest==="bar").sort((a,b)=>b.orders-a.orders).slice(0,5);
  const maxOrders=Math.max(...topFood.map(i=>i.orders),...topDrinks.map(i=>i.orders));

  return(
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>📊 Hotel Dashboard</h2>
        <p style={{fontSize:10,color:C.textMuted}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · {timeNow()}</p>
      </div>

      {/* Revenue Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6,marginBottom:14}}>
        {[
          {l:"Total Revenue",v:fmt(totalRev),icon:"💰",c:C.green,bg:C.greenPale},
          {l:"Room Revenue",v:fmt(roomRev),icon:"🏨",c:C.purple,bg:C.purplePale},
          {l:"F&B Revenue",v:fmt(foodRev+barRev),icon:"🍽️",c:C.orange,bg:C.orangePale},
          {l:"Occupancy Rate",v:`${occRate}%`,icon:"📊",c:C.blue,bg:C.bluePale},
          {l:"Open Bills",v:tables.filter(t=>t.status==="occupied").length,icon:"📄",c:C.orange,bg:C.orangePale},
          {l:"Kitchen Queue",v:kitchenQ.filter(o=>o.status!=="completed").length,icon:"🍳",c:C.orange,bg:C.orangePale},
          {l:"Bar Queue",v:barQ.filter(o=>o.status!=="completed").length,icon:"🍺",c:C.blue,bg:C.bluePale},
          {l:"Low Stock",v:lowStock,icon:"⚠️",c:lowStock>0?C.red:C.green,bg:lowStock>0?C.redPale:C.greenPale},
        ].map((s,i)=>(
          <div key={i} style={{background:C.white,borderRadius:10,padding:10,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,width:32,height:32,background:s.bg,borderRadius:"0 0 0 32px",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:"3px 5px 0 0",fontSize:12}}>{s.icon}</div>
            <div style={{fontSize:8,color:C.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>{s.l}</div>
            <div style={{fontSize:17,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif",marginTop:2}}>{s.v}</div>
          </div>))}
      </div>

      {/* Revenue Breakdown */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:10}}>Revenue Breakdown</h3>
          {[{l:"Rooms & Accommodation",v:roomRev,c:C.purple,pct:totalRev?Math.round(roomRev/totalRev*100):0},
            {l:"Food (Kitchen)",v:foodRev,c:C.orange,pct:totalRev?Math.round(foodRev/totalRev*100):0},
            {l:"Drinks (Bar)",v:barRev,c:C.blue,pct:totalRev?Math.round(barRev/totalRev*100):0},
          ].map((r,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                <span style={{color:C.textMid,fontWeight:600}}>{r.l}</span><span style={{fontWeight:700,color:r.c}}>{fmt(r.v)} ({r.pct}%)</span></div>
              <div style={{height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${r.pct}%`,background:r.c,borderRadius:3,transition:"width 0.5s"}}/></div>
            </div>))}
        </div>
        {/* Room Status Overview */}
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:10}}>Room Status</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(ROOM_STATUSES).map(([key,st])=>{
              const count=rooms.filter(r=>r.status===key).length;
              return count>0?(
                <div key={key} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",background:st.bg,borderRadius:6}}>
                  <span style={{fontSize:14}}>{st.icon}</span>
                  <div><div style={{fontSize:14,fontWeight:800,color:st.color}}>{count}</div>
                    <div style={{fontSize:8,color:st.color,fontWeight:600}}>{st.label}</div></div>
                </div>
              ):null;})}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:C.bg,borderRadius:8,textAlign:"center"}}>
            <span style={{fontSize:9,color:C.textDim}}>Occupancy</span>
            <div style={{fontSize:22,fontWeight:800,color:occRate>80?C.green:occRate>50?C.orange:C.red,fontFamily:"'Outfit',sans-serif"}}>{occRate}%</div>
          </div>
        </div>
      </div>

      {/* Popular Items */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🔥 Top Food Items</h3>
          {topFood.map((item,i)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:800,color:C.purple,minWidth:16}}>{i+1}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600}}>{item.name}</div>
                <div style={{height:4,background:C.bg,borderRadius:2,marginTop:2}}>
                  <div style={{height:"100%",width:`${(item.orders/maxOrders)*100}%`,background:C.orange,borderRadius:2}}/></div>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:C.orange}}>{item.orders}</span>
            </div>))}
        </div>
        <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🍺 Top Drinks</h3>
          {topDrinks.map((item,i)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:800,color:C.purple,minWidth:16}}>{i+1}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600}}>{item.name}</div>
                <div style={{height:4,background:C.bg,borderRadius:2,marginTop:2}}>
                  <div style={{height:"100%",width:`${(item.orders/maxOrders)*100}%`,background:C.blue,borderRadius:2}}/></div>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:C.blue}}>{item.orders}</span>
            </div>))}
        </div>
      </div>

      {/* Facilities Overview */}
      <div style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
        <h3 style={{fontSize:12,fontWeight:700,marginBottom:8}}>🏊 Facilities Status</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:6}}>
          {facilities.map(f=>(
            <div key={f.id} style={{padding:10,borderRadius:8,background:f.status==="booked"?C.orangePale:C.greenPale,border:`1px solid ${f.status==="booked"?C.orange:C.green}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:16}}>{f.icon}</span>
                <Badge color={f.status==="booked"?C.orange:C.green} bg={f.status==="booked"?C.orangePale:C.greenPale}>{f.status==="booked"?"Booked":"Open"}</Badge>
              </div>
              <div style={{fontSize:11,fontWeight:700}}>{f.name}</div>
              <div style={{fontSize:9,color:C.textMuted}}>{f.current}/{f.capacity} · {f.hours}</div>
            </div>))}
        </div>
      </div>
    </div>
  );
};

/* ═══════ ROOMS — RECEPTIONIST ═══════ */
const RoomsView=({rooms,onCheckIn,onCheckOut,onChangeStatus,onPostCharge})=>{
  const [filter,setFilter]=useState("all");const [showCheckIn,setShowCheckIn]=useState(null);
  const [guest,setGuest]=useState({name:"",phone:"",id:"",nights:1});
  const filtered=filter==="all"?rooms:rooms.filter(r=>r.status===filter);

  return(
    <div style={{flex:1,overflowY:"auto",padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div><h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif"}}>🏨 Room Management</h2>
          <p style={{fontSize:10,color:C.textMuted}}>{rooms.filter(r=>r.status==="occupied").length}/{rooms.length} occupied · {rooms.filter(r=>r.status==="available").length} available</p></div>
      </div>
      {/* Status filter */}
      <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap"}}>
        <button onClick={()=>setFilter("all")} style={{padding:"4px 10px",borderRadius:6,border:filter==="all"?"none":`1px solid ${C.border}`,background:filter==="all"?C.purple:C.white,color:filter==="all"?"#fff":C.textMid,fontSize:10,fontWeight:600,cursor:"pointer"}}>All ({rooms.length})</button>
        {Object.entries(ROOM_STATUSES).map(([key,st])=>{const count=rooms.filter(r=>r.status===key).length;return count>0?(
          <button key={key} onClick={()=>setFilter(key)} style={{padding:"4px 10px",borderRadius:6,border:filter===key?"none":`1px solid ${C.border}`,background:filter===key?st.color:C.white,color:filter===key?"#fff":st.color,fontSize:10,fontWeight:600,cursor:"pointer"}}>{st.icon} {st.label} ({count})</button>
        ):null;})}
      </div>

      {/* Check-in modal */}
      {showCheckIn&&<div style={{background:C.white,borderRadius:12,padding:16,border:`2px solid ${C.teal}30`,marginBottom:12}}>
        <h3 style={{fontSize:13,fontWeight:700,marginBottom:8}}>🛎️ Check In — Room {showCheckIn.name}</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><label style={{fontSize:9,fontWeight:600,color:C.textMid}}>Guest Name *</label>
            <input value={guest.name} onChange={e=>setGuest(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"7px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
          <div><label style={{fontSize:9,fontWeight:600,color:C.textMid}}>Phone *</label>
            <input value={guest.phone} onChange={e=>setGuest(p=>({...p,phone:e.target.value}))} placeholder="0712..." style={{width:"100%",padding:"7px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
          <div><label style={{fontSize:9,fontWeight:600,color:C.textMid}}>ID / Passport</label>
            <input value={guest.id} onChange={e=>setGuest(p=>({...p,id:e.target.value}))} style={{width:"100%",padding:"7px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
          <div><label style={{fontSize:9,fontWeight:600,color:C.textMid}}>Nights</label>
            <input type="number" value={guest.nights} onChange={e=>setGuest(p=>({...p,nights:parseInt(e.target.value)||1}))} min="1" style={{width:"100%",padding:"7px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,outline:"none"}}/></div>
        </div>
        <div style={{background:C.tealPale,borderRadius:6,padding:8,marginBottom:8,fontSize:10,color:C.teal}}>
          Rate: {fmt(showCheckIn.rate)}/night × {guest.nights} nights = <strong>{fmt(showCheckIn.rate*guest.nights)}</strong>
        </div>
        <div style={{display:"flex",gap:6}}>
          <Btn small onClick={()=>{setShowCheckIn(null);setGuest({name:"",phone:"",id:"",nights:1});}}>Cancel</Btn>
          <Btn primary small disabled={!guest.name||!guest.phone} onClick={()=>{onCheckIn(showCheckIn.id,{...guest,checkIn:new Date().toISOString().slice(0,10)},showCheckIn.rate*guest.nights);setShowCheckIn(null);setGuest({name:"",phone:"",id:"",nights:1});}} style={{flex:1}}>Check In Guest</Btn>
        </div>
      </div>}

      {/* Room Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
        {filtered.map(room=>{
          const st=ROOM_STATUSES[room.status];const folioTotal=room.folio.reduce((s,f)=>s+f.amount,0);
          return(
            <div key={room.id} style={{background:C.white,borderRadius:12,padding:14,border:`2px solid ${st.color}20`,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:st.color,opacity:0.5}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:18,fontWeight:800,color:C.text}}>Rm {room.name}</span>
                  <Badge color={st.color} bg={st.bg}>{st.icon} {st.label}</Badge>
                </div>
              </div>
              <div style={{fontSize:10,color:C.textMuted,marginBottom:6}}>{room.type} · Floor {room.floor} · {fmt(room.rate)}/night</div>

              {room.status==="occupied"&&room.guest&&<>
                <div style={{background:C.bg,borderRadius:8,padding:8,marginBottom:6,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text}}>{room.guest.name}</div>
                  <div style={{fontSize:9,color:C.textMuted}}>📞 {room.guest.phone} · {room.guest.id}</div>
                  <div style={{fontSize:9,color:C.textMuted}}>Check-in: {room.guest.checkIn} · {room.guest.nights} nights</div>
                </div>
                <div style={{fontSize:10,fontWeight:600,color:C.purple,marginBottom:6}}>Folio: {room.folio.length} charges · {fmt(folioTotal)}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  <button onClick={()=>onPostCharge(room)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.purple}30`,background:C.purplePale,fontSize:9,fontWeight:600,color:C.purple,cursor:"pointer"}}>+ Charge</button>
                  <button onClick={()=>onChangeStatus(room.id,"checkout")} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.pink}30`,background:C.pinkPale,fontSize:9,fontWeight:600,color:C.pink,cursor:"pointer"}}>Prepare Checkout</button>
                  <button onClick={()=>onCheckOut(room.id)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.red}30`,background:C.redPale,fontSize:9,fontWeight:600,color:C.red,cursor:"pointer"}}>Check Out</button>
                </div>
              </>}

              {room.status==="reserved"&&room.guest&&<>
                <div style={{background:C.orangePale,borderRadius:8,padding:8,marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.orange}}>Reserved for: {room.guest.name}</div>
                  <div style={{fontSize:9,color:C.orange}}>📞 {room.guest.phone} · Arriving: {room.guest.checkIn}</div>
                </div>
                <Btn primary small onClick={()=>setShowCheckIn(room)} style={{width:"100%"}}>Check In Now</Btn>
              </>}

              {room.status==="available"&&<>
                <Btn primary small onClick={()=>setShowCheckIn(room)} style={{width:"100%",marginTop:4}}>🛎️ Check In Guest</Btn>
              </>}

              {room.status==="cleaning"&&<>
                <div style={{padding:"6px 0",textAlign:"center",fontSize:10,color:C.yellow,fontWeight:600}}>🧹 Housekeeping in progress</div>
                <Btn small onClick={()=>onChangeStatus(room.id,"available")} style={{width:"100%"}}>Mark Clean ✓</Btn>
              </>}

              {room.status==="maintenance"&&<>
                <div style={{padding:"6px 0",textAlign:"center",fontSize:10,color:C.red,fontWeight:600}}>🔧 Under maintenance</div>
                <Btn small onClick={()=>onChangeStatus(room.id,"available")} style={{width:"100%"}}>Mark Fixed ✓</Btn>
              </>}

              {room.status==="checkout"&&room.guest&&<>
                <div style={{background:C.pinkPale,borderRadius:8,padding:8,marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.pink}}>{room.guest.name} — Checking out</div>
                  <div style={{fontSize:10,fontWeight:600,color:C.text}}>Outstanding: {fmt(folioTotal)}</div>
                </div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>onCheckOut(room.id)} style={{flex:1,padding:"6px",borderRadius:6,border:"none",background:C.green,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>Settle & Check Out</button>
                </div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════ FACILITIES ═══════ */
const FacilitiesView=({facilities})=>(
  <div style={{flex:1,overflowY:"auto",padding:14}}>
    <h2 style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:2}}>🏊 Hotel Facilities</h2>
    <p style={{fontSize:10,color:C.textMuted,marginBottom:14}}>Manage pool, gym, conference, spa & more</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>
      {facilities.map(f=>(
        <div key={f.id} style={{background:C.white,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:24}}>{f.icon}</span>
              <div><div style={{fontSize:14,fontWeight:700}}>{f.name}</div>
                <div style={{fontSize:10,color:C.textMuted}}>{f.hours} · {fmt(f.rate)}/session</div></div>
            </div>
            <Badge color={f.status==="booked"?C.orange:C.green} bg={f.status==="booked"?C.orangePale:C.greenPale}>{f.status==="booked"?"Booked":"Open"}</Badge>
          </div>
          {/* Capacity bar */}
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:2}}>
              <span style={{color:C.textMuted}}>Capacity</span><span style={{fontWeight:600}}>{f.current}/{f.capacity}</span></div>
            <div style={{height:5,background:C.bg,borderRadius:3}}>
              <div style={{height:"100%",width:`${(f.current/f.capacity)*100}%`,background:f.current/f.capacity>0.8?C.red:C.green,borderRadius:3}}/></div>
          </div>
          {/* Bookings */}
          {f.bookings.length>0&&<>
            <div style={{fontSize:9,fontWeight:700,color:C.textMid,marginBottom:4}}>Today's Bookings:</div>
            {f.bookings.map((b,i)=>(
              <div key={i} style={{fontSize:10,color:C.textMid,padding:"3px 8px",background:C.bg,borderRadius:5,marginBottom:2}}>
                <strong>{b.guest}</strong> {b.room&&`(Rm ${b.room})`} · {b.time} {b.event&&`· ${b.event}`} {b.service&&`· ${b.service}`}
              </div>))}
          </>}
          <div style={{display:"flex",gap:4,marginTop:8}}>
            <Btn small primary style={{flex:1}}>+ Book</Btn>
            <Btn small>Schedule</Btn>
          </div>
        </div>))}
    </div>
  </div>
);

/* ═══════ TABLES + ORDER + KDS + CASHIER + PAYMENT (compact) ═══════ */
const TablesView=({tables,canOrder,onNew,onAdd})=>{const [z,setZ]=useState("All");const f=z==="All"?tables:tables.filter(t=>t.zone===z);return(
  <div style={{padding:14,overflowY:"auto",flex:1}}>
    <h2 style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>Floor Plan</h2>
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
          {!a&&t.currentOrder&&<div style={{marginTop:4,fontSize:9,color:C.blue,fontWeight:600}}>{t.currentOrder.orderNo} · {fmt(t.currentOrder.total)}{canOrder&&" · + Add"}</div>}
        </div>);})}
    </div></div>
);};

const OrderScreen=({user,table,guests,existing,isAdd,onPlace,onBack})=>{
  const items_all=MENU_ITEMS;const cats={};items_all.forEach(i=>{if(!cats[i.cat])cats[i.cat]=[];cats[i.cat].push(i);});
  const [cat,setCat]=useState(Object.keys(cats)[0]);const [items,setItems]=useState([]);const [search,setSearch]=useState("");
  const [voidItem,setVoidItem]=useState(null);const [voided,setVoided]=useState([]);
  const add=i=>setItems(p=>{const e=p.find(x=>x.id===i.id);return e?p.map(x=>x.id===i.id?{...x,qty:x.qty+1}:x):[...p,{...i,qty:1}];});
  const updQ=(id,d)=>setItems(p=>p.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+d)}:i));
  const sub=items.reduce((s,i)=>s+i.price*i.qty,0);
  const all=search?items_all.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())):cats[cat]||[];
  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg}}>
      {voidItem&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
        <div style={{background:C.white,borderRadius:14,padding:18,maxWidth:300,width:"100%"}}>
          <h3 style={{fontSize:13,fontWeight:700,marginBottom:6}}>🗑 Remove {voidItem.name}?</h3>
          {["Customer changed mind","Wrong item","Out of stock","Other"].map(r=><div key={r} onClick={()=>{setVoided(p=>[...p,{...voidItem,reason:r}]);setItems(p=>p.filter(i=>i.id!==voidItem.id));setVoidItem(null);}} style={{padding:"7px 10px",borderRadius:6,border:`1px solid ${C.border}`,marginBottom:3,fontSize:11,cursor:"pointer",color:C.textMid}}>{r}</div>)}
          <Btn small onClick={()=>setVoidItem(null)} style={{width:"100%",marginTop:4}}>Cancel</Btn>
        </div></div>}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={onBack} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <span style={{fontSize:13,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{table.name}</span>
        <span style={{fontSize:9,color:C.textMuted}}>{guests}p · {user.name.split(" ")[0]}</span>
        {isAdd&&<Badge color={C.blue} bg={C.bluePale}>+ADDING</Badge>}
      </div>
      {isAdd&&existing?.length>0&&<div style={{padding:"5px 12px",background:C.bluePale,fontSize:9,color:C.blue}}>Current bill: {existing.length} items · {fmt(existing.reduce((s,i)=>s+i.price*i.qty,0))}</div>}
      <div style={{flex:1,display:"flex",overflow:"hidden",flexWrap:"wrap"}}>
        <div style={{flex:"1 1 55%",minWidth:240,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`,background:C.white}}>
          <div style={{padding:6}}><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
          {!search&&<div style={{display:"flex",gap:2,padding:"0 6px 4px",overflowX:"auto",flexShrink:0}}>
            {Object.keys(cats).map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"4px 8px",borderRadius:5,border:cat===c?"none":`1px solid ${C.border}`,background:cat===c?C.purple:C.white,color:cat===c?"#fff":C.textMid,fontSize:9,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{c}</button>)}</div>}
          <div style={{flex:1,overflowY:"auto",padding:"2px 6px 6px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:4}}>
              {all.map(item=>{const ic=items.find(i=>i.id===item.id);return(
                <div key={item.id} onClick={()=>add(item)} style={{background:ic?C.purplePale:C.bg,borderRadius:7,padding:7,cursor:"pointer",border:`1px solid ${ic?C.purple+"40":C.border}`,position:"relative"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple} onMouseLeave={e=>e.currentTarget.style.borderColor=ic?C.purple+"40":C.border}>
                  {ic&&<div style={{position:"absolute",top:3,right:3,width:15,height:15,borderRadius:4,background:C.purple,color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{ic.qty}</div>}
                  <div style={{fontSize:10,fontWeight:600,lineHeight:1.2,marginBottom:2}}>{item.name}</div>
                  <span style={{fontSize:10,fontWeight:700,color:C.purple}}>{fmt(item.price)}</span>
                </div>);})}
            </div></div></div>
        <div style={{flex:"1 1 35%",minWidth:210,display:"flex",flexDirection:"column",background:C.bg}}>
          <div style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`,background:C.white,fontSize:12,fontWeight:700}}>Order · {items.reduce((s,i)=>s+i.qty,0)}</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {items.length===0?<div style={{textAlign:"center",padding:20,color:C.textDim,fontSize:10}}>🍽️ Tap items</div>:
              items.map(i=>(
                <div key={i.id} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 7px",background:C.white,margin:"0 4px 2px",borderRadius:5,border:`1px solid ${C.border}`}}>
                  <div style={{flex:1,fontSize:10,fontWeight:600}}>{i.name}</div>
                  <button onClick={()=>updQ(i.id,-1)} style={{width:18,height:18,borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{fontSize:10,fontWeight:700,minWidth:10,textAlign:"center"}}>{i.qty}</span>
                  <button onClick={()=>updQ(i.id,1)} style={{width:18,height:18,borderRadius:4,border:`1px solid ${C.border}`,background:C.white,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  <span style={{fontSize:10,fontWeight:700,color:C.purple,minWidth:40,textAlign:"right"}}>{fmt(i.price*i.qty)}</span>
                  <button onClick={()=>setVoidItem(i)} style={{width:16,height:16,borderRadius:3,border:"none",background:C.redPale,color:C.red,fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>))}
          </div>
          {items.length>0&&<div style={{padding:8,borderTop:`1px solid ${C.border}`,background:C.white}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:6}}><span>Total</span><span style={{color:C.purple}}>{fmt(sub)}</span></div>
            <button onClick={()=>onPlace(items,sub,voided)} style={{width:"100%",padding:"9px",borderRadius:8,border:"none",background:C.purple,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{isAdd?"Add to Bill →":"Place Order →"}</button>
          </div>}
        </div>
      </div>
    </div>
  );
};

const KDS=({orders,onUpdate,onComplete,title,icon,emptyIcon})=>{
  const [,tick]=useState(0);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),10000);return()=>clearInterval(t);},[]);
  const active=orders.filter(o=>o.status!=="completed");
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
                <div><span style={{fontSize:13,fontWeight:800}}>{o.table}</span><span style={{fontSize:7,fontWeight:800,padding:"2px 4px",borderRadius:3,background:bc,color:"#fff",marginLeft:4}}>{o.status==="new"?"NEW":ar?"READY":"COOKING"}</span>
                  <div style={{fontSize:8,color:C.textMuted}}>{o.orderNo} · {o.waiter}</div></div>
                <span style={{fontSize:14,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:el>15?C.red:C.text}}>{el}m</span></div>
              {o.items.map((item,idx)=>(
                <div key={idx} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderBottom:idx<o.items.length-1?`1px solid ${C.borderLight}`:"none"}}>
                  <span style={{flex:1,fontSize:11,fontWeight:600,color:item.itemStatus==="ready"?C.green:C.text,textDecoration:item.itemStatus==="ready"?"line-through":"none"}}>{item.qty}x {item.name}</span>
                  {item.itemStatus==="pending"&&<button onClick={()=>onUpdate(o.id,idx,"cooking")} style={{padding:"2px 6px",borderRadius:3,border:"none",background:C.orangePale,color:C.orange,fontSize:8,fontWeight:700,cursor:"pointer"}}>Start</button>}
                  {item.itemStatus==="cooking"&&<button onClick={()=>onUpdate(o.id,idx,"ready")} style={{padding:"2px 6px",borderRadius:3,border:"none",background:C.greenPale,color:C.green,fontSize:8,fontWeight:700,cursor:"pointer"}}>Done✓</button>}
                  {item.itemStatus==="ready"&&<span style={{color:C.green,fontSize:10}}>✓</span>}
                </div>))}
              {ar&&<div style={{padding:"5px 10px"}}><button onClick={()=>onComplete(o.id)} style={{width:"100%",padding:"6px",borderRadius:5,border:"none",background:C.green,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔔 Call Waiter</button></div>}
              {o.status==="new"&&!ar&&<div style={{padding:"5px 10px"}}><button onClick={()=>o.items.forEach((_,i)=>onUpdate(o.id,i,"cooking"))} style={{width:"100%",padding:"6px",borderRadius:5,border:"none",background:C.orange,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔥 Start All</button></div>}
            </div>);})}
        </div>}</div></div>);};

const CashierView=({tables,orders,onSettle})=>{
  const occ=tables.filter(t=>t.status==="occupied"&&t.currentOrder);const settled=orders.filter(o=>o.settled);const tot=settled.reduce((s,o)=>s+o.total,0);
  return(<div style={{flex:1,overflowY:"auto",padding:14}}>
    <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>💰 Bills</h2>
    <div style={{display:"flex",gap:6,marginBottom:12}}>{[{l:"Open",v:occ.length,c:C.orange},{l:"Settled",v:settled.length,c:C.green},{l:"Revenue",v:fmt(tot),c:C.purple}].map((s,i)=>(
      <div key={i} style={{background:C.white,borderRadius:8,padding:8,flex:1,textAlign:"center",border:`1px solid ${C.border}`}}><div style={{fontSize:8,color:C.textDim}}>{s.l}</div><div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div></div>))}</div>
    {occ.map(t=>{const o=t.currentOrder;return(
      <div key={t.id} style={{background:C.white,borderRadius:10,padding:10,border:`1px solid ${C.border}`,marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div><span style={{fontSize:12,fontWeight:800}}>{t.name} · {o.orderNo}</span><div style={{fontSize:9,color:C.textMuted}}>{o.guests}p · {o.waiter}</div></div>
          <span style={{fontSize:14,fontWeight:800,color:C.purple}}>{fmt(o.total)}</span></div>
        {o.items.map((i,idx)=><div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMid}}><span>{i.qty}x {i.name}</span><span>{fmt(i.price*i.qty)}</span></div>)}
        <Btn primary small onClick={()=>onSettle(t)} style={{width:"100%",marginTop:6}}>Settle — {fmt(o.total)}</Btn>
      </div>);})}
  </div>);
};

const PayModal=({table,order,onDone,onCancel})=>{
  const [method,setMethod]=useState(null);const [mode,setMode]=useState("full");const [splitN,setSplitN]=useState(2);
  const [payments,setPayments]=useState([]);const [done,setDone]=useState(false);const [customAmt,setCustomAmt]=useState("");const [customM,setCustomM]=useState(null);
  const total=order.total;const methods=[{id:"mpesa",icon:"📱",l:"M-Pesa"},{id:"cash",icon:"💵",l:"Cash"},{id:"card",icon:"💳",l:"Card"},{id:"room",icon:"🏨",l:"Room"}];
  const paid=payments.reduce((s,p)=>s+p.amount,0);const rem=total-paid;
  if(done)return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}><div style={{background:C.white,borderRadius:16,padding:22,maxWidth:340,textAlign:"center"}}>
    <div style={{fontSize:32,marginBottom:6}}>✅</div><h2 style={{fontSize:16,fontWeight:800}}>Bill Settled!</h2><p style={{fontSize:11,color:C.textMuted}}>{fmt(total)}</p><p style={{fontSize:9,color:C.green,marginTop:4}}>eTIMS: INV-{Math.floor(Math.random()*90000)+10000}</p>
    <Btn primary small onClick={()=>onDone(payments.length?payments:[{amount:total,method:method||"cash"}])} style={{marginTop:10}}>Done</Btn></div></div>);
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
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",background:p?C.greenPale:C.bg,borderRadius:5,marginBottom:2,border:`1px solid ${p?C.green+"30":C.border}`}}>
            <span style={{fontSize:10,fontWeight:700,minWidth:50}}>Person {i+1}</span>
            <span style={{flex:1,fontSize:10,color:p?C.green:C.textMid}}>{p?`✓ ${p.method}`:fmt(Math.ceil(total/splitN))}</span>
            {!p&&methods.map(m=><button key={m.id} onClick={()=>setPayments(pr=>[...pr,{amount:Math.ceil(total/splitN),method:m.l}])} style={{padding:"2px 5px",borderRadius:3,border:`1px solid ${C.border}`,background:C.white,fontSize:8,cursor:"pointer"}}>{m.icon}</button>)}
          </div>);})}
        {payments.length===splitN&&<button onClick={()=>setDone(true)} style={{width:"100%",padding:"9px",borderRadius:7,border:"none",background:C.green,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>✓ Complete</button>}</>}
      {mode==="custom"&&<><div style={{background:C.bg,borderRadius:7,padding:8,marginBottom:8,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}><span>Paid</span><span style={{color:C.green,fontWeight:700}}>{fmt(paid)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:800,color:rem>0?C.orange:C.green}}><span>Remaining</span><span>{fmt(rem)}</span></div></div>
        {payments.map((p,i)=><div key={i} style={{fontSize:9,color:C.green}}>✓ {fmt(p.amount)} via {p.method}</div>)}
        {rem>0&&<div style={{marginTop:6}}>
          <input value={customAmt} onChange={e=>setCustomAmt(e.target.value.replace(/\D/g,""))} placeholder={`Amount (max ${fmt(rem)})`} style={{width:"100%",padding:"7px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13,fontWeight:700,textAlign:"center",outline:"none",marginBottom:4}}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginBottom:4}}>
            {methods.map(m=><div key={m.id} onClick={()=>setCustomM(m.id)} style={{padding:5,borderRadius:5,border:`1.5px solid ${customM===m.id?C.purple:C.border}`,textAlign:"center",cursor:"pointer",background:customM===m.id?C.purplePale:C.white}}><span style={{fontSize:12}}>{m.icon}</span><div style={{fontSize:7,fontWeight:600}}>{m.l}</div></div>)}</div>
          <button onClick={()=>{const a=Math.min(parseInt(customAmt)||0,rem);if(a>0&&customM){setPayments(p=>[...p,{amount:a,method:methods.find(m=>m.id===customM).l}]);setCustomAmt("");setCustomM(null);}}} disabled={!customM||!parseInt(customAmt)} style={{width:"100%",padding:"8px",borderRadius:6,border:"none",background:C.purple,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",opacity:!customM?0.5:1}}>Add Payment</button>
        </div>}
        {rem<=0&&<button onClick={()=>setDone(true)} style={{width:"100%",padding:"9px",borderRadius:7,border:"none",background:C.green,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>✓ Complete Bill</button>}</>}
    </div></div>);
};

const StockView=({stock})=>{const low=stock.filter(s=>s.qty<=s.reorder);return(
  <div style={{flex:1,overflowY:"auto",padding:14}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>📦 Stock</h2><Btn primary small>+ Add</Btn></div>
    {low.length>0&&<div style={{background:C.redPale,borderRadius:8,padding:8,marginBottom:10,fontSize:10,color:C.red}}>⚠ {low.length} items low: {low.map(s=>s.name).join(", ")}</div>}
    <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",padding:"6px 10px",background:C.bg,fontSize:8,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}><span>Item</span><span>Cat</span><span>Stock</span><span>Reorder</span><span>Status</span></div>
      {stock.map(s=>{const l=s.qty<=s.reorder;return(
        <div key={s.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",padding:"6px 10px",borderBottom:`1px solid ${C.borderLight}`,fontSize:10,alignItems:"center"}}>
          <span style={{fontWeight:600}}>{s.name}</span><span style={{color:C.textMuted}}>{s.cat}</span>
          <span style={{fontWeight:700,color:l?C.red:C.text}}>{s.qty} {s.unit}</span><span style={{color:C.textDim}}>{s.reorder}</span>
          <Badge color={l?C.red:C.green} bg={l?C.redPale:C.greenPale}>{l?"Low":"OK"}</Badge></div>);})}
    </div></div>);};

const StaffView=({users,shifts})=>{const active=shifts.filter(s=>s.active);return(
  <div style={{flex:1,overflowY:"auto",padding:14}}>
    <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8}}>👥 Staff</h2>
    <h3 style={{fontSize:12,fontWeight:700,marginBottom:6}}>On Shift ({active.length})</h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6,marginBottom:14}}>
      {active.map(s=><div key={s.id} style={{background:C.white,borderRadius:8,padding:10,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,fontWeight:700}}>{s.userName}</span><Dot color={C.green}/></div>
        <div style={{fontSize:9,color:C.textMuted}}>{ROLES[s.role]?.label} · {Math.round((Date.now()-s.startTime)/60000)}m</div></div>)}</div>
    <h3 style={{fontSize:12,fontWeight:700,marginBottom:6}}>All Staff</h3>
    {users.map(u=><div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,borderRadius:6,padding:8,border:`1px solid ${C.border}`,marginBottom:3,opacity:u.active?1:0.5}}>
      <div><span style={{fontSize:11,fontWeight:700}}>{u.name}</span><span style={{fontSize:9,color:C.textMuted,marginLeft:6}}>@{u.username} · {ROLES[u.role]?.label}</span></div>
      <Badge color={u.active?C.green:C.red} bg={u.active?C.greenPale:C.redPale}>{u.active?"Active":"Off"}</Badge></div>)}</div>);};

const UsersView=({users,onAdd,onToggle,onReset})=>{const [show,setShow]=useState(false);const [nu,setNu]=useState({name:"",username:"",role:"waiter"});return(
  <div style={{flex:1,overflowY:"auto",padding:14}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>⚙ Users</h2><Btn primary small onClick={()=>setShow(!show)}>+ Add</Btn></div>
    {show&&<div style={{background:C.white,borderRadius:10,padding:12,border:`2px solid ${C.purple}30`,marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Name</label><input value={nu.name} onChange={e=>setNu(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div>
        <div><label style={{fontSize:8,fontWeight:600,color:C.textMid}}>Username</label><input value={nu.username} onChange={e=>setNu(p=>({...p,username:e.target.value}))} style={{width:"100%",padding:"6px",borderRadius:5,border:`1px solid ${C.border}`,fontSize:11,outline:"none"}}/></div></div>
      <div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:6}}>
        {Object.entries(ROLES).map(([k,v])=><div key={k} onClick={()=>setNu(p=>({...p,role:k}))} style={{padding:"3px 7px",borderRadius:4,border:`1px solid ${nu.role===k?v.color:C.border}`,background:nu.role===k?`${v.color}10`:C.white,fontSize:9,fontWeight:nu.role===k?700:400,color:nu.role===k?v.color:C.textMid,cursor:"pointer"}}>{v.icon} {v.label}</div>)}</div>
      <div style={{display:"flex",gap:4}}><Btn small onClick={()=>setShow(false)}>Cancel</Btn><Btn primary small disabled={!nu.name||!nu.username} onClick={()=>{onAdd(nu);setNu({name:"",username:"",role:"waiter"});setShow(false);}} style={{flex:1}}>Create</Btn></div>
    </div>}
    {users.map(u=>{const r=ROLES[u.role];return(
      <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,borderRadius:7,padding:8,border:`1px solid ${C.border}`,marginBottom:3,opacity:u.active?1:0.5}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{width:24,height:24,borderRadius:6,background:`${r.color}15`,color:r.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800}}>{u.name.split(" ").map(n=>n[0]).join("")}</div>
          <div><div style={{fontSize:10,fontWeight:700}}>{u.name}</div><div style={{fontSize:8,color:C.textMuted}}>@{u.username} · {r.label}</div></div></div>
        <div style={{display:"flex",gap:2}}>
          <button onClick={()=>onToggle(u.id)} style={{padding:"2px 5px",borderRadius:3,border:`1px solid ${C.border}`,fontSize:7,fontWeight:600,color:u.active?C.red:C.green,cursor:"pointer",background:C.white}}>{u.active?"Disable":"Enable"}</button>
          <button onClick={()=>onReset(u.id)} style={{padding:"2px 5px",borderRadius:3,border:`1px solid ${C.border}`,fontSize:7,fontWeight:600,color:C.orange,cursor:"pointer",background:C.white}}>Reset PW</button></div></div>);})}
  </div>);};

const MenuMgmt=()=>{const [active,setActive]=useState("Lunch");const menus={"Breakfast":{h:"6-10:30",c:6},"Lunch":{h:"12-15:00",c:8},"Dinner":{h:"18-22:00",c:8},"Room Service":{h:"24/7",c:6},"Bar":{h:"10-00:00",c:6}};
  const items=MENU_ITEMS.filter(i=>active==="Bar"?i.dest==="bar":active==="Room Service"?true:true).slice(0,10);
  return(<div style={{flex:1,overflowY:"auto",padding:14}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>📋 Menus</h2><Btn primary small>+ New Menu</Btn></div>
    <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap"}}>
      {Object.entries(menus).map(([k,v])=><button key={k} onClick={()=>setActive(k)} style={{padding:"5px 10px",borderRadius:6,border:active===k?"none":`1px solid ${C.border}`,background:active===k?C.purple:C.white,color:active===k?"#fff":C.textMid,fontSize:10,fontWeight:600,cursor:"pointer"}}>{k} <span style={{fontSize:8,opacity:0.7}}>({v.h})</span></button>)}</div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:13,fontWeight:700}}>{active}</span><Btn small>+ Add Item</Btn></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:5}}>
      {items.map(i=><div key={i.id} style={{background:C.white,borderRadius:8,padding:10,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between"}}>
        <div><div style={{fontSize:11,fontWeight:600}}>{i.name}</div><div style={{fontSize:8,color:C.textMuted}}>{i.dest==="bar"?"🍺 Bar":"🍳 Kitchen"}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:11,fontWeight:700,color:C.purple}}>{fmt(i.price)}</div><button style={{fontSize:7,color:C.textDim,background:"none",border:"none",cursor:"pointer"}}>Edit</button></div></div>)}</div>
  </div>);};

/* ═══════ MAIN ═══════ */
export default function App(){
  const [users,setUsers]=useState(INIT_USERS);const [step,setStep]=useState("login");const [user,setUser]=useState(null);
  const [shifts,setShifts]=useState([]);const [shift,setShift]=useState(null);
  const [tables,setTables]=useState(INIT_TABLES);const [rooms,setRooms]=useState(INIT_ROOMS);const [facilities]=useState(FACILITIES);
  const [stock]=useState(STOCK);const [tab,setTab]=useState("dashboard");
  const [selTable,setSelTable]=useState(null);const [guests,setGuests]=useState(2);const [isAdd,setIsAdd]=useState(false);
  const [allOrders,setAllOrders]=useState([]);const [kitchenQ,setKitchenQ]=useState([]);const [barQ,setBarQ]=useState([]);
  const [orderCtr,setOrderCtr]=useState(1);const [payTable,setPayTable]=useState(null);
  const [showAutoLogout,setShowAutoLogout]=useState(false);const [lastOrd,setLastOrd]=useState("");
  const [,tick]=useState(0);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),15000);return()=>clearInterval(t);},[]);

  const canOrder=user&&["waiter","admin"].includes(user.role);

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
      const order={id:now,orderNo:no,table:selTable.name,tableId:selTable.id,guests,items,total,voidedItems:voided,time:timeNow(),status:"active",waiter:user.name,settled:false};
      setAllOrders(p=>[...p,order]);setTables(p=>p.map(t=>t.id===selTable.id?{...t,status:"occupied",currentOrder:order}:t));}
    const ki=items.filter(i=>i.dest==="kitchen"),bi=items.filter(i=>i.dest==="bar");
    if(ki.length)setKitchenQ(p=>[...p,{id:now+"-k",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",isAddition:isAdd,items:ki.map(i=>({...i,itemStatus:"pending"}))}]);
    if(bi.length)setBarQ(p=>[...p,{id:now+"-b",orderNo:no,table:selTable.name,waiter:user.name.split(" ")[0],guests,placedAt:now,status:"new",isAddition:isAdd,items:bi.map(i=>({...i,itemStatus:"pending"}))}]);
    setLastOrd(no);if(user.role==="waiter")setShowAutoLogout(true);else{setSelTable(null);setGuests(2);setIsAdd(false);setStep("main");}};

  const updateKDS=(oid,iid,s,q)=>{const set=q==="kitchen"?setKitchenQ:setBarQ;set(p=>p.map(o=>{if(o.id!==oid)return o;const ni=o.items.map((i,idx)=>idx===iid?{...i,itemStatus:s}:i);return{...o,items:ni,status:ni.every(i=>i.itemStatus==="ready")?"ready":ni.some(i=>i.itemStatus==="cooking")?"cooking":o.status};}));};
  const completeKDS=(oid,q)=>{(q==="kitchen"?setKitchenQ:setBarQ)(p=>p.map(o=>o.id===oid?{...o,status:"completed"}:o));};
  const handleSettle=payments=>{setTables(p=>p.map(x=>x.id===payTable.id?{...x,status:"available",currentOrder:null}:x));setAllOrders(p=>p.map(o=>o.id===payTable.currentOrder.id?{...o,settled:true,payments}:o));setPayTable(null);};

  // Room management
  const checkIn=(roomId,guest,total)=>{setRooms(p=>p.map(r=>r.id===roomId?{...r,status:"occupied",guest,folio:[{desc:`Room (${guest.nights} nights)`,amount:total,time:timeNow()}]}:r));};
  const checkOut=(roomId)=>{setRooms(p=>p.map(r=>r.id===roomId?{...r,status:"cleaning",guest:null,folio:[]}:r));};
  const changeRoomStatus=(roomId,status)=>{setRooms(p=>p.map(r=>r.id===roomId?{...r,status}:r));};

  const logout=()=>{setUser(null);setStep("login");setSelTable(null);setGuests(2);setIsAdd(false);};
  const endShift=()=>{setShifts(p=>p.map(s=>s.id===shift?.id?{...s,active:false}:s));logout();setShift(null);};
  const autoLogout=()=>{setShowAutoLogout(false);setUser(null);setSelTable(null);setGuests(2);setIsAdd(false);setStep("login");};

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {showAutoLogout&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
        <div style={{background:C.white,borderRadius:16,padding:22,maxWidth:340,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:4}}>✅</div><h2 style={{fontSize:16,fontWeight:800}}>Order Placed!</h2>
          <p style={{fontSize:11,color:C.textMuted}}>{lastOrd} → Kitchen & Bar</p>
          <div style={{background:C.orangePale,borderRadius:6,padding:8,margin:"10px 0",fontSize:10,color:C.orange}}>🔒 Auto-logout for security. Shift stays active.</div>
          <Btn primary onClick={autoLogout} style={{width:"100%"}}>OK</Btn></div></div>}

      {payTable&&<PayModal table={payTable} order={payTable.currentOrder} onDone={handleSettle} onCancel={()=>setPayTable(null)}/>}

      {step==="login"&&<Login users={users} shifts={shifts} onLogin={handleLogin}/>}
      {step==="startShift"&&<StartShift user={user} showFloat={user?.role==="cashier"} onStart={f=>{const s={id:Date.now(),userId:user.id,userName:user.name,role:user.role,startTime:Date.now(),float:f,active:true};setShifts(p=>[...p,s]);setShift(s);setStep("main");setTab(ROLES[user.role].tabs[0]);}} onBack={()=>{setUser(null);setStep("login");}}/>}

      {step==="main"&&<div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <Header user={user} shift={shift} tab={tab} setTab={setTab} onLogout={logout} onEndShift={endShift}
          badges={{kitchen:kitchenQ.filter(o=>o.status==="new").length,bar:barQ.filter(o=>o.status==="new").length,bills:tables.filter(t=>t.status==="occupied").length}}/>
        {tab==="dashboard"&&<Dashboard orders={allOrders} tables={tables} rooms={rooms} stock={stock} kitchenQ={kitchenQ} barQ={barQ} facilities={facilities}/>}
        {tab==="tables"&&<TablesView tables={tables} canOrder={canOrder} onNew={t=>{setSelTable(t);setIsAdd(false);setStep("guests");}} onAdd={t=>{setSelTable(t);setGuests(t.currentOrder?.guests||2);setIsAdd(true);setStep("order");}}/>}
        {tab==="kitchen"&&<KDS orders={kitchenQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"kitchen")} onComplete={o=>completeKDS(o,"kitchen")} title="Kitchen Display" icon="🍳" emptyIcon="👨‍🍳"/>}
        {tab==="bar"&&<KDS orders={barQ} onUpdate={(o,i,s)=>updateKDS(o,i,s,"bar")} onComplete={o=>completeKDS(o,"bar")} title="Bar Display" icon="🍺" emptyIcon="🍹"/>}
        {tab==="cashier"&&<CashierView tables={tables} orders={allOrders} onSettle={t=>setPayTable(t)}/>}
        {tab==="rooms"&&<RoomsView rooms={rooms} onCheckIn={checkIn} onCheckOut={checkOut} onChangeStatus={changeRoomStatus} onPostCharge={r=>alert(`Post charge to Room ${r.name}`)}/>}
        {tab==="facilities"&&<FacilitiesView facilities={facilities}/>}
        {tab==="menu"&&<MenuMgmt/>}
        {tab==="stock"&&<StockView stock={stock}/>}
        {tab==="staff"&&<StaffView users={users} shifts={shifts}/>}
        {tab==="users"&&<UsersView users={users} onAdd={nu=>setUsers(p=>[...p,{...nu,id:Date.now(),password:"changeme",active:true}])} onToggle={id=>setUsers(p=>p.map(u=>u.id===id?{...u,active:!u.active}:u))} onReset={id=>setUsers(p=>p.map(u=>u.id===id?{...u,password:"changeme"}:u))}/>}
      </div>}

      {step==="guests"&&selTable&&<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{background:C.white,borderRadius:16,padding:22,maxWidth:300,width:"100%",textAlign:"center",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:22,marginBottom:4}}>🪑</div>
          <h2 style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{selTable.name}</h2>
          <p style={{fontSize:10,color:C.textMuted,marginBottom:14}}>{selTable.seats} seats</p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:14}}>
            <button onClick={()=>setGuests(Math.max(1,guests-1))} style={{width:32,height:32,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,fontSize:13,cursor:"pointer"}}>−</button>
            <span style={{fontSize:26,fontWeight:800,color:C.purple,fontFamily:"'Outfit',sans-serif"}}>{guests}</span>
            <button onClick={()=>setGuests(guests+1)} style={{width:32,height:32,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,fontSize:13,cursor:"pointer"}}>+</button></div>
          <div style={{display:"flex",gap:6}}><Btn onClick={()=>{setSelTable(null);setStep("main");}} style={{flex:1}}>Back</Btn>
            <Btn primary onClick={()=>setStep("order")} style={{flex:1}}>Start Order</Btn></div>
        </div></div>}

      {step==="order"&&<OrderScreen user={user} table={selTable} guests={guests} existing={isAdd?selTable?.currentOrder?.items:null} isAdd={isAdd} onPlace={handlePlace} onBack={()=>{if(isAdd){setIsAdd(false);setStep("main");}else setStep("guests");}}/>}
    </div>
  );
}
