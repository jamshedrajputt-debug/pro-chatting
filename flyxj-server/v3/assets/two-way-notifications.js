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
 async function inbox(){
  if(!account)return;
  let feed;
  try{
   const response=await fetch('/api/notifications',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Notifications unavailable');
   feed=(await response.json()).notifications||[];
  }catch(e){alert(e.message);return}
  let backdrop=document.getElementById('fx9NotificationInbox');
  if(backdrop)backdrop.remove();
  backdrop=document.createElement('div');backdrop.id='fx9NotificationInbox';
  backdrop.style.cssText='position:fixed;inset:0;z-index:1200;background:#091b338c;display:flex;align-items:flex-end;justify-content:center;padding:0';
  const content=document.createElement('section');content.setAttribute('role','dialog');
  content.setAttribute('aria-label','FLYXJ notifications');
  content.style.cssText='width:min(600px,100%);max-height:84vh;overflow:auto;background:white;color:#14294b;border-radius:19px 19px 0 0;padding:18px;box-shadow:0 -8px 35px #0003';
  const head=document.createElement('div');head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px';
  const h=document.createElement('h2');h.textContent='FLYXJ Notifications';h.style.margin='0';
  const close=document.createElement('button');close.textContent='✕ Close';close.type='button';close.onclick=()=>backdrop.remove();
  close.style.cssText='padding:9px;border:1px solid #cbd6eb;border-radius:9px;background:#fff;color:#345';
  head.append(h,close);content.append(head);
  if(!feed.length){const empty=document.createElement('p');empty.textContent='No recent notifications';content.append(empty)}
  for(const notice of feed){
   if(!['/chat'].includes(notice.url)&&!/^\/order\/[1-9][0-9]{0,8}$/.test(notice.url))continue;
   const row=document.createElement('a');row.href=notice.url;row.style.cssText='display:block;border-bottom:1px solid #e8edf7;padding:14px 3px;text-decoration:none;color:#172c4e';
   const title=document.createElement('strong');title.textContent=notice.title;
   const body=document.createElement('p');body.textContent=notice.body;body.style.cssText='font-size:12px;color:#546985;margin:5px 0';
   const date=document.createElement('small');date.textContent=new Date(notice.at).toLocaleString();
   row.append(title,body,date);content.append(row);
  }
  backdrop.append(content);document.body.append(backdrop);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove()});
  close.focus();
 }
 async function permission(){
  if(native()&&typeof window.FlyxjAlerts.requestPermission==='function'){
   window.FlyxjAlerts.requestPermission();return;
  }
  if(!('Notification' in window))return alert('Notifications are not supported in this browser');
  const status=await Notification.requestPermission();
  alert(status==='granted'?'FLYXJ notifications enabled':'Please allow notifications in your browser settings');
 }
 window.FlyxjNotifications={attach,clear,show,permission,inbox};
})();
