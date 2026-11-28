'use strict';
/* FlyXJ V13: private, role-aware app command strip and notification onboarding.
   No credentials, files, or notification content are sent to third parties. */
(function(){
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
 let currentAccount='',strip=null,lastAlert=0;
 const logged=()=>typeof state!=='undefined'&&!!state.me&&!!$('dashboardShell')&&!$('dashboardShell').classList.contains('hidden');
 const native=()=>/FlyXJAndroid\/\d+/.test(navigator.userAgent)&&typeof window.FlyxjAlerts?.notify==='function';
 function button(label,action,primary=false){
  const x=el('button','fx13-action'+(primary?' fx13-action-primary':''),label);x.type='button';x.onclick=action;return x;
 }
 function status(text,ok){
  const s=$('fx13ServerStatus');if(s){s.textContent=text;s.dataset.status=ok?'good':'warn';}
 }
 function installedVersion(){return (/FlyXJAndroid\/(\d+)/.exec(navigator.userAgent)||[])[1]||'Web';}
 async function verify(){
  if(!logged())return;
  try{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   try{
    const r=await fetch('/api/health',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    const data=r.ok?await r.json():null;
    status(data?.ok?'Connected · Secure sync':'Connection interrupted',!!data?.ok);
    const storage=$('fx13StorageStatus');
    if(storage)storage.textContent=data?.storage==='supabase-private'?'Private backup connected':'Check backup';
   }finally{clearTimeout(timeout)}
  }catch{status('Offline · retrying',false)}
 }
 function permissionLabel(){
  if(native())return 'Enable Android alerts';
  if(!('Notification' in window))return 'View notifications';
  return Notification.permission==='granted'?'Notifications enabled':'Enable notifications';
 }
 function showBanner(count,initial){
  if(!logged()||count<1)return;
  const anchor=$('fx13Notice');if(!anchor)return;
  if(!initial&&Date.now()-lastAlert<800)return;
  lastAlert=Date.now();
  const message=$('fx13NoticeText');message.textContent=initial
    ? count+' recent updates are available in your inbox.'
    : count+' new update'+(count===1?'':'s')+' since your last check. Tap to review.';
  anchor.hidden=false;
  const counter=$('fx13Alerts');if(counter)counter.textContent=String(count)+' recent';
 }
 function setup(){
  if(!logged())return;
  const host=$('statsGrid'),intro=document.querySelector('.page-intro');
  if(!host||!intro)return;
  if(!strip){
   strip=el('section','fx13-command');strip.id='fx13Command';strip.setAttribute('aria-label','FLYXJ workspace command centre');
   const heading=el('div','fx13-command-heading');
   const copy=el('div','fx13-heading-copy');
   copy.append(el('span','fx13-eyebrow','FLYXJ · OPERATIONS CENTRE'),el('h2','','Your production workspace'),
    el('p','','Orders, dispatch and team activity — a single clean workspace.'));
   const live=el('span','fx13-live-pill','● Checking connection');live.id='fx13ServerStatus';live.dataset.status='warn';
   heading.append(copy,live);
   const actions=el('div','fx13-actions');
   actions.append(button('◎ Enable phone alerts',()=>window.FlyxjNotifications?.permission()),
    button('▤ All orders',()=>{if(typeof navigate==='function')navigate('orders')}));
   const notice=el('div','fx13-notice');notice.id='fx13Notice';notice.hidden=true;
   const noteText=el('span','','');noteText.id='fx13NoticeText';
   const view=button('Open inbox',()=>window.FlyxjNotifications?.inbox());view.className='fx13-notice-open';
   const dismiss=button('×',()=>{notice.hidden=true});dismiss.setAttribute('aria-label','Dismiss updates');dismiss.className='fx13-notice-close';
   notice.append(el('span','fx13-notice-icon','●'),noteText,view,dismiss);
   strip.append(heading,actions,notice);
  }
  if(strip.parentNode!==intro.parentNode)intro.after(strip);
  strip.classList.toggle('fx13-staff',state.me.role==='staff');
  const heading=strip.querySelector('h2');
  if(heading)heading.textContent=state.me.role==='staff'?'Production command centre':'Your order workspace';
  const para=strip.querySelector('.fx13-heading-copy p');
  if(para)para.textContent=state.me.role==='staff'
   ?'Priorities, customer requests and dispatch — ready for the production team.'
   :'Your dress orders, tracking and production messages at a glance.';
  strip.hidden=false;update();
  const bell=el('span','fx13-bell-symbol','♧');
  const existing=$('notificationButton');if(existing&&!existing.querySelector('.fx13-bell-symbol')){
   for(const n of [...existing.childNodes])if(n.nodeType===3)n.remove();
   existing.prepend(bell);existing.setAttribute('aria-label','Open notifications');
  }
 }
 function update(){
  if(!logged())return;
  const total=$('fx13OrderTotal'),attention=$('fx13AttentionCount');
  if(total)total.textContent=String(state.orders.length);
  const active=state.orders.filter(o=>{
   if(state.me.role==='staff')return ['pending','awaiting_approval','cutting','stitching','in_progress','quality_check'].includes(o.status);
   return ['pending','awaiting_approval','confirmed','cutting','stitching','in_progress','quality_check'].includes(o.status);
  });
  if(attention)attention.textContent=String(active.length);
 }
 function logout(){if(strip)strip.hidden=true;currentAccount='';}
 window.FlyxjPro={
  onLogin(me){if(!me?.username)return;const changed=currentAccount!==me.username;currentAccount=me.username;setup();if(changed)verify();},
  onLogout:logout,
  onRefresh:update,
  onChecked(time){if(!logged())return;const item=$('fx13LastSync');if(item)item.textContent=new Date(time).toLocaleTimeString();},
  onNotifications:({count,initial})=>showBanner(count,initial),
  verify
 };
 window.addEventListener('online',()=>verify());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&logged()){update();verify();}});
})();
