'use strict';
/* FLYXJ V8: DOM enhancement; no database writes, no new access to private server data. */
(function(){
const byId=id=>document.getElementById(id);
const el=(tag,cl,text)=>{const x=document.createElement(tag);if(cl)x.className=cl;if(text!==undefined)x.textContent=String(text);return x};
const icons={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 orders:'<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
 files:'<path d="M6 3h7l5 5v13H6z"/><path d="M13 3v5h5M9 13h6M9 17h5"/>',
 chat:'<path d="M4 5h16v12H9l-5 4z"/><path d="M8 10h8M8 13h6"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
const now=()=>Date.now();
const onlyLogged=()=>typeof state!=='undefined'&&!!state.me;
const isStaff=()=>onlyLogged()&&state.me.role==='staff';
const scope=()=>onlyLogged()?'flyxj-v8-draft-'+encodeURIComponent(state.me.username):null;
let activeModal=null, draftHistory=[],draftTimer=null,lastDraftSnapshot=null;
function actionBtn(label,handler,primary=false){
 const b=el('button','fx8-button'+(primary?' fx8-button-primary':''),label);
 b.type='button';b.addEventListener('click',handler);return b;
}
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.innerHTML=icons[name];return s}
function modal(title,subtitle){
 if(activeModal)activeModal.remove();
 const mask=el('div','fx8-surface');mask.setAttribute('role','presentation');
 const sheet=el('section','fx8-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',title);
 const h=el('header','fx8-sheet-head');const titlebox=el('div');titlebox.append(el('h2','',title),el('p','',subtitle||''));
 const close=actionBtn('×',()=>hide());close.className='fx8-close';close.setAttribute('aria-label','Close');
 h.append(titlebox,close);const body=el('div','fx8-sheet-body');sheet.append(h,body);mask.append(sheet);
 const hide=()=>{if(activeModal===mask)activeModal=null;mask.remove();document.body.classList.remove('fx8-body-modal')};
 mask.addEventListener('click',e=>{if(e.target===mask)hide()});
 mask.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
 document.body.append(mask);document.body.classList.add('fx8-body-modal');activeModal=mask;close.focus();
 return {body,hide};
}
function healthValue(parent,label,value,cls){
 const card=el('div','fx8-health-item');card.append(el('small','',label),el('strong',cls||'',value));
 parent.append(card);return card.lastElementChild;
}
async function health(){
 if(!onlyLogged())return;
 const ui=modal('App Health Centre','Connection status, storage, app updates and account diagnostics.');
 const grid=el('div','fx8-health-grid');ui.body.append(grid);
 const host=healthValue(grid,'Server','Checking…');
 const storage=healthValue(grid,'Private storage','Checking…');
 const count=healthValue(grid,'Visible orders',String(state.orders.length));
 const account=healthValue(grid,'Signed-in role',state.me.role+' · '+state.me.username);
 const sync=healthValue(grid,'Last check','Checking…');
 const app=healthValue(grid,'Android app version',(/FlyXJAndroid\/(\d+)/.exec(navigator.userAgent)||[])[1]||'Web / earlier app');
 const release=healthValue(grid,'Latest release','Checking…');
 const connection=healthValue(grid,'Internet',navigator.onLine?'Connected':'Offline');
 const status=el('div','fx8-status');ui.body.append(status);
 const refresh=actionBtn('↻ Recheck health',()=>{ui.hide();health()},true);ui.body.append(refresh);
 try{
   const r=await fetch('/api/health',{cache:'no-store',credentials:'same-origin'});
   if(!r.ok)throw Error('Health check failed');
   const data=await r.json();
   host.textContent=data.ok?'Online':'Unhealthy';host.className=data.ok?'fx8-green':'fx8-orange';
   storage.textContent=data.storage==='supabase-private'?'Supabase private storage':'Ephemeral storage';
   storage.className=data.storage==='supabase-private'?'fx8-green':'fx8-orange';
   sync.textContent=new Date().toLocaleString();
   status.textContent='System version: '+(data.version||'unknown')+' · Your files and order data are not changed by this check.';
 }catch(e){host.textContent='Unavailable';host.className='fx8-orange';status.textContent='Cannot reach server: '+e.message}
 try{
   const r=await fetch('/assets/android-update.json?v8-health',{cache:'no-store'});
   if(r.ok){const data=await r.json();release.textContent='V'+data.version;const see=el('a','fx8-button','See official APK release');see.href=data.release;see.target='_blank';see.rel='noopener noreferrer';ui.body.append(see)}
   else release.textContent='Unavailable';
 }catch{release.textContent='Unavailable'}
}
function buildNav(){
 if(byId('fx8Nav'))return;
 const nav=el('nav','fx8-bottom-nav');nav.id='fx8Nav';nav.setAttribute('aria-label','Mobile bottom navigation');
 const tabs=[['home','Home',()=>navigate('overview')],['orders','Orders',()=>navigate('orders')],['files','Files',filesCentre],['chat','Chat',()=>{location.assign('/chat')}],['more','More',moreMenu]];
 for(const [key,label,run] of tabs){
  const b=el('button','');b.type='button';b.dataset.tab=key;b.append(icon(key),el('span','',label));b.onclick=run;nav.append(b)
 }
 document.body.append(nav);sync();
}
function sync(){
 const nav=byId('fx8Nav');if(!nav)return;
 nav.classList.toggle('hidden',!onlyLogged());
 for(const b of nav.querySelectorAll('button')){
  const active=b.dataset.tab===(state.view==='orders'?'orders':state.view==='overview'?'home':'more');
  if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')
 }
}
function moreMenu(){
 const ui=modal('FLYXJ Quick Menu','Tools for your daily work.');
 const buttons=el('div','fx8-button-row');ui.body.append(buttons);
 for(const [title,fn] of [
  ['App Health Centre',health],
  ['Files Centre',filesCentre],
  ['Shipment Tracking',()=>navigate('tracking')],
  ['Finance & Profit',()=>navigate('finance')],
  ['Staff & Backup',()=>navigate('team')],
  ['Refresh orders',()=>refresh()]
 ]){
  if(title==='Staff & Backup'&&!isStaff())continue;
  buttons.append(actionBtn(title,()=>{ui.hide();fn()}))
 }
 const p=el('p','fx8-mini-caption','V8 web tools work inside your existing FlyXJ app. No app reinstallation is required for these dashboard changes.');
 ui.body.append(p);
}
function filesCentre(){
 if(!onlyLogged())return;
 const ui=modal('Files Centre','Preview order reference photos and original specifications. Staff can share combined files.');
 const search=el('input','fx8-input');search.placeholder='Find order, title or customer…';search.setAttribute('aria-label','Search order files');
 ui.body.append(search);
 const list=el('div');ui.body.append(list);
 function draw(){
  const q=search.value.trim().toLowerCase();list.replaceChildren();
  const rows=state.orders.filter(o=>[o.reference,o.title,o.customer].some(t=>String(t||'').toLowerCase().includes(q))).slice(0,50);
  if(!rows.length){list.append(el('p','fx8-mini-caption','No matching orders.'));return}
  for(const order of rows){
   const row=el('div','fx8-result-row'),photo=el('img');photo.alt='Order reference photo';
   if(order.photos?.length){photo.src=order.photos[0];photo.onerror=()=>photo.style.visibility='hidden'}
   const details=el('div','fx8-result-meta');details.append(el('b','',order.reference||'Order'),el('span','',order.title||''),el('small','',(order.photos||[]).length+' photos · '+(order.pdf_url?'PDF attached':'PDF missing')));
   const actions=el('div','fx8-button-row');
   actions.append(actionBtn('Preview',()=>{ui.hide();preview(order)}));
   if(isStaff())actions.append(actionBtn('Share',()=>{ui.hide();sharePreset(order)}));
   row.append(photo,details,actions);list.append(row);
  }
 }
 search.oninput=draw;draw();
 ui.body.append(el('p','fx8-mini-caption','Only files from orders authorised to your account are shown. Preview thumbnails require an internet connection.'));
}
function preview(order){
 if(!onlyLogged())return;
 const ui=modal('Smart File Preview',(order.reference||'Order')+' · '+(order.title||''));
 const grid=el('div','fx8-gallery');
 for(const [i,url] of (order.photos||[]).entries()){
  const pic=el('img');pic.src=url;pic.alt='Reference photo '+(i+1);pic.loading='lazy';
  pic.onclick=()=>{
   const overlay=el('div','fx8-modal-fig');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Photo preview');
   const img=el('img');img.src=url;img.alt=pic.alt;
   const close=actionBtn('✕ Close photo',()=>overlay.remove());overlay.append(img,close);
   overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
   document.body.append(overlay);
  };grid.append(pic);
 }
 if(grid.childElementCount)ui.body.append(grid);else ui.body.append(el('p','fx8-mini-caption','No reference photos attached.'));
 const controls=el('div','fx8-button-row');controls.style.marginTop='14px';
 if(order.pdf_url){
   const link=el('a','fx8-button','Open original PDF');link.href=order.pdf_url;link.target='_blank';link.rel='noopener noreferrer';controls.append(link);
 }
 const orderLink=el('a','fx8-button','Open full order');orderLink.href='/order/'+encodeURIComponent(order.id);controls.append(orderLink);
 if(isStaff())controls.append(actionBtn('Share files',()=>{ui.hide();sharePreset(order)},true));
 ui.body.append(controls);
 ui.body.append(el('p','fx8-mini-caption','Full PDF preview opens through an authenticated order link. Files are not stored in the Files Centre.'));
}
function sharePreset(order){
 if(!isStaff())return;
 const ui=modal('Share Files · '+(order.reference||''),'Select a saved preset or choose an attachment combination.');
 const storageKey='flyxj-v8-share-preset-'+encodeURIComponent(state.me.username);
 let selected='both';try{selected=localStorage.getItem(storageKey)||'both'}catch{}
 const options=[['both','Combined PNG + original PDF','Both files in one native Android share chooser'],['maker','Combined maker image only','One PNG with four photos, size and colour'],['pdf','Original PDF only','Preserve original document quality'],['photos','Reference photos','Pick individual photos from existing Share Files menu']];
 const wrap=el('div');ui.body.append(wrap);
 for(const [key,title,description] of options){
  const row=el('div','fx8-preset');const input=el('input');input.type='radio';input.name='fx8Preset';input.value=key;input.checked=key===selected;
  input.onchange=()=>{selected=key;try{localStorage.setItem(storageKey,key)}catch{}};
  const label=el('label','',title);label.append(el('small','',description));label.onclick=()=>{input.checked=true;input.dispatchEvent(new Event('change'))};
  row.append(input,label);wrap.append(row);
 }
 const status=el('p','fx8-status','Files are prepared on demand. Only staff can share Maker files.');ui.body.append(status);
 const button=actionBtn('Share selected files',async()=>{
  if(selected==='both'){
   if(!window.FlyxjShareFiles)return status.textContent='Share service unavailable. Reopen the order.';
   await window.FlyxjShareFiles.share(order.id,button,status);return;
  }
  if(!window.FlyxjOrderActions)return status.textContent='Share menu unavailable';
  ui.hide();window.FlyxjOrderActions.share(order);
 },true);ui.body.append(button);
 ui.body.append(el('p','fx8-mini-caption','Preset saves only your selection on this device, not private attachments. For single files, choose the corresponding action in Share Files.'));
}
function snapshot(){
 const form=byId('newOrderForm');if(!form||!onlyLogged()||state.me.role!=='customer')return null;
 const values={};for(const field of form.querySelectorAll('input,select,textarea')){
  if(!field.id||field.type==='file'||field.type==='password'||field.type==='hidden')continue;
  values[field.id]=field.value.slice(0,3000);
 }return values;
}
function saveDraft(){
 const key=scope();if(!key)return;
 const values=snapshot();if(!values)return;
 const hasContent=Object.entries(values).some(([id,v])=>!['dressQty','customerEarning','orderPriority','dressSize','shoeSize'].includes(id)&&v);
 try{if(hasContent)localStorage.setItem(key,JSON.stringify({time:Date.now(),values}));else localStorage.removeItem(key)}catch(e){
  const notice=byId('fx8DraftStatus');if(notice)notice.textContent='Local draft storage unavailable on this device.'
 }
 const notice=byId('fx8DraftStatus');if(notice&&hasContent)notice.textContent='Draft saved on this device · photos and PDFs must be reselected';
}
function updateDraft(){
 const current=snapshot();if(!current)return;
 if(lastDraftSnapshot&&JSON.stringify(lastDraftSnapshot)!==JSON.stringify(current)){
   draftHistory.push(lastDraftSnapshot);
   if(draftHistory.length>12)draftHistory.shift();
 }
 lastDraftSnapshot=current;
 clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,350);
}
function restoreDraft(){
 const key=scope();if(!key)return false;const form=byId('newOrderForm');if(!form)return false;
 let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{return false}
 if(!saved?.values||now()-saved.time>30*86400000)return false;
 const before=snapshot();if(before)draftHistory.push(before);
 for(const [id,value] of Object.entries(saved.values)){
  const field=byId(id);
  if(field&&form.contains(field)&&!['file','password'].includes(field.type)&&typeof value==='string')field.value=value;
 }
 lastDraftSnapshot=snapshot();
 const notice=byId('fx8DraftStatus');if(notice)notice.textContent='Draft restored · reselect PDF and photos before submitting';
 return true;
}
function undoDraft(){
 if(!draftHistory.length){const x=byId('fx8DraftStatus');if(x)x.textContent='No previous draft change to undo';return}
 const previous=draftHistory.pop(),form=byId('newOrderForm');
 for(const [id,value] of Object.entries(previous)){
  const field=byId(id);if(field&&form.contains(field))field.value=value;
 }
 lastDraftSnapshot=snapshot();saveDraft();
 const status=byId('fx8DraftStatus');if(status)status.textContent='Previous draft values restored';
}
function installDraft(){
 const form=byId('newOrderForm');if(!form||byId('fx8DraftTools'))return;
 const section=el('div','fx8-draft-tools');section.id='fx8DraftTools';
 const status=el('span','', 'Draft saves text fields on this device. PDF/photos are not saved.');status.id='fx8DraftStatus';
 const restore=actionBtn('Restore draft',()=>{if(!restoreDraft())status.textContent='No saved draft for this account'});
 const undo=actionBtn('↶ Undo',undoDraft);
 const clear=actionBtn('Clear draft',()=>{
  if(!confirm('Clear the saved draft text on this device?'))return;
  try{localStorage.removeItem(scope())}catch{};draftHistory=[];lastDraftSnapshot=snapshot();status.textContent='Saved draft cleared';
 });
 section.append(status,restore,undo,clear);
 const footer=form.querySelector('.drawer-footer');if(footer)footer.before(section);else form.prepend(section);
 const fields=()=>{clearTimeout(draftTimer);draftTimer=setTimeout(updateDraft,150)};
 form.addEventListener('input',fields);
 form.addEventListener('change',fields);
 const initial=snapshot();if(initial)lastDraftSnapshot=initial;
}
window.FlyxjV8={
 sync,filesCentre,preview,sharePreset,health,moreMenu,
 onLogin:()=>{sync();const key=scope();try{const raw=JSON.parse(localStorage.getItem(key)||'null');const notice=byId('fx8DraftStatus');if(raw&&notice)notice.textContent='Saved draft found. Tap Restore draft to recover your text.'}catch{}},
 onLogout:()=>{if(activeModal)activeModal.remove();activeModal=null;draftHistory=[];lastDraftSnapshot=snapshot();sync()},
 afterOrderCreated:()=>{const key=scope();try{if(key)localStorage.removeItem(key)}catch{};draftHistory=[];lastDraftSnapshot=null;const status=byId('fx8DraftStatus');if(status)status.textContent='Order created · draft cleared'},
 onFormChange:updateDraft
};
function boot(){buildNav();installDraft()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
