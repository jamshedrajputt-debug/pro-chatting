'use strict';
/* Staff-only exact image order pack. One image = immutable visual sequence. */
(function(){
 const $=id=>document.getElementById(id);
 const node=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e};
 const chosen=new Map();
 let orders=[],modal=null,prepared=null;
 const authorized=()=>typeof state!=='undefined'&&state.me?.role==='staff';
 const live=()=>window.FlyxjBatch?.selected?.()||[];
 const safe=v=>String(v??'').trim();
 const reference=o=>{
  const date=new Date(o.created_at||o.createdAt||'');
  if(!Number.isNaN(date.getTime())&&Number.isInteger(Number(o.id))&&Number(o.id)>0)
   return 'FXJ-'+date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(o.id).padStart(6,'0');
  return safe(o.reference)||'FXJ-'+String(o.id).padStart(6,'0');
 };
 function selectedPhotos(o){
  const key=String(o.id),count=Math.min(8,o.photoCount||0);
  if(!chosen.has(key))chosen.set(key,new Set(Array.from({length:count},(_,i)=>i)));
  const set=chosen.get(key);
  for(const idx of [...set])if(idx>=count)set.delete(idx);
  return [...set].sort((a,b)=>a-b);
 }
 function message(){
  return orders.map(o=>'Reference: '+reference(o)+'\nSize: '+safe(o.size||'Not set')+'\nColor: '+safe(o.colour||'Not set')).join('\n\n');
 }
 function snapshot(){
  return JSON.stringify(orders.map(o=>({id:o.id,updatedAt:o.updatedAt,photoIndexes:selectedPhotos(o)})));
 }
 function validOrders(){
  const now=live();
  return orders.length===now.length&&orders.every(o=>now.some(n=>String(n.id)===String(o.id)&&JSON.stringify(n)===JSON.stringify(o)));
 }
 function open(){
  if(!authorized())return;
  orders=live().map(o=>({...o}));if(!orders.length)return alert('Select orders first.');
  chosen.clear();prepared=null;
  $('fx11OrderWiseDialog')?.remove();
  modal=node('div','fx10-mask');modal.id='fx11OrderWiseDialog';
  const pane=node('section','fx10-pane fx11-shell');pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');
  const heading=node('header','fx10-heading'),title=node('div');
  title.append(node('small','','FLYXJ · PRODUCTION'),node('h2','','Share Orders · Exact Image'),
   node('p','','Only Reference, Size and Color. All selected photos stay in one ordered image.'));
  const close=node('button','fx10-close','×');close.type='button';close.setAttribute('aria-label','Close');
  close.onclick=()=>modal.remove();heading.append(title,close);
  const body=node('div','fx10-body'),rows=node('div','fx10-pack-rows'),
   status=node('p','fx10-feedback','Choose photos, then share the exact image.');
  status.setAttribute('aria-live','polite');
  const share=node('button','fx10-btn fx10-green','Share Exact Image');share.type='button';
  const download=node('a','fx10-btn fx10-muted','Preview / Download Image');
  download.id='fx15ImageDownload';download.hidden=true;download.rel='noopener noreferrer';
  download.target='_blank';download.download='FLYXJ-EXACT-SEQUENCE.jpg';
  const preview=node('div','fx15-preview');preview.id='fx15ImagePreview';preview.hidden=true;
  const img=node('img','fx15-preview-image');img.alt='Exact order pack image';img.loading='lazy';
  preview.append(img);
  function invalidate(){
   prepared=null;download.hidden=true;preview.hidden=true;img.removeAttribute('src');
  }
  function draw(){
   rows.replaceChildren();
   orders.forEach((o,i)=>{
    const row=node('div','fx10-pack-row'),num=node('b','fx10-number',String(i+1).padStart(2,'0'));
    const info=node('div','fx10-pack-info');
    info.append(node('strong','',reference(o)),node('small','','SIZE '+safe(o.size||'Not set')+' · COLOR '+safe(o.colour||'Not set')));
    const picks=node('div','fx11-photo-picker'),indexes=new Set(selectedPhotos(o));
    if(!o.photoCount)picks.append(node('small','','No reference photos'));
    else{
     picks.append(node('small','fx11-photo-title','Selected photos'));
     for(let k=0;k<Math.min(8,o.photoCount);k++){
      const choice=node('label','fx11-photo-choice'),check=node('input');check.type='checkbox';check.checked=indexes.has(k);
      check.onchange=()=>{
       const set=chosen.get(String(o.id));if(check.checked)set.add(k);else set.delete(k);
       invalidate();status.textContent='Selection updated. Share Exact Image.';
      };
      choice.append(check,node('span','','Photo '+(k+1)));picks.append(choice);
     }
    }
    info.append(picks);
    const moves=node('div','fx10-pack-move');
    for(const d of [-1,1]){
     const btn=node('button','fx10-move',d<0?'↑':'↓');btn.type='button';btn.disabled=i+d<0||i+d>=orders.length;
     btn.onclick=()=>{
      [orders[i],orders[i+d]]=[orders[i+d],orders[i]];
      invalidate();draw();status.textContent='Order sequence updated.';
     };
     moves.append(btn);
    }
    row.append(num,info,moves);rows.append(row);
   });
  }
  share.onclick=async()=>{
   if(!authorized()||share.disabled)return;
   if(!validOrders()){status.textContent='Order changed. Close and reopen Share Orders.';return;}
   const plans=orders.map(o=>({id:o.id,updatedAt:o.updatedAt,photoIndexes:selectedPhotos(o)}));
   if(plans.some(p=>!p.photoIndexes.length)){status.textContent='Select at least one photo per order.';return;}
   const signature=snapshot();
   const native=/FlyXJAndroid\/(?:10|1[1-9]|[2-9][0-9])/.test(navigator.userAgent)&&
    typeof window.FlyxjShare?.shareFiles==='function';
   if(!native&&prepared?.signature===signature&&Date.now()-prepared.at<5*60000){
    try{
     if(!navigator.share)throw Error('Browser sharing unavailable. Use Android or download the image.');
     if(navigator.canShare&&!navigator.canShare({files:[prepared.file]}))throw Error('Browser cannot share image.');
     await navigator.share({files:[prepared.file],title:'FLYXJ Order Pack',text:message()});
     status.textContent='Share menu completed. Confirm WhatsApp delivery.';
    }catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled':e.message;}
    return;
   }
   share.disabled=true;
   try{
    status.textContent='Preparing exact sequence image…';
    const meResp=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
    if(!meResp.ok)throw Error('Please sign in');
    const me=await meResp.json();if(me.role!=='staff')throw Error('User B only');
    const r=await fetch('/api/orders/ordered-share-image',{
     method:'POST',credentials:'same-origin',
     headers:{'content-type':'application/json','x-csrf-token':me.csrf},
     body:JSON.stringify({orders:plans})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(data.detail||'Image could not be created');
    const url=new URL(data.url,location.origin);
    if(url.origin!==location.origin||!/^\/api\/mobile-file\/[a-f0-9]{64}$/.test(url.pathname)||url.search||url.hash)
     throw Error('Invalid private image link');
    if(signature!==snapshot()||!validOrders())throw Error('Orders changed during image creation. Retry.');
    download.href=url.href;download.download=data.filename;download.hidden=false;
    img.src=url.href;preview.hidden=false;
    if(native){
     window.FlyxjShare.shareFiles(JSON.stringify({
      files:[url.href],types:['image/jpeg'],title:'FLYXJ Order Pack',text:message()
     }));
     status.textContent='Exact image prepared. Choose WhatsApp in Android share menu.';
    }else{
     const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store'});
     if(!response.ok)throw Error('Image link expired');
     const blob=await response.blob();
     if(blob.size>14*1024*1024)throw Error('Image is too large');
     prepared={signature,file:new File([blob],data.filename,{type:'image/jpeg'}),at:Date.now()};
     status.textContent='Image ready. Tap Share Exact Image again, or download.';
    }
   }catch(e){status.textContent='Sharing failed: '+e.message}
   finally{share.disabled=false}
  };
  const buttons=node('div','fx11-step-buttons');buttons.append(share,download);
  body.append(rows,buttons,preview,status);pane.append(heading,body);modal.append(pane);
  modal.onclick=e=>{if(e.target===modal)modal.remove()};
  document.body.append(modal);draw();close.focus();
 }
 function activate(){
  if(!window.FlyxjBatch||window.FlyxjBatch.orderWiseInstalled)return;
  const prev=window.FlyxjBatch.sync;
  window.FlyxjBatch.sync=function(){prev();$('fx11OrderWiseButton')?.remove()};
  window.FlyxjBatch.orderWiseInstalled=true;
  window.FlyxjOrderWise={open};
  $('fx11OrderWiseButton')?.remove();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate);else activate();
})();