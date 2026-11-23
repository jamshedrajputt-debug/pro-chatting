'use strict';
/* Both User A and User B: edit, recoverable delete/restore, and WhatsApp share.
   This script never renders private PDF/image data inside the WhatsApp message;
   recipient opens the secure order links using their FlyXJ login.
 */
(function(){
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x};
 const values=['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','CUSTOM'];
 const shoeSizes=['UK 2','UK 3','UK 4','UK 5','UK 6','UK 7','UK 8','UK 9','UK 10','UK 11','UK 12','UK 13','EU 35','EU 36','EU 37','EU 38','EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46','EU 47','EU 48','US 4','US 5','US 6','US 7','US 8','US 9','US 10','US 11','US 12','US 13','US 14','CUSTOM'];
 let active=false;
 const request=async(url,opts={})=>{
  const headers={accept:'application/json',...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})};
  const res=await fetch(url,{credentials:'same-origin',...opts,headers});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(payload.detail||'Could not complete action ('+res.status+')');
  return payload;
 };
 async function toWhatsApp(order){
  try{
   const me=await request('/api/me');
   const id=encodeURIComponent(order.id);
   const box=modal('Share actual files to WhatsApp','Choose a file below. Your phone share menu opens: select WhatsApp and recipient. No order links are sent.');
   const status=el('p','flyxj-action-status','Share both real files together, or select one file individually.');
   if(me.role==='staff'){
    const combined=el('button','flyxj-action-primary','↗ Share Combined PNG + PDF (Choose App)');
    combined.type='button';combined.style.display='block';combined.style.margin='10px 0';combined.style.width='100%';
    combined.onclick=()=>{
      if(!window.FlyxjShareFiles)return status.textContent='Update app to V7 for native sharing.';
      window.FlyxjShareFiles.share(order.id,combined,status);
    };
    box.append(combined);
   }
   box.append(status);
   const choices=[['Share original PDF','pdf'],['Share combined maker image (PNG)','maker']];
   (order.photos||[]).forEach((_,i)=>choices.push(['Share reference photo '+(i+1),'photo',i]));
   for(const [label,kind,index] of choices){
    if(kind==='maker'&&me.role!=='staff')continue;
    const button=el('button','flyxj-action-primary',label);button.type='button';
    button.style.display='block';button.style.margin='10px 0';button.style.width='100%';
    let ready=null;
    button.onclick=async()=>{
     if(ready){
      // Invoke the native share sheet directly inside the user's tap.
      try{
       const sharing=navigator.share({files:[ready]});
       status.textContent='Confirm the recipient and Send inside WhatsApp.';
       await sharing;
       status.textContent='File shared with the selected app. WhatsApp delivery is not confirmed here.';
      }catch(e){status.textContent=e.name==='AbortError'?'Sharing cancelled.':e.message}
      return;
     }
     button.disabled=true;status.textContent='Preparing '+label+'...';
     try{
      if(!navigator.share)throw Error('This browser does not support direct file sharing. Open the order in Chrome on your phone.');
      const prepared=await request('/api/orders/'+id+'/mobile-file',{
       method:'POST',headers:{'x-csrf-token':me.csrf},body:JSON.stringify({kind,index})
      });
      const download=await fetch(prepared.url,{credentials:'same-origin'});
      if(!download.ok)throw Error('Could not retrieve file for sharing');
      const blob=await download.blob();
      const file=new File([blob],prepared.filename,{type:blob.type||download.headers.get('content-type')||'application/octet-stream'});
      if(navigator.canShare&&!navigator.canShare({files:[file]}))
       throw Error('Your browser cannot share this file. Use Download, then send it from WhatsApp attachments.');
      ready=file;
      button.textContent='Tap to send '+label.toLowerCase();
      status.textContent='File ready. Tap the button again to open WhatsApp from your phone sharing options.';
     }catch(e){status.textContent=e.message;}
     finally{button.disabled=false;}
    };
    box.append(button);
   }
  }catch(e){alert(e.message||'Cannot open file sharing')}
 }
 function dismiss(){
  const box=$('flyxjActionOverlay');
  if(box)box.remove();
  active=false;document.body.classList.remove('flyxj-action-open');
 }
 function modal(title,subtitle){
  dismiss();active=true;
  const overlay=el('div','flyxj-action-overlay');overlay.id='flyxjActionOverlay';
  const shell=el('section','flyxj-action-panel');
  shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');
  const head=el('div','flyxj-action-header'),x=el('button','flyxj-x','×');
  x.type='button';x.setAttribute('aria-label','Close');x.onclick=dismiss;
  const main=el('div');main.append(el('h2','',title),el('p','',subtitle||''));
  head.append(main,x);
  const content=el('div','flyxj-action-content');
  shell.append(head,content);overlay.append(shell);
  document.body.append(overlay);
  document.body.classList.add('flyxj-action-open');
  overlay.addEventListener('click',e=>{if(e.target===overlay)dismiss()});
  document.addEventListener('keydown',function esc(event){if(event.key==='Escape'&&active){dismiss();document.removeEventListener('keydown',esc)}});
  return content;
 }
 function field(form,id,label,value,tag='input'){
  const wrapper=el('label','flyxj-action-field'),caption=el('span','',label);
  let input=el(tag);input.name=id;input.id='edit-'+id;
  if(tag==='textarea')input.rows=3;
  input.value=value??'';
  wrapper.append(caption,input);form.append(wrapper);return input;
 }
 function pair(form,a,b){
  const row=el('div','flyxj-action-pair');row.append(a,b);form.append(row);
 }
 function fileValue(file){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result));
   reader.onerror=()=>reject(Error('Cannot read attachment'));
   reader.readAsDataURL(file);
  });
 }
 async function photoData(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Photos must be JPG, PNG or WebP');
  if(file.size<2400000)return fileValue(file);
  const original=await fileValue(file);
  const image=await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Could not open image'));img.src=original;
  });
  const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.86,.74,.61,.47]){
   const output=canvas.toDataURL('image/jpeg',quality);
   if(output.length<3200000)return output;
  }
  throw Error('Image is still too big. Choose a smaller photo.');
 }
 function note(box,message,isError=false){
  let status=box.querySelector('[data-action-status]');
  if(!status){status=el('p','flyxj-action-status');status.dataset.actionStatus='1';box.append(status)}
  status.textContent=message;status.className='flyxj-action-status'+(isError?' is-error':'');
 }
 function goBackAfterChange(deleted=false){
  if(location.pathname.startsWith('/order/'))window.location.assign('/#orders');
  else window.location.reload();
 }
 async function editOrder(id){
  try{
   const order=(await request('/api/orders/'+encodeURIComponent(id))).order;
   const box=modal('Edit order','Both User A and User B can update order information. Existing photos and PDF stay unless you choose replacements.');
   const form=el('form','flyxj-edit-form');box.append(form);
   field(form,'title','Dress / design',order.title).required=true;
   const widths=el('div','flyxj-action-pair');
   const sizeLabel=el('label','flyxj-action-field'),sizeText=el('span','','Size');
   const size=el('input');size.name='size';size.value=order.size;size.required=true;size.maxLength=80;sizeLabel.append(sizeText,size);
   const colourLabel=el('label','flyxj-action-field'),colourText=el('span','','Color');
   const colour=el('input');colour.name='colour';colour.value=order.colour;colour.required=true;colour.maxLength=80;
   colourLabel.append(colourText,colour);widths.append(sizeLabel,colourLabel);form.append(widths);
   const shoeLabel=el('label','flyxj-action-field');shoeLabel.append(el('span','','Shoes size (optional)'));
   const shoeSelect=el('select');shoeSelect.name='shoe_size';const emptyShoe=el('option','','No shoes');emptyShoe.value='';shoeSelect.append(emptyShoe);
   for(const option of shoeSizes){const opt=el('option','',option);opt.value=option;shoeSelect.append(opt)}
   if(order.shoe_size&&!shoeSizes.includes(order.shoe_size)){const opt=el('option','',order.shoe_size);opt.value=order.shoe_size;shoeSelect.append(opt)}
   shoeSelect.value=order.shoe_size||'';shoeLabel.append(shoeSelect);form.append(shoeLabel);
   const row=el('div','flyxj-action-pair');
   const qty=el('label','flyxj-action-field'),qInput=el('input');qInput.type='number';qInput.name='quantity';qInput.min=1;qInput.max=1000;qInput.required=true;qInput.value=order.quantity;
   qty.append(el('span','','Quantity'),qInput);
   const priority=el('label','flyxj-action-field'),pSel=el('select');pSel.name='priority';
   for(const option of ['normal','high','urgent']){const opt=el('option','',option);opt.value=option;opt.selected=order.priority===option;pSel.append(opt)}
   priority.append(el('span','','Priority'),pSel);row.append(qty,priority);form.append(row);
   const deadline=field(form,'expected_date','Delivery date',order.expected_date||'');
   deadline.type='date';
   const notes=field(form,'comments','Custom instructions',order.comments||'','textarea');notes.maxLength=2500;
   const measurement=field(form,'measurements','Measurements (e.g. bust:36 in, waist:28 in)',Object.entries(order.measurements||{}).filter(([,v])=>v).map(([k,v])=>k+':'+v).join(', '));
   const pic=el('label','flyxj-action-field');pic.append(el('span','','Replace reference photos (optional — 1 to 8)'));
   const picInput=el('input');picInput.type='file';picInput.accept='image/jpeg,image/png,image/webp';picInput.multiple=true;pic.append(picInput);form.append(pic);
   const pdfLabel=el('label','flyxj-action-field');pdfLabel.append(el('span','','Replace specification PDF (optional)'));
   const pdfInput=el('input');pdfInput.type='file';pdfInput.accept='.pdf,application/pdf';pdfLabel.append(pdfInput);form.append(pdfLabel);
   const actions=el('div','flyxj-action-buttons'),submit=el('button','flyxj-action-primary','Save changes');
   submit.type='submit';actions.append(submit);form.append(actions);
   form.onsubmit=async event=>{
    event.preventDefault();submit.disabled=true;note(box,'Saving updated order and attachments...');
    try{
     const body={updated_at:order.updated_at,title:form.elements.title.value,
      colour:colour.value.trim(),size:size.value.trim(),shoe_size:shoeSelect.value,quantity:Number(qInput.value),
      priority:pSel.value,expected_date:deadline.value,comments:notes.value};
     if(!values.includes(body.size)&&!shoeSizes.includes(body.size)&&!body.size.startsWith('CUSTOM:')){
      body.size='CUSTOM:'+body.size;
     }
     const measures={};
     for(const piece of measurement.value.split(',')){
      if(!piece.includes(':'))continue;
      const [key,...v]=piece.split(':');
      const k=key.trim().toLowerCase();if(['bust','waist','hips','shoulder','sleeve','length','inseam','neck','other'].includes(k))measures[k]=v.join(':').trim();
     }
     body.measurements=measures;
     if(picInput.files.length){
      if(picInput.files.length>8)throw Error('Maximum 8 replacement photos');
      body.images=await Promise.all([...picInput.files].map(photoData));
     }
     if(pdfInput.files.length){
      const f=pdfInput.files[0];
      if(f.size>30*1024*1024)throw Error('PDF must be at most 30 MB');
      body.pdf=await fileValue(f);
     }
     await request('/api/orders/'+id+'/edit',{method:'PATCH',headers:{'x-csrf-token':(await request('/api/me')).csrf},body:JSON.stringify(body)});
     note(box,'Order updated. Refreshing...');goBackAfterChange();
    }catch(e){note(box,e.message,true);submit.disabled=false}
   };
  }catch(e){alert(e.message)}
 }
 async function deleteOrder(id){
  try{
   const order=(await request('/api/orders/'+encodeURIComponent(id))).order;
   const box=modal('Delete '+(order.reference||'order')+'?','Move this order to Recently Deleted. You can restore it later; PDFs and photos stay safe.');
   const info=el('p','flyxj-delete-warning','Both User A and User B will no longer see this order in the active list.');
   const actions=el('div','flyxj-action-buttons'),cancel=el('button','flyxj-action-secondary','Cancel'),confirm=el('button','flyxj-action-danger','Move to Recently Deleted');
   cancel.onclick=dismiss;cancel.type='button';confirm.type='button';
   confirm.onclick=async()=>{
    confirm.disabled=true;note(box,'Moving order to Recently Deleted...');
    try{
     const me=await request('/api/me');
     await request('/api/orders/'+id,{method:'DELETE',headers:{'x-csrf-token':me.csrf},body:JSON.stringify({updated_at:order.updated_at})});
     goBackAfterChange(true);
    }catch(e){note(box,e.message,true);confirm.disabled=false}
   };
   actions.append(cancel,confirm);box.append(info,actions);
  }catch(e){alert(e.message)}
 }
 async function trash(){
  const box=modal('Recently Deleted','Deleted orders are still backed up in Supabase. Tap Restore to bring an order back.');
  try{
   const [res,me]=await Promise.all([request('/api/orders/deleted'),request('/api/me')]);
   if(!res.orders.length)box.append(el('p','flyxj-muted','No deleted orders.'));
   for(const order of res.orders){
    const row=el('div','flyxj-trash-row');
    row.append(el('span','',(order.reference||order.id)+' — '+order.title));
    const restore=el('button','flyxj-action-secondary','Restore');restore.type='button';
    restore.onclick=async()=>{
     restore.disabled=true;
     try{await request('/api/orders/'+order.id+'/restore',{method:'POST',headers:{'x-csrf-token':me.csrf},body:JSON.stringify({})});goBackAfterChange()}
     catch(e){note(box,e.message,true);restore.disabled=false}
    };row.append(restore);box.append(row);
   }
  }catch(e){note(box,e.message,true)}
 }
 window.FlyxjOrderActions={edit:editOrder,delete:deleteOrder,trash,share:toWhatsApp};
 const trashButton=$('flyxjTrashButton');
 if(trashButton)trashButton.onclick=trash;
})();
