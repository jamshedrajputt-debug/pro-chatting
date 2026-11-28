'use strict';
/* FLYXJ order-wise WhatsApp sharing: one order per native share chooser.
   WhatsApp controls the final media order and any captions. Filenames carry
   sequence identifiers; detail card is appended after selected original photos. */
(function(){
 const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const x=document.createElement(tag);x.className=cls||'';if(text!==undefined)x.textContent=String(text);return x};
 const chosen=new Map();let step=0,ready=null,allReady=null,pdfReady=null,shared=new Set(),orders=[],pane=null;
 const current=()=>typeof state!=='undefined'&&state.me?.role==='staff';
 const live=()=>window.FlyxjBatch?.selected?.()||[];
 function photos(o){
  const key=String(o.id),count=Math.min(8,o.photoCount||0);
  if(!chosen.has(key))chosen.set(key,new Set(Array.from({length:count},(_,i)=>i)));
  const set=chosen.get(key);for(const i of [...set])if(i>=count)set.delete(i);
  return [...set].sort((a,b)=>a-b);
 }
 function caption(o,i,total){
  return 'ORDER '+String(i).padStart(2,'0')+'/'+String(total).padStart(2,'0')+
   '\nReference: '+o.reference+'\nProduct: '+o.title+'\nSIZE: '+o.size+
   '\nCOLOUR: '+o.colour+'\nQuantity: '+o.quantity+'\nStatus: '+o.status;
 }
 function reset(){step=0;ready=null;allReady=null;pdfReady=null;shared.clear()}
 function mount(){
  const bar=$('fx10Toolbar');if(!bar||!current())return;
  const actions=bar.querySelector('.fx10-bar-actions');if(!actions||$('fx11OrderWiseButton'))return;
  const btn=node('button','fx10-btn fx10-green','Order-wise Share');btn.id='fx11OrderWiseButton';
  btn.type='button';btn.onclick=open;actions.append(btn);
 }
 function open(){
  orders=live().map(o=>({...o}));if(!orders.length)return alert('Select orders first.');
  chosen.clear();reset();
  $('fx11OrderWiseDialog')?.remove();
  pane=node('div','fx10-mask');pane.id='fx11OrderWiseDialog';
  const shell=node('section','fx10-pane fx11-shell');shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');
  const heading=node('header','fx10-heading'),title=node('div');
  title.append(node('small','','FLYXJ · USER B WHATSAPP'),node('h2','','Order-wise WhatsApp Pack'),
   node('p','','Choose Exact Sequence for a single PDF with photos and details together, or share original images separately.'));
  const close=node('button','fx10-close','×');close.type='button';close.setAttribute('aria-label','Close');
  close.onclick=()=>pane.remove();heading.append(title,close);
  const content=node('div','fx10-body'),rows=node('div','fx10-pack-rows'),status=node('p','fx10-feedback','Select the photos for each order.');
  status.setAttribute('aria-live','polite');
  const controls=node('div','fx11-step-buttons'),send=node('button','fx10-btn fx10-green','Prepare Order 1');
  const shareAll=node('button','fx10-btn fx10-muted','Original Images (WhatsApp may mix)');shareAll.type='button';
  const exact=node('button','fx10-btn fx10-green','Share ALL · Exact Sequence');exact.type='button';
  const next=node('button','fx10-btn fx10-primary','Next Order');send.type='button';next.type='button';next.disabled=true;
  const guide=node('p','fx10-warning','Share chooser: select WhatsApp, choose the recipient and send. Only then tap Next Order. WhatsApp may reorder images or omit captions; the info card and numbered filenames identify the order.');
  const progress=node('strong','fx11-progress','ORDER 01/'+String(orders.length).padStart(2,'0'));
  function refresh(){
   rows.replaceChildren();
   orders.forEach((o,i)=>{
    const row=node('div','fx10-pack-row'),num=node('b','fx10-number',String(i+1).padStart(2,'0')),info=node('div','fx10-pack-info');
    info.append(node('strong','',o.reference+' · '+o.title),node('small','','SIZE '+o.size+' · COLOUR '+o.colour+' · QTY '+o.quantity));
    const picks=node('div','fx11-photo-picker'),indices=new Set(photos(o));
    if(!o.photoCount)picks.append(node('small','fx11-photo-title','No original photos for this order'));
    else {
     picks.append(node('small','fx11-photo-title','Select original photos ('+o.photoCount+')'));
     for(let k=0;k<Math.min(o.photoCount,8);k++){
      const label=node('label','fx11-photo-choice'),check=node('input');check.type='checkbox';check.checked=indices.has(k);
      check.onchange=()=>{const set=chosen.get(String(o.id));if(check.checked)set.add(k);else set.delete(k);
       reset();update();status.textContent='Photo selection changed. Start again from Order 1.';};
      label.append(check,node('span','','Photo '+(k+1)));picks.append(label);
     }
    }
    info.append(picks);
    const moves=node('div','fx10-pack-move');
    for(const direction of [-1,1]){
     const b=node('button','fx10-move',direction===-1?'↑':'↓');b.type='button';b.disabled=i+direction<0||i+direction>=orders.length;
     b.onclick=()=>{[orders[i],orders[i+direction]]=[orders[i+direction],orders[i]];
      reset();refresh();update();status.textContent='Sequence changed. Start again from Order 1.';};
     moves.append(b);
    }
    row.append(num,info,moves);rows.append(row);
   });
  }
  function update(){
   const o=orders[step];
   progress.textContent=o?'ORDER '+String(step+1).padStart(2,'0')+'/'+String(orders.length).padStart(2,'0')+' · '+o.reference:'All orders prepared';
   send.textContent=o?(ready?'Send Order '+(step+1):'Prepare Order '+(step+1)):'Completed';
   send.disabled=!o;next.disabled=!o||!shared.has(String(o.id));
   next.textContent=step+1<orders.length?'Next Order '+(step+2)+' →':'Finish';
  }
  async function issue(o,body,csrf){
   const r=await fetch('/api/orders/'+encodeURIComponent(o.id)+'/mobile-file',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':csrf},
    body:JSON.stringify(body)});
   const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.detail||'Attachment unavailable');
   const u=new URL(data.url,location.origin);
   if(u.origin!==location.origin||!/^\/api\/mobile-file\/[a-f0-9]{64}$/.test(u.pathname)||u.search||u.hash)
    throw Error('Untrusted private file');
   const ext=/\.(jpg|png|webp)$/i.exec(data.filename||'');if(!ext)throw Error('Unexpected photo file type');
   return {url:u.href,name:data.filename,type:ext[1].toLowerCase()==='jpg'?'image/jpeg':'image/'+ext[1].toLowerCase()};
  }
  send.onclick=async()=>{
   const o=orders[step];if(!o||send.disabled||!current())return;
   const latest=live().find(x=>String(x.id)===String(o.id));
   if(!latest||JSON.stringify(latest)!==JSON.stringify(o)){status.textContent='Order details changed. Close and reopen the share screen.';return;}
   const indices=photos(o);if(!indices.length){status.textContent='Tick at least one photo for '+o.reference;return;}
   const signature=JSON.stringify({o,indices,step,total:orders.length});
   const native=/FlyXJAndroid\/(?:10|1[1-9]|[2-9][0-9])/.test(navigator.userAgent)&&
    typeof window.FlyxjShare?.shareFiles==='function';
   if(ready?.signature===signature&&Date.now()-ready.at<5*60000){
    try{
     if(!navigator.share)throw Error('Browser does not support image sharing.');
     if(navigator.canShare&&!navigator.canShare({files:ready.files}))throw Error('Too many images for this phone. Select fewer.');
     await navigator.share({files:ready.files,title:'FLYXJ '+o.reference,text:caption(o,step+1,orders.length)});
     shared.add(String(o.id));status.textContent='Share chooser finished for '+o.reference+'. Check WhatsApp delivery, then Next Order.';update();
    }catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled':e.message;}
    return;
   }
   send.disabled=true;next.disabled=true;
   try{
    const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Please sign in');
    const me=await r.json();if(me.role!=='staff')throw Error('User B only');
    const tickets=[];
    for(const index of indices){
     status.textContent='Preparing '+o.reference+' photo '+(index+1)+'/'+o.photoCount;
     tickets.push(await issue(o,{kind:'photo',index,sequence:step+1,total:orders.length},me.csrf));
    }
    status.textContent='Preparing '+o.reference+' detail card';
    tickets.push(await issue(o,{kind:'batch-maker',sequence:step+1,total:orders.length,cardLast:true},me.csrf));
    if(JSON.stringify(live().find(x=>String(x.id)===String(o.id)))!==JSON.stringify(o))
     throw Error('Order changed while preparing. Close and reopen sharing.');
    if(native){
     window.FlyxjShare.shareFiles(JSON.stringify({files:tickets.map(t=>t.url),types:tickets.map(t=>t.type),
      title:'FLYXJ '+o.reference,text:caption(o,step+1,orders.length)}));
     shared.add(String(o.id));status.textContent='Opened WhatsApp chooser for '+o.reference+'. Send, then tap Next Order.';
    }else{
     if(!navigator.share||typeof File==='undefined')throw Error('Use FlyXJ Android V10+ or an Android browser with file sharing');
     const files=[];
     for(const t of tickets){
      const result=await fetch(t.url,{credentials:'same-origin',cache:'no-store'});
      if(!result.ok)throw Error('Image expired. Try again.');
      const blob=await result.blob();if(blob.size>15*1024*1024)throw Error('Image too large');
      files.push(new File([blob],t.name,{type:t.type}));
     }
     if(navigator.canShare&&!navigator.canShare({files}))throw Error('Phone cannot share this many photos.');
     ready={signature,files,at:Date.now()};
     status.textContent=indices.length+' original photos + 1 details card ready. Tap Send Order '+(step+1)+'.';
    }
   }catch(e){status.textContent='Share failed: '+e.message;}finally{send.disabled=false;update();}
  };


  // Guaranteed sequence: one PDF, one WhatsApp file, one page per order.
  // Each page shows ALL chosen original photos first and its matching details underneath.
  exact.onclick=async()=>{
   if(!current()||exact.disabled)return;
   const liveOrders=live();
   if(orders.length!==liveOrders.length||orders.some(o=>!liveOrders.some(x=>String(x.id)===String(o.id)&&JSON.stringify(x)===JSON.stringify(o)))){
    status.textContent='Order data changed. Close and reopen sharing.';return;
   }
   const plans=orders.map(o=>({id:o.id,updatedAt:o.updatedAt,photoIndexes:photos(o)}));
   if(plans.some(p=>p.photoIndexes.length===0)){status.textContent='Select at least one photo for every order.';return;}
   const signature=JSON.stringify(plans);
   const native=/FlyXJAndroid\/(?:10|1[1-9]|[2-9][0-9])/.test(navigator.userAgent)&&
    typeof window.FlyxjShare?.shareFiles==='function';
   if(!native&&pdfReady?.signature===signature&&Date.now()-pdfReady.at<5*60000){
    try{
     if(!navigator.share)throw Error('This browser does not support file sharing. Use FlyXJ Android.');
     if(navigator.canShare&&!navigator.canShare({files:[pdfReady.file]}))
      throw Error('This device cannot share PDF. Try Android app or save the PDF.');
     await navigator.share({files:[pdfReady.file],title:'FLYXJ · exact ordered photo pack'});
     status.textContent='Exact sequence PDF shared with chosen app. Verify WhatsApp recipient and delivery.';
    }catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled':e.message;}
    return;
   }
   exact.disabled=true;
   try{
    status.textContent='Building ordered photo-and-details PDF…';
    const meR=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
    if(!meR.ok)throw Error('Please sign in again');
    const me=await meR.json();if(me.role!=='staff')throw Error('User B only');
    const resp=await fetch('/api/orders/ordered-share-pdf',{
     method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':me.csrf},
     body:JSON.stringify({orders:plans})
    });
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok)throw Error(data.detail||'Could not create exact-sequence PDF');
    const link=new URL(data.url,location.origin);
    if(link.origin!==location.origin||!/^\/api\/mobile-file\/[a-f0-9]{64}$/.test(link.pathname)||link.search||link.hash)
     throw Error('Invalid download link');
    if(JSON.stringify(orders.map(o=>({id:o.id,updatedAt:o.updatedAt,photoIndexes:photos(o)})))!==signature||
      orders.some(o=>!live().some(x=>String(x.id)===String(o.id)&&JSON.stringify(x)===JSON.stringify(o))))
     throw Error('Selection changed while preparing. Prepare again.');
    if(native){
     window.FlyxjShare.shareFiles(JSON.stringify({files:[link.href],types:['application/pdf'],
      title:'FLYXJ · '+orders.length+' orders in exact sequence',
      text:'FLYXJ production pack. Every page shows one order photos followed by SIZE, COLOUR and QUANTITY.'}));
     status.textContent='One PDF with '+orders.length+' order pages and '+data.photos+' photos opened in Android share menu. Choose WhatsApp.';
    }else{
     const result=await fetch(link.href,{credentials:'same-origin',cache:'no-store'});
     if(!result.ok)throw Error('PDF download expired. Prepare again.');
     const blob=await result.blob();if(blob.size>29*1024*1024)throw Error('PDF too large for WhatsApp.');
     if(typeof File==='undefined')throw Error('File sharing unavailable. Use Android app.');
     const file=new File([blob],data.filename,{type:'application/pdf'});
     pdfReady={signature,file,at:Date.now()};
     status.textContent='Exact sequence PDF ready: '+orders.length+' orders and '+data.photos+' original photos. Tap Share ALL · Exact Sequence again.';
    }
   }catch(e){status.textContent='Exact sequence share failed: '+e.message;}
   finally{exact.disabled=false;}
  };

  // One native WhatsApp share action containing all chosen originals, ordered by
  // order index, followed by each order's individually numbered details card.
  // WhatsApp itself may reorder visual media; filenames preserve the sequence.
  shareAll.onclick=async()=>{
   if(!current()||shareAll.disabled)return;
   const latest=live();
   if(orders.length!==latest.length||orders.some(o=>!latest.some(x=>String(x.id)===String(o.id)&&JSON.stringify(x)===JSON.stringify(o)))){
    status.textContent='Orders changed. Close and reopen Order-wise Share.';return;
   }
   const plans=orders.map((o,i)=>({o,i,indexes:photos(o)}));
   if(plans.some(p=>!p.indexes.length)){
    status.textContent='Select at least one original photo for every order.';return;
   }
   const total=plans.reduce((n,p)=>n+p.indexes.length+1,0);
   if(total>54){status.textContent='Too many photos in this share. Maximum 54 images.';return;}
   const signature=JSON.stringify(plans);
   const native=/FlyXJAndroid\/(?:10|1[1-9]|[2-9][0-9])/.test(navigator.userAgent)&&
     typeof window.FlyxjShare?.shareFiles==='function';
   const message='FLYXJ ORDER-WISE PACK · '+orders.length+' ORDERS\n\n'+orders.map((o,i)=>caption(o,i+1,orders.length)).join('\n\n');
   if(!native&&allReady?.signature===signature&&Date.now()-allReady.at<5*60000){
    try{
     if(!navigator.share)throw Error('Web sharing unavailable; use FlyXJ Android.');
     if(navigator.canShare&&!navigator.canShare({files:allReady.files}))
      throw Error('Phone cannot share all '+total+' images. Try fewer photos or individual orders.');
     await navigator.share({files:allReady.files,text:message,title:'FLYXJ · '+orders.length+' grouped orders'});
     status.textContent='Share chooser finished. Confirm the WhatsApp recipient and media sequence.';
    }catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled':e.message;}
    return;
   }
   shareAll.disabled=true;send.disabled=true;next.disabled=true;
   try{
    const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw Error('Please sign in');
    const me=await r.json();if(me.role!=='staff')throw Error('User B only');
    const tickets=[];
    for(const p of plans){
     for(const index of p.indexes){
      status.textContent='Preparing order '+(p.i+1)+'/'+orders.length+', photo '+(index+1)+'/'+p.o.photoCount;
      tickets.push(await issue(p.o,{kind:'photo',index,sequence:p.i+1,total:orders.length},me.csrf));
     }
     status.textContent='Preparing details card '+(p.i+1)+'/'+orders.length;
     tickets.push(await issue(p.o,{kind:'batch-maker',sequence:p.i+1,total:orders.length,cardLast:true},me.csrf));
    }
    if(JSON.stringify(orders.map((o,i)=>({o,i,indexes:photos(o)})))!==signature||
       orders.some(o=>!live().some(x=>String(x.id)===String(o.id)&&JSON.stringify(x)===JSON.stringify(o))))
     throw Error('Order details changed during preparation. Reopen sharing.');
    if(native){
     window.FlyxjShare.shareFiles(JSON.stringify({files:tickets.map(t=>t.url),types:tickets.map(t=>t.type),
      title:'FLYXJ · '+orders.length+' grouped orders',text:message}));
     status.textContent='Opened one Android share menu for all '+orders.length+' orders ('+total+' images). Choose WhatsApp and verify sequence.';
    }else{
     if(!navigator.share||typeof File==='undefined')throw Error('Use FlyXJ Android V10+ or a phone browser with file sharing.');
     const files=[];
     for(const t of tickets){
      const result=await fetch(t.url,{credentials:'same-origin',cache:'no-store'});
      if(!result.ok)throw Error('Image link expired. Prepare again.');
      const blob=await result.blob();if(blob.size>15*1024*1024)throw Error('Image too large.');
      files.push(new File([blob],t.name,{type:t.type}));
     }
     if(navigator.canShare&&!navigator.canShare({files}))throw Error('Phone cannot share '+total+' images together; select fewer photos.');
     allReady={signature,files,at:Date.now()};
     status.textContent='All '+total+' images ready: photos + details card for each order. Tap Share ALL Orders Together again.';
    }
   }catch(e){status.textContent='Combined share failed: '+e.message}
   finally{shareAll.disabled=false;update();}
  };

  next.onclick=()=>{
   const o=orders[step];if(!o||!shared.has(String(o.id)))return;
   if(step+1<orders.length){step++;ready=null;status.textContent='Now prepare '+orders[step].reference+'.';update();}
   else{status.textContent='All '+orders.length+' orders opened for WhatsApp sharing. Verify messages inside WhatsApp.';pane.remove();}
  };
  const combinedTip=node('p','fx10-warning','RECOMMENDED: Exact Sequence sends ONE PDF with each order\'s original photos and SIZE, COLOUR, QTY immediately below on its own page. WhatsApp cannot rearrange PDF pages. Original Images mode remains optional but WhatsApp may mix images and text.');
  const bulkActions=node('div','fx11-step-buttons');bulkActions.append(exact,shareAll);
  controls.append(send,next);content.append(rows,combinedTip,bulkActions,guide,progress,controls,status);shell.append(heading,content);pane.append(shell);
  pane.onclick=e=>{if(e.target===pane)pane.remove()};document.body.append(pane);refresh();update();close.focus();
 }
 function activate(){
  if(!window.FlyxjBatch||window.FlyxjBatch.orderWiseInstalled)return;
  const old=window.FlyxjBatch.sync;window.FlyxjBatch.sync=function(){old();mount()};
  window.FlyxjBatch.orderWiseInstalled=true;mount();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate);else activate();
})();