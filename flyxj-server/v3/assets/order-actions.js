'use strict';
/* Both User A and User B: edit, recoverable delete/restore, and WhatsApp share.
   This script never renders private PDF/image data inside the WhatsApp message;
   recipient opens the secure order links using their FlyXJ login.
 */
(function(){
 const $=id=>document.getElementById(id);
 const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x};
 const NUMBER='971567527192';
 const BASE='https://flyxj-order-manager-free.onrender.com';
 let active=false;
 const values=['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','CUSTOM'];
 async function request(url,opts={}){
  const headers={accept:'application/json',...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})};
  const res=await fetch(url,{credentials:'same-origin',...opts,headers});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(payload.detail||'Could not complete action ('+res.status+')');
  return payload;
 }
 function whatsappLink(o){
  const id=encodeURIComponent(o.id),total=Math.min(8,o.photos?.length||o.image_files?.length||0);
  const lines=[
   'FLYXJ New Order '+(o.reference||'FXJ-'+o.id),
   'Dress: '+String(o.title||'').slice(0,95),
   'Size: '+String(o.size||'').slice(0,80),
   'Color: '+String(o.colour||'').slice(0,80),
   'Quantity: '+String(o.quantity||1),
   '',
   'Order: '+BASE+'/order/'+id,
   'PDF: '+BASE+'/api/orders/'+id+'/pdf'
  ];
  for(let i=0;i<total;i++)lines.push('Photo '+(i+1)+': '+BASE+'/api/orders/'+id+'/photos/'+i);
  lines.push('Log in to FlyXJ to view PDFs and photos.');
  return 'https://wa.me/'+NUMBER+'?text='+encodeURIComponent(lines.join('\n'));
 }
 function toWhatsApp(o){
  const link=whatsappLink(o);
  if(/Android/i.test(navigator.userAgent))window.location.assign(link);
  else window.open(link,'_blank','noopener,noreferrer');
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
      colour:colour.value.trim(),size:size.value.trim(),quantity:Number(qInput.value),
      priority:pSel.value,expected_date:deadline.value,comments:notes.value};
     if(!values.includes(body.size)&&!body.size.startsWith('CUSTOM:')){
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
 function newOrderCreated(order,autoEnabled){
  if(autoEnabled)return;
  const box=modal('Order saved successfully','WhatsApp forward is ready for +971 56 752 7192. WhatsApp will open with the order, PDF and photo links; tap Send to forward.');
  box.append(el('p','flyxj-muted',(order.reference||'Order')+' · '+order.title));
  const actions=el('div','flyxj-action-buttons'),button=el('button','flyxj-action-primary','Open WhatsApp'),later=el('button','flyxj-action-secondary','Later');
  button.type='button';later.type='button';
  button.onclick=()=>toWhatsApp(order);later.onclick=dismiss;
  actions.append(button,later);box.append(actions);
 }
 window.FlyxjOrderActions={edit:editOrder,delete:deleteOrder,trash,newOrderCreated,share:toWhatsApp,link:whatsappLink};
 const trashButton=$('flyxjTrashButton');
 if(trashButton)trashButton.onclick=trash;
})();
