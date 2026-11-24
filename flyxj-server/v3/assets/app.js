'use strict';
const $=id=>document.getElementById(id);
const STATUS={pending:'Pending',awaiting_approval:'Awaiting approval',cutting:'Cutting',stitching:'Stitching',confirmed:'Confirmed',in_progress:'In progress',quality_check:'Quality check',shipped:'Shipped',delivered:'Delivered',completed:'Completed',cancelled:'Cancelled'};
const WCOL=['pending','cutting','stitching','in_progress','shipped','completed'];
const state={me:null,orders:[],stats:null,view:'overview',selected:null,files:[],busy:false,events:null,announcedTracking:new Set(),finance:null,financePeriod:'weekly',chat:[],chatOpen:false,unread:0,notifications:0};
const toastTimer={id:null};
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=String(text);return e}
function time(s){const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—'}
function day(s){const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):'—'}
function moneyless(v){return v===undefined||v===null||v===''?'—':String(v)}
function statusName(s){return STATUS[s]||String(s||'Unknown')}
function toast(message,isError=false){const t=$('toast');t.textContent=message;t.className='toast'+(isError?' error':'');clearTimeout(toastTimer.id);toastTimer.id=setTimeout(()=>t.classList.add('hidden'),4500)}
async function api(url,options={}){
  const headers={...options.headers};
  if(options.body!==undefined&&!(options.body instanceof FormData))headers['Content-Type']='application/json';
  if(state.me&&state.me.csrf)headers['x-csrf-token']=state.me.csrf;
  let response;
  try{response=await fetch(url,{credentials:'same-origin',...options,headers})}
  catch{throw Error('Cannot connect. Check your internet and refresh.')}
  const data=await response.json().catch(()=>({detail:'Server error'}));
  if(!response.ok){
    if(response.status===401&&state.me){resetApp();toast('Session expired. Please sign in again.',true)}
    throw Error(data.detail||'Request failed');
  }
  return data;
}
// This opens the popup immediately even if optional chat scripts or network calls fail.
function toggleChatSurface(open){
  const panel=$('floatingChatPanel'),button=$('floatingChatButton');
  if(!panel||!button)return;
  const shouldOpen=(typeof open==='boolean')?open:panel.classList.contains('hidden');
  state.chatOpen=shouldOpen;
  panel.classList.toggle('hidden',!shouldOpen);
  panel.setAttribute('aria-hidden',String(!shouldOpen));
  button.setAttribute('aria-expanded',String(shouldOpen));
  if(shouldOpen){
    // Always open the UI first; network loading is secondary and may be slow.
    const input=$('chatInput');
    if(input)input.focus();
    if(typeof loadDirectChat==='function'){
      Promise.resolve().then(()=>loadDirectChat()).then(()=>{
        if(state.chatOpen&&typeof markChatRead==='function')return markChatRead();
      }).catch(e=>console.warn('Chat loading retry available:',e));
    } else {
      const messages=$('chatMessages');
      if(messages)messages.textContent='Chat is loading. Please refresh if it stays unavailable.';
    }
  }
}
function resetApp(){
  if(window.FlyxjV8)window.FlyxjV8.onLogout();
  if(state.events){state.events.close();state.events=null}
  state.me=null;state.orders=[];state.selected=null;state.announcedTracking.clear();state.chatOpen=false;
  $('floatingChatButton').classList.add('hidden');$('floatingChatPanel').classList.add('hidden');
  $('loginShell').classList.remove('hidden');$('dashboardShell').classList.add('hidden');
  closeDrawer();$('loginPassword').value='';
}
function setLoggedIn(me){
  state.me=me;$('loginShell').classList.add('hidden');$('dashboardShell').classList.remove('hidden');
  $('userName').textContent=me.username;
  $('userRole').textContent=me.role==='staff'?'Staff / Production':'Customer';
  $('userAvatar').textContent=me.username.slice(0,2).toUpperCase();
  $('addOrderButton').classList.toggle('hidden',me.role!=='customer');
  for(const e of document.querySelectorAll('.staff-only'))e.classList.toggle('hidden',me.role!=='staff');
  for(const e of document.querySelectorAll('.customer-only'))e.classList.toggle('hidden',me.role!=='customer');
  $('floatingChatButton').classList.remove('hidden');
  connectTrackingEvents();
  if(window.FlyxjV8)window.FlyxjV8.onLogin();
}
// Live updates through a session-authenticated private stream.
// Polling continues as a fallback for devices where streaming is interrupted.
function trackingFingerprint(o){return [o.id,o.shipping?.tracking_id||'',o.shipping?.courier||'',o.shipping?.updated_at||''].join('|')}
function showTrackingAlert(order){
  const key=trackingFingerprint(order);
  if(!order.shipping?.tracking_id && !order.shipping?.courier)return;
  if(state.announcedTracking.has(key))return;
  state.announcedTracking.add(key);
  toast('📦 Tracking updated: '+(order.reference||'order')+' · '+(order.shipping?.courier||'Courier')+' · '+(order.shipping?.tracking_id||'Tracking pending'));
}
function connectTrackingEvents(){
  if(state.events){state.events.close();state.events=null}
  if(!state.me||typeof EventSource==='undefined')return;
  const events=new EventSource('/api/events');
  state.events=events;
  for(const eventName of ['order','status','approval','finance','photo','shipping','message','return','assignment']){
    events.addEventListener(eventName,ev=>{
      if(state.events!==events)return;
      try{const payload=JSON.parse(ev.data);
        if(eventName==='order'||eventName==='status'||eventName==='approval'||eventName==='shipping'){
          alertNotification((payload.description||'Order updated')+' · '+(payload.reference||''));
        }
        if(typeof window.flyxjV6Notify==='function')window.flyxjV6Notify(payload.description||'Order updated',payload.reference||'',eventName);
        refresh({silent:true});if(state.view==='finance')loadFinance();
      }catch(e){}
    });
  }
  events.addEventListener('chat',ev=>{
    if(state.events!==events)return;
    try{
      const message=JSON.parse(ev.data);
      if(!state.chat.some(x=>x.id===message.id))state.chat.push(message);
      if(message.from!==state.me?.username&&!state.chatOpen){
        state.unread++;updateChatBadge();alertNotification('New direct chat message');
        if(typeof window.flyxjV6Notify==='function')window.flyxjV6Notify('New direct chat message','', 'message');
      }
      renderDirectChat();
    }catch(e){}
  });
  events.addEventListener('presence',ev=>{try{displayPresence(JSON.parse(ev.data))}catch{}});
  events.addEventListener('tracking',(event)=>{
    if(state.events!==events)return;
    try{
      const info=JSON.parse(event.data);
      if(!info.order_id)return;
      showTrackingAlert({id:info.order_id,reference:info.reference,shipping:info});
      refresh({silent:true});
    }catch(ex){console.warn('Invalid tracking event received')}
  });
}
async function refresh({silent=false}={}){
  if(state.busy)return;
  state.busy=true;
  try {
    const [list,dash]=await Promise.all([api('/api/orders'),api('/api/dashboard')]);
    const previous=new Map(state.orders.map(o=>[o.id,trackingFingerprint(o)]));
    const next=list.orders||[];
    if(state.me?.role==='customer'&&state.orders.length){
      for(const order of next){
        if(previous.has(order.id)&&previous.get(order.id)!==trackingFingerprint(order))showTrackingAlert(order);
      }
    }
    state.orders=next;state.stats=dash.stats;
    $('navOrderCount').textContent=state.orders.length;
    renderStats();renderOrders();renderWorkflow();
    if(typeof window.flyxjV6Refresh==='function')window.flyxjV6Refresh();
    if(state.selected){
      const current=state.orders.find(o=>o.id===state.selected.id);
      if(current)renderDetail(current);
    }
    if(!silent)toast('Dashboard is up to date');
  } catch(ex){if(!silent)toast(ex.message,true)}
  finally{state.busy=false}
}
function renderStats(){
  const s=state.stats||{total:0,active:0,shipped:0,completed:0};
  $('statTotal').textContent=s.total;
  $('statActive').textContent=s.active;
  $('statShipped').textContent=s.shipped;
  $('statDone').textContent=s.completed;
}
function renderWorkflow(){
  const wrap=$('workflowList');wrap.replaceChildren();
  const by=(state.stats&&state.stats.by_status)||{};
  const data=[
    ['Waiting',(by.pending||0)+(by.confirmed||0)],
    ['In production',(by.in_progress||0)+(by.quality_check||0)],
    ['In transit',(by.shipped||0)],
    ['Finished',(by.delivered||0)+(by.completed||0)]
  ];
  const total=(state.stats&&state.stats.total)||0;
  for(const [label,value] of data){
    const item=node('div','workflow-item');
    const header=node('div','workflow-label');header.append(node('span','',label),node('span','',value));
    const progress=node('div','progress');const fill=node('span');fill.style.width=(total?Math.round(100*value/total):0)+'%';progress.append(fill);
    item.append(header,progress);wrap.append(item);
  }
}
function filterOrders(){
  const q=$('orderSearch').value.toLowerCase().trim();
  const status=$('statusFilter').value;
  let list=state.orders.filter(o=>status==='all'||o.status===status);
  if(state.view==='tracking')list=list.filter(o=>o.shipping?.tracking_id||o.return_shipping?.tracking_id||['shipped','delivered'].includes(o.status));
  if(q)list=list.filter(o=>[
    o.reference,o.title,o.customer,o.colour,o.size,o.comments,
    o.shipping?.tracking_id,o.shipping?.courier,o.return_shipping?.tracking_id,o.assigned_to
  ].some(v=>String(v||'').toLowerCase().includes(q)));
  const v6=window.flyxjV6Filters||{};
  if(v6.priority&&v6.priority!=='all')list=list.filter(o=>o.priority===v6.priority);
  if(v6.assignee&&v6.assignee!=='all')list=list.filter(o=>v6.assignee==='unassigned'?!o.assigned_to:o.assigned_to===v6.assignee);
  if(v6.due&&v6.due!=='all'){
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
    const soon=new Date(Date.now()+3*86400000).toLocaleDateString('en-CA',{timeZone:'Europe/London'});
    list=list.filter(o=>{
      const open=!['delivered','completed','cancelled'].includes(o.status);
      return open&&o.expected_date&&(v6.due==='overdue'?o.expected_date<today:v6.due==='soon'&&o.expected_date>=today&&o.expected_date<=soon);
    });
  }
  if(v6.sort==='deadline')list.sort((a,b)=>(a.expected_date||'9999-99-99').localeCompare(b.expected_date||'9999-99-99'));
  if(v6.sort==='priority'){const w={urgent:0,high:1,normal:2};list.sort((a,b)=>(w[a.priority]??2)-(w[b.priority]??2));}
  if(state.view==='overview')list=list.slice(0,7);
  return list;
}
function renderOrders(){
  const list=filterOrders(),tbody=$('orderRows');tbody.replaceChildren();
  $('resultCount').textContent=list.length+' order'+(list.length===1?'':'s')+' displayed';
  $('emptyState').classList.toggle('hidden',list.length>0);
  for(const o of list){
    const tr=node('tr');tr.dataset.id=o.id;tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Open '+o.reference);
    const first=node('td');const desc=node('div','order-desc');
    const img=node('img');img.src=o.photos?.[0]||'';img.alt='Dress image';img.loading='lazy';img.onerror=()=>{img.style.visibility='hidden'};
    const txt=node('div','order-txt');txt.append(node('b','',o.title),node('small','mono',o.reference));desc.append(img,txt);first.append(desc);
    const customer=node('td','',moneyless(o.customer));
    const date=node('td','',day(o.created_at));
    const st=node('td');st.append(node('span','status-pill status-'+o.status,statusName(o.status)));
    const tracking=node('td','mono');
    if(o.shipping?.tracking_id){
      tracking.append(node('strong','',o.shipping.tracking_id));
      if(o.shipping.courier)tracking.append(node('div','tiny muted',o.shipping.courier));
    }else tracking.append(node('span','muted','Not added'));
    const arrow=node('td','table-arrow');
    const actions=node('div','flyxj-order-row-actions');
    if(state.me?.role==='staff'){
      const maker=node('a','order-sheet-link order-maker-image','↓ Image');
      maker.href='/order/'+o.id+'?download=1';
      maker.title='Download one image with four photos, size and color';
      maker.addEventListener('click',e=>e.stopPropagation());
      actions.append(maker);
      const assign=node('button','flyxj-v6-inline-assign','Assign');
      assign.type='button';assign.title='Assign production staff';
      assign.onclick=e=>{e.stopPropagation();if(window.flyxjV6Assign)window.flyxjV6Assign(o)};
      actions.append(assign);
    }
    const trigger=node('button','flyxj-actions-trigger','⋯');
    trigger.type='button';trigger.title='Order actions';trigger.setAttribute('aria-label','Order actions');
    const menu=node('div','flyxj-actions-menu hidden');
    const menuItems=[['✎ Edit order','edit'],['Delete order','delete']];
    if(state.me?.role==='staff')menuItems.splice(1,0,['Share actual files','share']);
    for(const [label,action] of menuItems){
      const item=node('button','flyxj-actions-menu-item',label);
      item.type='button';
      item.onclick=e=>{e.stopPropagation();menu.classList.add('hidden');if(window.FlyxjOrderActions)window.FlyxjOrderActions[action](action==='share'?o:o.id)};
      menu.append(item);
    }
    trigger.onclick=e=>{
      e.stopPropagation();document.querySelectorAll('.flyxj-actions-menu').forEach(n=>{if(n!==menu)n.classList.add('hidden')});
      const rect=trigger.getBoundingClientRect();
      menu.style.top=Math.max(8,Math.min(window.innerHeight-160,rect.bottom+4))+'px';
      menu.style.left=Math.max(8,Math.min(window.innerWidth-192,rect.right-180))+'px';
      menu.classList.toggle('hidden');
    };
    actions.append(trigger,menu);arrow.append(actions);
    tr.append(first,customer,date,st,tracking,arrow);
    tr.addEventListener('click',()=>openDetail(o.id));
    tr.addEventListener('keydown',e=>{if(e.target===tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetail(o.id)}});
    tbody.append(tr);
  }
}
function navigate(view,{fromHistory=false}={}){
  state.view=view;
  if(state.me&&!fromHistory){
    try{
      const target='#'+view;
      if(history.state?.flyxjView&&history.state?.view!==view)
        history.pushState({flyxjView:true,view},'',target);
      else if(!history.state?.flyxjView)
        history.replaceState({flyxjView:true,view},'',target);
    }catch(e){}
  }
  $('sidebar').classList.remove('open');
  const names={overview:'Overview',orders:'All orders',tracking:'Shipment tracking',finance:'Finance & Profit',team:'Staff & Backup'};
  $('breadcrumb').textContent=names[view];
  $('viewHeading').textContent=names[view];
  $('viewSubtitle').textContent=({overview:'Your orders, progress and updates in one place.',orders:'Search, review and manage every dress order.',tracking:'Track outgoing parcels and returns.',finance:'Per-order PKR and USD costs, sales, cumulative gross profit.',team:'Manage production accounts and protect your data.'})[view]||'';
  $('listHeading').textContent=view==='overview'?'Recent orders':view==='orders'?'All dress orders':'Tracking & shipments';
  $('listSubtitle').textContent=view==='overview'?'Follow the latest order activity':view==='orders'?'All the orders available to your account':'Orders with shipment activity';
  $('showAllButton').classList.toggle('hidden',view!=='overview');
  $('ordersContent').classList.toggle('hidden',view==='finance'||view==='team');
  $('statsGrid').classList.toggle('hidden',view==='finance'||view==='team');
  $('financePanel').classList.toggle('hidden',view!=='finance');
  $('teamPanel').classList.toggle('hidden',view!=='team');
  if(view==='finance')loadFinance();
  if(view==='team')loadTeam();
  for(const nav of document.querySelectorAll('[data-nav]'))nav.classList.toggle('active',nav.dataset.nav===view);
  if(view!=='finance'&&view!=='team')renderOrders();
  if(window.FlyxjV8)window.FlyxjV8.sync();
}
function openDrawer(id){
  $('overlay').classList.remove('hidden');
  $(id).classList.remove('hidden');
  document.body.style.overflow='hidden';
  if(state.me){
    try{history.pushState({flyxjView:true,view:state.view,flyxjDrawer:id},'', '#'+state.view+'-'+id)}catch(e){}
  }
}
function closeDrawer(options={}){
  $('overlay').classList.add('hidden');
  $('createDrawer').classList.add('hidden');
  $('detailDrawer').classList.add('hidden');
  document.body.style.overflow='';
  if(!options.fromHistory&&history.state?.flyxjDrawer){
    try{history.replaceState({flyxjView:true,view:state.view},'', '#'+state.view)}catch(e){}
  }
}
function openCreate(){if(state.me?.role!=='customer')return;openDrawer('createDrawer')}
function imageItem(file,index){
  const card=node('div','preview-card');const img=node('img');img.src=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(img.src);img.alt='Reference photo '+(index+1);
  const remove=node('button','','×');remove.type='button';remove.setAttribute('aria-label','Remove photo '+(index+1));
  remove.onclick=()=>{state.files.splice(index,1);renderImagePreview()};
  card.append(img,remove);return card;
}
function renderImagePreview(){
  const wrap=$('photoPreviews');wrap.replaceChildren();
  state.files.forEach((f,i)=>wrap.append(imageItem(f,i)));
  $('photoCount').textContent=state.files.length+' of 8 images selected';
}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Unable to read photo'));r.readAsDataURL(file)})}
async function compress(file){
  if(file.size<=2000000)return readAsDataURL(file);
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Cannot open selected image'));image.src=url});
    const ratio=Math.min(1,1800/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo processing unavailable');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let result=canvas.toDataURL('image/jpeg',0.82);
    if(result.length>3300000)result=canvas.toDataURL('image/jpeg',0.64);
    return result;
  }finally{URL.revokeObjectURL(url)}
}
async function submitOrder(event){
  event.preventDefault();
  if(!state.files.length){toast('Please attach at least one dress picture',true);return}
  const btn=$('submitOrderButton');btn.disabled=true;btn.textContent='Uploading...';
  try{
    const images=await Promise.all(state.files.map(compress));
    const body={
      title:$('dressTitle').value,size:$('dressSize').value,shoe_size:$('shoeSize').value,customer_earning_pkr:$('customerEarning').value,colour:$('dressColour').value,
      quantity:Number($('dressQty').value),comments:$('dressComments').value,images,
      pdf:await readRequiredPdf(),priority:$('orderPriority').value,expected_date:$('orderDeadline').value,
      measurements:readMeasurements()
    };
    const data=await api('/api/orders',{method:'POST',body:JSON.stringify(body)});
    if(window.FlyxjV8)window.FlyxjV8.afterOrderCreated();
    $('newOrderForm').reset();state.files=[];renderImagePreview();closeDrawer();
    await refresh({silent:true});
    navigate('orders');toast('Order '+data.order.reference+' created successfully');
    openDetail(data.order.id);
  }catch(ex){toast(ex.message,true)}
  finally{btn.disabled=false;btn.textContent='Submit order →'}
}
function appendDetail(label,value){
  const item=node('div','detail-item');item.append(node('small','',label),node('b','',moneyless(value)));return item;
}
function renderShipping(o){
  const box=$('shippingInfo');box.replaceChildren();
  const s=o.shipping||{};
  if(s.tracking_id||s.courier){
    box.append(node('b','','Outbound: '+(s.tracking_id||'Awaiting number')));
    box.append(node('span','','Courier: '+(s.courier||'Not specified')));
    if(s.updated_at)box.append(node('span','tiny muted','Shared with customer · '+time(s.updated_at)));
    if(s.tracking_url&&s.tracking_url.startsWith('https://')){
      const link=node('a','','Open courier tracking ↗');link.href=s.tracking_url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
    }
  }else box.append(node('span','muted','Staff have not added outward tracking yet.'));
  if(o.return_shipping?.tracking_id){
    box.append(node('b','','Return tracking: '+o.return_shipping.tracking_id));
    box.append(node('span','','Return courier: '+(o.return_shipping.courier||'—')));
    if(o.return_shipping.note)box.append(node('span','','Return note: '+o.return_shipping.note));
  }
}
function renderMessages(o){
  const wrap=$('messageThread');wrap.replaceChildren();
  const messages=o.messages||[];
  if(!messages.length)wrap.append(node('p','muted tiny','No messages yet. Ask a question or post an update.'));
  for(const m of messages){
    const item=node('div','message-item'+(m.by===state.me?.username?' mine':''));
    item.append(node('div','msg-meta',m.by+' · '+time(m.at)),node('div','',m.text));
    wrap.append(item);
  }
  wrap.scrollTop=wrap.scrollHeight;
}
function renderHistory(o){
  const wrap=$('detailHistory');wrap.replaceChildren();
  const items=(o.history||[]).slice().reverse().slice(0,50);
  if(!items.length)wrap.append(node('p','muted tiny','No activity recorded'));
  for(const h of items){
    const item=node('div','timeline-item');
    item.append(node('b','',h.label||('Status: '+(h.new_status||'updated'))),node('small','',((h.by||h.username||'Staff')+' · '+time(h.at||h.created_at))));
    wrap.append(item);
  }
}
function renderDetail(o){
  state.selected=o;
  if(typeof window.flyxjV6Detail==='function')window.flyxjV6Detail(o);
  $('detailRef').textContent=o.reference;
  $('detailTitle').textContent=o.title;
  $('detailMeta').textContent=(o.customer||'Customer')+' · Ordered '+day(o.created_at);
  $('detailStatus').textContent=statusName(o.status);
  $('detailStatus').className='status-pill status-'+o.status;
  $('detailUpdated').textContent='Updated '+day(o.updated_at);
  const grid=$('detailGrid');grid.replaceChildren(
    appendDetail('Size',o.size),appendDetail('Shoes size',o.shoe_size||'—'),appendDetail('User A earning (PKR)',o.customer_earning_pkr??'Not entered'),appendDetail('Colour',o.colour),
    appendDetail('Quantity',o.quantity),appendDetail('Submitted by',o.customer),
    appendDetail('Order reference',o.reference),appendDetail('Created',time(o.created_at))
  );
  $('detailComments').textContent=o.comments||'No custom instructions added.';
  const orderActions=$('flyxjDetailActions');
  if(orderActions){
    orderActions.replaceChildren();
    const detailItems=[['✎ Edit order','edit'],['Delete order','delete']];
    if(state.me?.role==='staff')detailItems.splice(1,0,['Send PDF + Photos','share']);
    for(const [label,action] of detailItems){
      const button=node('button','btn btn-soft',label);button.type='button';
      button.onclick=()=>{if(window.FlyxjOrderActions)window.FlyxjOrderActions[action](action==='share'?o:o.id)};
      orderActions.append(button);
    }
  }
  const gallery=$('detailPhotos');gallery.replaceChildren();
  for(let i=0;i<(o.photos||[]).length;i++){
    const img=node('img');img.src=o.photos[i];img.alt='Dress reference photo '+(i+1);
    img.title='Open full image';img.onclick=()=>window.open(img.src,'_blank','noopener');
    gallery.append(img);
  }
  renderShipping(o);renderMessages(o);renderHistory(o);renderExtraDetails(o);
  const earning=$('customerEarningEdit');if(earning)earning.value=o.customer_earning_pkr??0;
  if(state.me.role==='staff'){
    $('detailStatusSelect').value=o.status;
    $('staffNote').value=o.staff_note||'';
    $('shippingCourier').value=o.shipping?.courier||'';
    $('shippingId').value=o.shipping?.tracking_id||'';
    $('shippingUrl').value=o.shipping?.tracking_url||'';
  }else{
    $('returnCourier').value=o.return_shipping?.courier||'';
    $('returnId').value=o.return_shipping?.tracking_id||'';
    $('returnNote').value=o.return_shipping?.note||'';
    const info=$('returnInfo');info.replaceChildren();
    info.append(node('span','',o.return_shipping?.tracking_id?'Latest return: '+o.return_shipping.tracking_id:'No return tracking submitted yet'));
  }
}
function openDetail(id){
  const o=state.orders.find(o=>o.id===id);
  if(!o)return toast('Order not found',true);
  // Android order details have a real page in WebView history so Back works.
  if(state.me?.role==='staff'&&/Android/i.test(navigator.userAgent)){
    window.location.assign('/order/'+encodeURIComponent(id));
    return;
  }
  renderDetail(o);openDrawer('detailDrawer');
}
async function saveAndRefresh(path,method,payload,success){
  try{
    const id=state.selected?.id;if(!id)throw Error('Select an order first');
    await api('/api/orders/'+id+path,{method,body:JSON.stringify(payload)});
    await refresh({silent:true});
    toast(success);
  }catch(ex){toast(ex.message,true)}
}
async function init(){
  // Direct click wiring does not depend on the separate chat-init bundle.
  const chatButton=$('floatingChatButton'),chatClose=$('chatClose');
  if(chatButton){chatButton.onclick=e=>{if(/Android/i.test(navigator.userAgent))return; e.preventDefault();toggleChatSurface()};chatButton.setAttribute('aria-expanded','false')}
  if(chatClose)chatClose.onclick=()=>toggleChatSurface(false);
  const directForm=$('directChatForm'),chatAttach=$('chatAttach');
  if(directForm)directForm.onsubmit=e=>{
    if(typeof sendDirectChat==='function')return sendDirectChat(e);
    e.preventDefault();toast('Chat service is loading. Reopen the app.',true);
  };
  if(chatAttach)chatAttach.onchange=()=>{
    const label=$('chatFileName');
    if(label)label.textContent=chatAttach.files?.[0]?.name||'';
  };
  $('passwordToggle').onclick=()=>{
    const input=$('loginPassword');input.type=input.type==='password'?'text':'password';
    $('passwordToggle').textContent=input.type==='password'?'Show':'Hide';
  };
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();const btn=$('signInButton');btn.disabled=true;
    try{
      const data=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('loginName').value,password:$('loginPassword').value})});
      $('loginPassword').value='';setLoggedIn(data);navigate(location.hash==='#orders'?'orders':'overview');await refresh({silent:true});toast('Welcome to FlyXJ');
    }catch(ex){toast(ex.message,true)}
    finally{btn.disabled=false}
  };
  $('logoutButton').onclick=async()=>{try{await api('/api/logout',{method:'POST'})}catch{}resetApp()};
  $('menuToggle').onclick=()=>$('sidebar').classList.toggle('open');
  $('refreshButton').onclick=()=>refresh();
  $('addOrderButton').onclick=openCreate;
  $('showAllButton').onclick=()=>navigate('orders');
  $('helpAction').onclick=()=>navigate('orders');
  for(const el of document.querySelectorAll('[data-nav]'))el.onclick=()=>navigate(el.dataset.nav);
  $('statusFilter').onchange=renderOrders;
  $('orderSearch').oninput=renderOrders;
  $('overlay').onclick=closeDrawer;
  for(const el of document.querySelectorAll('[data-close]'))el.onclick=closeDrawer;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
  window.addEventListener('popstate',event=>{
    if(!state.me)return;
    // Hardware Back: close the active order form/details instead of exiting the app.
    closeDrawer({fromHistory:true});
    if(event.state?.flyxjView&&event.state.view&&event.state.view!==state.view)
      navigate(event.state.view,{fromHistory:true});
  });
  $('dressPhotos').onchange=e=>{
    const newFiles=Array.from(e.target.files||[]);
    for(const file of newFiles){
      if(state.files.length>=8){toast('Maximum 8 photos allowed',true);break}
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Please select JPG, PNG or WebP images',true);continue}
      if(file.size>12000000){toast('This photo is too large (12 MB maximum original)',true);continue}
      state.files.push(file);
    }
    e.target.value='';
    renderImagePreview();
  };
  $('newOrderForm').onsubmit=submitOrder;
  $('earningForm').onsubmit=async e=>{
    e.preventDefault();
    if(state.me?.role!=='customer')return toast('Only User A can edit earning',true);
    await saveAndRefresh('/customer-earning','PATCH',{customer_earning_pkr:$('customerEarningEdit').value},'User A earning saved for User B');
  };
  $('statusForm').onsubmit=async e=>{
    e.preventDefault();
    const status=$('detailStatusSelect').value;
    const payload={status,staff_note:$('staffNote').value};
    if(['shipped','delivered','completed'].includes(status)){
      payload.shipping={courier:$('shippingCourier').value,tracking_id:$('shippingId').value,tracking_url:$('shippingUrl').value};
      payload.finance=financeInputs();
    }
    await saveAndRefresh('/status','PATCH',payload,'Production status updated');
  };
  $('shippingForm').onsubmit=async e=>{
    e.preventDefault();
    await saveAndRefresh('/shipping','PATCH',{courier:$('shippingCourier').value,tracking_id:$('shippingId').value,tracking_url:$('shippingUrl').value},'Tracking sent to customer');
  };
  $('returnForm').onsubmit=async e=>{
    e.preventDefault();
    await saveAndRefresh('/return','POST',{courier:$('returnCourier').value,tracking_id:$('returnId').value,note:$('returnNote').value},'Return tracking sent to FlyXJ');
  };
  $('messageForm').onsubmit=async e=>{
    e.preventDefault();const message=$('messageInput').value;
    await saveAndRefresh('/messages','POST',{message},'Message sent');
    $('messageInput').value='';
  };
  // Defer looking up the optional module until the other deferred scripts have loaded.
  // Passing initExtraFeatures directly throws ReferenceError before the module exists.
  setTimeout(()=>{
    if(typeof initExtraFeatures==='function'){
      try{initExtraFeatures()}catch(err){console.error('FlyXJ extra UI initialization error:',err)}
    }else console.warn('FlyXJ extra script missing. Essential chat click remains available.');
  },0);
  try{const me=await api('/api/me');setLoggedIn(me);navigate(location.hash==='#orders'?'orders':'overview');await refresh({silent:true})}catch{resetApp()}
  document.addEventListener('visibilitychange',()=>{
    if(state.me&&document.visibilityState==='visible')refresh({silent:true});
  });
  setInterval(()=>{if(state.me&&document.visibilityState==='visible')refresh({silent:true})},45000);
}
/* v3 extra feature handlers appended below */
init();