'use strict';
/* FLYXJ two-way mobile alerts. Native Android bridge provides lock-screen
   notifications when permitted; browser notifications are opt-in. */
(function(){
 const desktopSeen=new Set(),pending=[];
 let account='',source=null,initialised=false;
 const isTrusted=()=>location.origin==='https://flyxj-order-manager-free.onrender.com';
 const native=()=>isTrusted()&&typeof window.FlyxjAlerts?.notify==='function';
 const idOf=(kind,p)=>kind+':'+String(p.order_id||p.id||'')+':'+String(p.updated_at||p.at||'');
 function show(kind,p){
  if(!account||!p)return;
  const actor=p.actor||p.from;
  if(actor&&actor===account)return;
  if(kind==='order'&&window.FlyxjCurrentRole!=='staff')return;
  if(kind!=='order'&&kind!=='chat'&&window.FlyxjCurrentRole!=='customer')return;
  if(kind==='chat'&&p.to&&p.to!==account)return;
  const id=kind==='chat'?'chat:'+p.id:(p.activity_id?'order:'+p.activity_id:idOf(kind,p));
  if(desktopSeen.has(id))return;
  desktopSeen.add(id);if(desktopSeen.size>200)desktopSeen.delete(desktopSeen.values().next().value);
  let title=kind==='order'?'New FLYXJ order':
    kind==='chat'?'New FLYXJ message':kind==='shipping'?'Shipping / tracking updated':
    kind==='status'?'Order status updated':'FLYXJ order update';
  const body=kind==='chat'?'New message received':String(p.description||p.reference||'New activity').slice(0,100);
  const url=kind==='chat'?'/chat':('/order/'+Number(p.order_id||0));
  const at=String(p.updated_at||p.at||new Date().toISOString());
  if(native()){
   try{window.FlyxjAlerts.notify(JSON.stringify({id,title,body,url,at}));return}catch{}
  }
  if('Notification' in window&&Notification.permission==='granted'){
   try{const alert=new Notification(title,{body,tag:id});alert.onclick=()=>{window.focus();location.assign(url)}}catch{}
  }
 }
 function attach(me){
  if(!me||!me.username)return;
  const changed=account!==me.username;
  account=me.username;window.FlyxjCurrentRole=me.role;
  if(native()&&typeof window.FlyxjAlerts.register==='function'){
   try{window.FlyxjAlerts.register(account)}catch{}
  }
  if(!initialised||changed){
   initialised=true;
   // Existing events don't trigger notifications on first sign-in.
   fetch('/api/notifications',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null)
    .then(data=>{if(!data||data.account!==account)return;for(const x of data.notifications||[])desktopSeen.add(x.id)})
    .catch(()=>{});
  }
 }
 function clear(){
  account='';window.FlyxjCurrentRole=null;desktopSeen.clear();
  if(native()&&typeof window.FlyxjAlerts.unregister==='function')try{window.FlyxjAlerts.unregister()}catch{}
 }
 async function permission(){
  if(native()&&typeof window.FlyxjAlerts.requestPermission==='function'){
   window.FlyxjAlerts.requestPermission();return;
  }
  if(!('Notification' in window))return alert('Notifications are not supported in this browser');
  const status=await Notification.requestPermission();
  alert(status==='granted'?'FLYXJ notifications enabled':'Please allow notifications in your browser settings');
 }
 window.FlyxjNotifications={attach,clear,show,permission};
})();
