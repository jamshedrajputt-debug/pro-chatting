'use strict';
/* FlyXJ V6 enhancement layer: depends on existing authenticated app.js, no data migrations. */
(function(){
 const $v=id=>document.getElementById(id);
 const n=(tag,cls,label)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=String(label);return el};
 const opts=(values)=>values.map(([value,label])=>{const e=n('option','',label);e.value=value;return e});
 const locked=['completed','delivered','cancelled'];
 let cachedStaff=[],teamPromise=null,noticeReady=false,lastUser='',lastRefresh=0;
 window.flyxjV6Filters={priority:'all',due:'all',assignee:'all',sort:'recent'};
 const getUser=()=>typeof state==='object'?state.me:null;
 function targetDate(delta){const d=new Date(Date.now()+delta*86400000);return d.toISOString().slice(0,10)}
 function showToast(message,error=false){if(typeof toast==='function')toast(message,error)}
 function renderControls(){
  const filter=$v('filterBar');if(!filter||$v('v6Filters'))return;
  const bar=n('div','v6-filters');bar.id='v6Filters';
  const config=[
   ['priority',[['all','All priorities'],['urgent','Urgent'],['high','High'],['normal','Normal']]],
   ['due',[['all','All deadlines'],['overdue','Overdue'],['soon','Due in 3 days']]],
   ['assignee',[['all','All staff'],['unassigned','Unassigned']]],
   ['sort',[['recent','Newest first'],['deadline','Deadline first'],['priority','Highest priority']]]
  ];
  for(const [key,values] of config){
   const wrap=n('label','v6-filter');wrap.append(n('span','',key==='due'?'Due date':key==='assignee'?'Assigned to':key));
   const select=n('select');select.dataset.v6=key;select.setAttribute('aria-label','Filter '+key);select.append(...opts(values));
   select.value=window.flyxjV6Filters[key];
   select.onchange=()=>{window.flyxjV6Filters[key]=select.value;renderOrders()};
   wrap.append(select);bar.append(wrap);
  }
  filter.insertAdjacentElement('afterend',bar);
 }
 function renderCommandCards(){
  const grid=$v('statsGrid');if(!grid||$v('v6Operations'))return;
  const wrap=n('details','v6-operations fx16-insights');wrap.id='v6Operations';
  const summary=n('summary','fx16-insights-toggle','Production insights · overdue, due soon, high priority and assignments');wrap.append(summary);
  const head=n('div','v6-ops-head');
  const title=n('div');title.append(n('span','v6-kicker','PRODUCTION PULSE'),n('h2','','Today’s priorities'));
  const actions=n('div','v6-quick-actions');
  const all=n('button','v6-small-primary','View orders');all.type='button';all.onclick=()=>navigate('orders');
  actions.append(all);
  if(getUser()?.role==='customer'){const add=n('button','v6-small-outline','+ New order');add.type='button';add.onclick=()=>openCreate();actions.append(add)}
  head.append(title,actions);wrap.append(head);
  const cards=n('div','v6-ops-cards');
  for(const [key,label,icon] of [['active','Active','▣'],['overdue','Overdue','!'],['due_soon','Due soon','◷'],['priority','High priority','◆'],['unassigned','Unassigned','♙']]){
   const card=n('button','v6-ops-card');card.type='button';card.dataset.metric=key;
   card.append(n('span','v6-metric-icon',icon),n('strong','v6-metric-count','—'),n('small','',label));
   card.onclick=()=>{
    navigate('orders');
    window.flyxjV6Filters.priority='all';
    if(key==='priority')window.flyxjV6Filters.sort='priority';
    window.flyxjV6Filters.due=key==='overdue'?'overdue':key==='due_soon'?'soon':'all';
    window.flyxjV6Filters.assignee=key==='unassigned'?'unassigned':'all';
    for(const selector of document.querySelectorAll('#v6Filters select')){
      const field=selector.dataset.v6;
      selector.value=window.flyxjV6Filters[field];
    }
    renderOrders();
   };
   cards.append(card);
  }
  wrap.append(cards);
  const info=n('div','v6-ops-bottom');
  const health=n('span','v6-storage','Checking secure storage…');health.id='v6Storage';
  const seen=n('span','v6-freshness','Live production overview');seen.id='v6Freshness';
  info.append(health,seen);wrap.append(info);
  grid.insertAdjacentElement('afterend',wrap);
 }
 async function loadStaff(){
  if(getUser()?.role!=='staff')return [];
  if(teamPromise)return teamPromise;
  teamPromise=api('/api/staff').then(d=>{
    cachedStaff=(d.staff||[]).filter(s=>s.active).map(s=>s.name);
    const owner=!!d.can_manage;
    for(const id of ['staffCreateForm','exportBackup','restoreBackup','backupFile']){
      const el=$v(id);if(el)el.classList.toggle('hidden',!owner);
    }
    const team=$v('teamPanel');
    if(team&&!$v('v6OwnerAccess')){
      const notice=n('p','v6-access-note');notice.id='v6OwnerAccess';
      notice.textContent=owner?'Owner access: backup, restore and account creation enabled.':'Staff access: production operations allowed. Backups, restore and account creation are owner-only.';
      team.prepend(notice);
    }
    const select=$v('v6Filters')?.querySelector('[data-v6="assignee"]');
    if(select){
      const old=select.value;select.replaceChildren(...opts([['all','All staff'],['unassigned','Unassigned'],...cachedStaff.map(s=>[s,s])]));select.value=cachedStaff.includes(old)||['all','unassigned'].includes(old)?old:'all';
    }
    return cachedStaff;
  }).catch(err=>{showToast('Staff list unavailable: '+err.message,true);return []}).finally(()=>{teamPromise=null});
  return teamPromise;
 }
 window.flyxjV6Assign=async order=>{
  if(getUser()?.role!=='staff')return;
  const staff=await loadStaff();
  const shell=n('div','v6-modal-backdrop');shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');
  const modal=n('div','v6-modal');
  modal.append(n('h2','','Assign production'),n('p','',order.reference+' · '+order.title));
  const label=n('label','','Responsible staff');
  const select=n('select');select.setAttribute('aria-label','Assign production staff');
  select.append(...opts([['','Unassigned'],...staff.map(x=>[x,x])]));select.value=order.assigned_to||'';
  label.append(select);modal.append(label);
  const footer=n('div','v6-modal-actions');
  const cancel=n('button','v6-small-outline','Cancel');cancel.type='button';cancel.onclick=()=>shell.remove();
  const save=n('button','v6-small-primary','Save assignment');save.type='button';
  save.onclick=async()=>{
    save.disabled=true;
    try{
      await api('/api/orders/'+order.id+'/assign',{method:'PATCH',body:JSON.stringify({assigned_to:select.value,updated_at:order.updated_at})});
      shell.remove();await refresh({silent:true});showToast('Production assignment saved');
    }catch(e){showToast(e.message,true)}
    finally{save.disabled=false}
  };
  footer.append(cancel,save);modal.append(footer);shell.append(modal);
  shell.addEventListener('click',e=>{if(e.target===shell)shell.remove()});
  document.body.append(shell);select.focus();
 };
 window.flyxjV6Detail=o=>{
  const drawer=$v('detailDrawer');if(!drawer)return;
  let host=$v('v6DetailAssignment');
  if(!host){
    host=n('section','detail-section v6-detail-assignment');host.id='v6DetailAssignment';
    const grid=$v('detailGrid');if(grid)grid.insertAdjacentElement('afterend',host);
  }
  if(!host)return;
  host.replaceChildren();
  host.append(n('h3','','Production assignment'),n('p','v6-muted','Assigned to: '+(o.assigned_to||'Unassigned')));
  if(getUser()?.role==='staff'){
   const btn=n('button','v6-small-primary','Change assignment');btn.type='button';btn.onclick=()=>window.flyxjV6Assign(o);host.append(btn);
   let wa=$v('v6WhatsAppStatus');
   if(!wa){wa=n('div','v6-whatsapp-card');wa.id='v6WhatsAppStatus';host.append(wa)}
   const caption=n('strong','','WhatsApp file delivery');const status=n('p','v6-muted','Checking Meta media status…');
   const send=n('button','v6-small-outline','Send / retry order files');
   send.type='button';send.onclick=async()=>{
     if(!confirm('Send PDF and reference photos using the connected WhatsApp Business account?'))return;
     send.disabled=true;
     try{
       const result=await api('/api/orders/'+o.id+'/whatsapp/send-files',{method:'POST',body:JSON.stringify({})});
       status.textContent='WhatsApp: '+(result.status||'queued').replaceAll('_',' ')+' · '+(result.accepted_files||0)+' / '+(result.total_files||0)+' files accepted by Meta. Delivery to recipient is not confirmed.';
       showToast('WhatsApp media transfer queued. Check status again shortly.');
     }catch(e){status.textContent=e.message;showToast(e.message,true)}
     finally{send.disabled=false}
   };
   wa.replaceChildren(caption,status,send);
   api('/api/orders/'+o.id+'/whatsapp').then(result=>{
     if(!wa.isConnected||state.selected?.id!==o.id)return;
     const delivery=(result.status||'unknown').replaceAll('_',' ');
     status.textContent='WhatsApp: '+delivery+' · '+(result.accepted_files||0)+' / '+(result.total_files||0)+' files accepted by Meta. Delivery to recipient is not confirmed.';
     send.disabled=result.status==='accepted_by_provider';
   }).catch(()=>{status.textContent='WhatsApp status unavailable. Check the connected Meta Business account.'});
  }
 };
 function secureWhatsApp(){
  const team=$v('teamPanel');if(!team||$v('v6WhatsappNote'))return;
  const note=n('div','v6-team-guide');note.id='v6WhatsappNote';
  note.append(n('h3','','Customer communication'),n('p','','Staff can send actual order files from the order actions menu. Meta WhatsApp delivery depends on the connected sender and approved templates. The order conversation and live chat remain inside FLYXJ.'));
  team.append(note);
 }
 function printReport(){
  const panel=$v('financePanel');if(!panel||$v('v6ReportGuide'))return;
  const note=n('div','v6-report-guide');note.id='v6ReportGuide';
  note.append(n('strong','','Professional reports'),n('p','','CSV exports include the financial ledger. Each staff order has a branded cost-summary PDF under Order details. Gross profit excludes fees, tax and refunds.'));
  panel.append(note);
 }
 window.flyxjV6Refresh=()=>{
  if(!getUser())return;
  if(getUser().username!==lastUser){lastUser=getUser().username;teamPromise=null;cachedStaff=[];if(getUser().role==='staff')loadStaff()}
  // existing renderOrders and renderWorkflow handle all core data; V6 adds lightweight operational metrics.
  const today=targetDate(0),soon=targetDate(3);
  const open=(state.orders||[]).filter(o=>!locked.includes(o.status));
  const values={
   active:open.length,
   overdue:open.filter(o=>o.expected_date&&o.expected_date<today).length,
   due_soon:open.filter(o=>o.expected_date&&o.expected_date>=today&&o.expected_date<=soon).length,
   priority:open.filter(o=>['high','urgent'].includes(o.priority)).length,
   unassigned:open.filter(o=>!o.assigned_to).length
  };
  for(const [key,value] of Object.entries(values)){
   const card=document.querySelector('#v6Operations [data-metric="'+key+'"]');
   if(card){card.querySelector('strong').textContent=value;card.classList.toggle('v6-attention',value>0&&['overdue','priority'].includes(key));card.classList.toggle('hidden',key==='unassigned'&&getUser().role!=='staff')}
  }
  const freshness=$v('v6Freshness');if(freshness)freshness.textContent='Refreshed '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const t=Date.now();if(t-lastRefresh>60000){
   lastRefresh=t;
   api('/api/operations').then(data=>{
    const storage=$v('v6Storage');
    if(storage){storage.textContent=data.storage==='persistent'?'● Private persistent storage active':'⚠ Storage not configured as persistent';storage.classList.toggle('v6-storage-warn',data.storage!=='persistent')}
   }).catch(()=>{const storage=$v('v6Storage');if(storage)storage.textContent='Storage status unavailable'});
  }
 };
 function addKeyboardShortcuts(){
  document.addEventListener('keydown',e=>{
   const target=e.target;
   if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)){
    const search=$v('orderSearch');if(search){e.preventDefault();if(state.view!=='orders')navigate('orders');search.focus()}
   }
  });
 }
 function boot(){
  if(noticeReady)return;noticeReady=true;
  renderControls();renderCommandCards();secureWhatsApp();printReport();addKeyboardShortcuts();
  if(getUser())window.flyxjV6Refresh();
  // The original V6 notification panel is retired; the shared authenticated
  // notification inbox is connected to the one bell in init-extra.js.
  setInterval(()=>{
   if(getUser()&&!$v('dashboardShell')?.classList.contains('hidden')){
    if(getUser().role==='staff'&&!cachedStaff.length)loadStaff();
    window.flyxjV6Refresh();
   }
  },30000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();
