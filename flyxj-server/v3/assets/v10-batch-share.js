'use strict';
(function(){
 const selected=new Map(),MAX=6;
 let prepared=null;
 const E=(tag,cls,value)=>{const e=document.createElement(tag);e.className=cls||'';if(value!==undefined)e.textContent=String(value);return e};
 const staff=()=>typeof state!=='undefined'&&state.me?.role==='staff';
 const all=()=>[...selected.keys()].map(id=>state.orders.find(o=>String(o.id)===String(id))).filter(Boolean).map(record);
 const record=o=>({id:o.id,createdAt:o.created_at||'',reference:o.reference||'FXJ-'+o.id,title:o.title||'Order',
    size:o.size||'Not set',colour:o.colour||'Not set',quantity:o.quantity||1,status:o.status||'pending',
    photoCount:Array.isArray(o.photos)?o.photos.length:0,updatedAt:o.updated_at||''});
 function summary(items){
  return 'FLYXJ · NUMBERED PRODUCTION ORDER PACK\n'+items.length+' orders · Check SIZE, COLOUR & quantity for EACH reference.\n\n'+
    items.map((o,i)=>'ORDER '+String(i+1).padStart(2,'0')+'/'+String(items.length).padStart(2,'0')+
      '\nReference: '+o.reference+'\nDress: '+o.title+'\nSIZE: '+o.size+
      '\nCOLOUR: '+o.colour+'\nQuantity: '+o.quantity+'\nStatus: '+o.status.replace(/_/g,' ')+'\n').join('\n')+
    '\nEND · '+items.length+' separate orders. Confirm every reference.';
 }
 function sync(){
  const body=document.getElementById('orderRows');if(!body)return;
  let bar=document.getElementById('fx10Toolbar');
  if(!staff()){selected.clear();bar?.remove();return;}
  if(!bar){
   bar=E('div','fx10-toolbar');bar.id='fx10Toolbar';
   const title=E('div','fx10-bar-title');title.append(E('strong','','Order Dispatch'),
     E('small','','Select up to 6 orders. Share photos and details from one menu.'));
   const actions=E('div','fx10-bar-actions');
   const select=E('button','fx10-btn fx10-muted','Select visible');select.type='button';select.onclick=()=>{
     for(const row of body.querySelectorAll('tr[data-id]')){
      const o=state.orders.find(x=>String(x.id)===row.dataset.id);
      if(o&&selected.size<MAX)selected.set(o.id,record(o));
     }sync();
   };
   const reset=E('button','fx10-btn fx10-muted','Clear');reset.type='button';reset.onclick=()=>{selected.clear();prepared=null;sync()};
   const open=E('button','fx10-btn fx10-primary','Share Exact Image');open.type='button';open.id='fx10ShareOpen';open.onclick=()=>window.FlyxjOrderWise?.open?.();
   actions.append(select,reset,open);bar.append(title,actions);
   document.getElementById('filterBar')?.after(bar);
  }
  for(const id of selected.keys())if(!state.orders.some(o=>o.id===id))selected.delete(id);
  for(const row of body.querySelectorAll('tr[data-id]')){
   const id=Number(row.dataset.id),first=row.querySelector('td');if(!first)continue;
   let label=first.querySelector('.fx10-select');
   if(!label){
    label=E('label','fx10-select');const input=E('input');input.type='checkbox';
    input.setAttribute('aria-label','Select order '+id);label.append(input,E('span','','Select'));
    label.onclick=e=>e.stopPropagation();input.onclick=e=>e.stopPropagation();
    input.onchange=()=>{
     if(input.checked){if(selected.size>=MAX){input.checked=false;return;}const o=state.orders.find(x=>x.id===id);if(o)selected.set(id,record(o));}
     else selected.delete(id);
     prepared=null;sync();
    };
    first.prepend(label);
   }
   label.querySelector('input').checked=selected.has(id);
   row.classList.toggle('fx10-row-active',selected.has(id));
  }
  const button=document.getElementById('fx10ShareOpen');if(button){button.disabled=!selected.size;button.textContent='Share Exact Image ('+selected.size+'/'+MAX+')';}
 }
 function show(){
  if(!staff()||!selected.size)return;
  document.getElementById('fx10Pack')?.remove();
  const mask=E('div','fx10-mask');mask.id='fx10Pack';
  const pane=E('section','fx10-pane');pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');
  const header=E('header','fx10-heading'),left=E('div');
  left.append(E('small','','FLYXJ V10 · USER B DISPATCH'),E('h2','','Sequential order pack'),
    E('p','','Images show 01/06, order reference, SIZE, COLOUR and quantity.'));
  const close=E('button','fx10-close','×');close.type='button';close.onclick=()=>mask.remove();close.setAttribute('aria-label','Close');
  header.append(left,close);pane.append(header);
  const main=E('div','fx10-body'),rows=E('div','fx10-pack-rows'),preview=E('pre','fx10-preview');
  const status=E('p','fx10-feedback','Ready to prepare');status.id='fx10ShareStatus';status.setAttribute('aria-live','polite');
  const buttons=E('div','fx10-pack-actions'),images=E('button','fx10-btn fx10-primary','Share numbered images');
  images.type='button';images.onclick=()=>shareImages(images,status);
  const whatsapp=E('button','fx10-btn fx10-green','WhatsApp text pack');whatsapp.type='button';whatsapp.onclick=()=>{
   const text=summary(all());
   if(window.FlyxjShare&&typeof window.FlyxjShare.shareText==='function'){
    window.FlyxjShare.shareText(text);status.textContent='Choose WhatsApp from Android share menu.';
   }else{window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');status.textContent='WhatsApp text pack opened.';}
  };
  const copy=E('button','fx10-btn fx10-muted','Copy ordered list');copy.type='button';copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(summary(all()));status.textContent='Order list copied';}
   catch{status.textContent='Clipboard unavailable: use WhatsApp text pack';}
  };
  buttons.append(images,whatsapp,copy);
  const warning=E('p','fx10-warning','WhatsApp may not show a caption with multiple images. The order sequence, SIZE, COLOUR and quantity are printed directly on each image.');
  main.append(rows,E('h3','','WhatsApp message preview'),preview,warning,status,buttons);pane.append(main);mask.append(pane);
  document.body.append(mask);mask.onclick=e=>{if(e.target===mask)mask.remove()};close.focus();
  function redraw(){
   rows.replaceChildren();const items=all();preview.textContent=summary(items);
   items.forEach((o,i)=>{
    const row=E('div','fx10-pack-row'),num=E('b','fx10-number',String(i+1).padStart(2,'0')),info=E('div','fx10-pack-info');
    info.append(E('strong','',o.reference+' · '+o.title),E('small','','SIZE '+o.size+'  •  COLOUR '+o.colour+'  •  Qty '+o.quantity));
    const move=E('div','fx10-pack-move');
    for(const direction of [-1,1]){
     const b=E('button','fx10-move',direction<0?'↑':'↓');b.type='button';b.disabled=i+direction<0||i+direction>=items.length;
     b.onclick=()=>{const list=all();[list[i],list[i+direction]]=[list[i+direction],list[i]];
       selected.clear();for(const x of list)selected.set(x.id,x);prepared=null;redraw();sync();};
     move.append(b);
    }row.append(num,info,move);rows.append(row);
   });
  }redraw();
 }
 async function shareImages(button,status){
  if(!staff()||button.disabled)return;
  const items=all(),key=JSON.stringify(items);
  if(prepared?.key===key&&Date.now()-prepared.at<6*60000){
   try{if(!navigator.share)throw Error('Web sharing unavailable. Use Android app or WhatsApp text pack.');
    await navigator.share({files:prepared.files,text:summary(items),title:'FLYXJ sequential order pack'});
    status.textContent='Share chooser completed. Verify recipient in WhatsApp.';
   }catch(e){status.textContent=e.name==='AbortError'?'Cancelled':e.message;}return;
  }
  button.disabled=true;
  try{
   const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Login required');
   const me=await r.json();if(me.role!=='staff')throw Error('Staff only');
   const tickets=[];
   for(const [i,o] of items.entries()){
    status.textContent='Preparing numbered image '+(i+1)+'/'+items.length;
    const res=await fetch('/api/orders/'+o.id+'/mobile-file',{method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json','x-csrf-token':me.csrf},
      body:JSON.stringify({kind:'batch-maker',sequence:i+1,total:items.length})});
    const file=await res.json().catch(()=>({}));if(!res.ok)throw Error(file.detail||'Failed order '+o.reference);
    const url=new URL(file.url,location.origin);
    if(url.origin!==location.origin||!/^\/api\/mobile-file\/[a-f0-9]{64}$/.test(url.pathname))throw Error('Untrusted attachment');
    tickets.push({url:url.href,filename:file.filename});
   }
   if(window.FlyxjShare&&typeof window.FlyxjShare.shareFiles==='function'&&/FlyXJAndroid\/(?:10|1[1-9]|[2-9][0-9])/.test(navigator.userAgent)){
    window.FlyxjShare.shareFiles(JSON.stringify({files:tickets.map(t=>t.url),types:tickets.map(()=>'image/png'),
      title:'FLYXJ · '+items.length+' numbered orders',text:summary(items)}));
    status.textContent='Android share chooser opening. Choose WhatsApp and verify numbered photos.';return;
   }
   if(!navigator.share||typeof File==='undefined')throw Error('Install FLYXJ Android V10 for picture pack, or use WhatsApp text.');
   const files=[];
   for(const t of tickets){const r=await fetch(t.url,{credentials:'same-origin'});if(!r.ok)throw Error('Order photo expired');
    files.push(new File([await r.blob()],t.filename,{type:'image/png'}));}
   if(navigator.canShare&&!navigator.canShare({files}))throw Error('Browser cannot share this many images.');
   if(JSON.stringify(all())!==key)throw Error('Order details changed while preparing photos. Please share again.');
   prepared={key,files,at:Date.now()};status.textContent='Pack ready with current sizes, colours and quantities. Tap Share numbered images again.';
  }catch(e){status.textContent='Share failed: '+e.message}finally{button.disabled=false}
 }
 window.FlyxjBatch={sync,clear:()=>{selected.clear();prepared=null;sync()},summary,selected:()=>all(),openLegacy:show};
})();
