'use strict';
function readMeasurements(){
 const map={bust:'measureBust',waist:'measureWaist',hips:'measureHips',shoulder:'measureShoulder',sleeve:'measureSleeve',length:'measureLength'};
 const result={};
 for(const [name,id] of Object.entries(map))if($(id).value.trim())result[name]=$(id).value.trim();
 return result;
}
const MAX_UPLOAD_PDF_BYTES=30*1024*1024;
async function readRequiredPdf(){
 const file=$('orderPdf').files?.[0],message=$('pdfCompressStatus');
 if(!file)throw Error('PDF file attach karna zaroori hai.');
 if(file.size<20||file.size>MAX_UPLOAD_PDF_BYTES)throw Error('PDF must be below 30 MB. Please choose a smaller PDF.');
 const first=new Uint8Array(await file.slice(0,1030).arrayBuffer());
 let found=false;
 for(let i=0;i<=first.length-5;i++){
   if(first[i]===37&&first[i+1]===80&&first[i+2]===68&&first[i+3]===70&&first[i+4]===45){
     found=true;break;
   }
 }
 if(!found)throw Error('Selected file is not a valid PDF. Please select a .pdf document.');
 if(message)message.textContent='Preparing PDF... Checking automatic compression.';
 // Lossless compression of the upload payload where browser supports it.
 // Not every PDF shrinks, so upload the original unchanged as a safe fallback.
 if(typeof CompressionStream!=='undefined'&&typeof file.stream==='function'){
   try{
     const zipped=await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
     if(zipped.size>0&&zipped.size<file.size*.94){
       const typed=new Blob([zipped],{type:'application/x-flyxj-pdf+gzip'});
       if(message)message.textContent='PDF automatically compressed for upload ('+Math.round(100*(1-zipped.size/file.size))+'% smaller).';
       return await readAsDataURL(typed);
     }
   }catch(ex){
     console.warn('Optional PDF transfer compression not available; using original PDF.');
   }
 }
 if(message)message.textContent='PDF ready. Original quality will be kept.';
 return await readAsDataURL(new Blob([file],{type:'application/pdf'}));
}
function formatAmount(value,currency='PKR'){
 const n=Number(value);
 if(!Number.isFinite(n))return '-';
 return (currency==='USD'?'$':'PKR ')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function financeInputs(){
 return {sale_pkr:$('salePkr').value,making_pkr:$('makingPkr').value,
 shipping_pkr:$('shippingPkr').value,fx_pkr_per_usd:$('usdRate').value};
}
function renderExtraDetails(o){
 const pdf=$('orderPdfLink');pdf.replaceChildren();
 if(o.pdf_url){
  const link=node('a','btn btn-soft','Download specification PDF');
  link.href=o.pdf_url;link.target='_blank';link.rel='noopener noreferrer';pdf.append(link);
 }else pdf.append(node('p','muted tiny','Legacy order: no specification PDF attached.'));
 const grid=$('detailMeasurements');grid.replaceChildren();
 const entries=Object.entries(o.measurements||{}).filter(([k,v])=>v);
 if(!entries.length)grid.append(node('span','muted tiny','No custom measurements'));
 for(const [key,val] of entries)grid.append(node('div','measure-pill',key+': '+val));
 $('detailDeadline').textContent='Priority: '+(o.priority||'normal')+' | Expected date: '+(o.expected_date||'Not set');
 const gallery=$('finishedGallery');gallery.replaceChildren();
 if(!(o.finished_photos||[]).length)gallery.append(node('span','muted tiny','Finished-product photos will appear here.'));
 for(const url of (o.finished_photos||[])){
  const img=node('img');img.src=url;img.alt='Finished dress image';
  img.onclick=()=>window.open(img.src,'_blank','noopener');gallery.append(img);
 }
 const a=o.approval||{},status=a.status||'not_requested';
 $('approvalInfo').replaceChildren(node('b','',status.replaceAll('_',' ').toUpperCase()),
 node('span','',a.note||'Staff can request approval before cutting and stitching.'));
 $('requestApprovalForm').classList.toggle('hidden',state.me?.role!=='staff'||['shipped','delivered','completed','cancelled'].includes(o.status));
 $('approvalDecisionForm').classList.toggle('hidden',state.me?.role!=='customer'||status!=='requested');
 $('summaryPdfLink').href='/api/orders/'+o.id+'/summary.pdf';
 const f=o.finance||{},view=$('detailFinanceView');view.replaceChildren();
 if(f.sale_pkr!==null&&f.sale_pkr!==undefined&&Number(f.fx_pkr_per_usd)>0){
  const sale=Number(f.sale_pkr),making=Number(f.making_pkr),shipping=Number(f.shipping_pkr),fx=Number(f.fx_pkr_per_usd);
  const earning=Number(o.customer_earning_pkr)||0,revenue=o.customer_earning_pkr!=null?earning:sale,cost=making+shipping,profit=revenue-cost;
  if(state.me?.role==='customer'){
   view.append(node('b','','My earning: '+formatAmount(earning)+' | '+formatAmount(earning/fx,'USD')));
   view.append(node('span','muted','Shipment and profit trends are available in Finance & Profit.'));
  }else{
  view.append(node('b','', 'Selling price: '+formatAmount(sale)+' | '+formatAmount(sale/fx,'USD')));
  view.append(node('span','', 'Making cost: '+formatAmount(making)+' | '+formatAmount(making/fx,'USD')));
  view.append(node('span','', 'Shipping cost: '+formatAmount(shipping)+' | '+formatAmount(shipping/fx,'USD')));
  view.append(node('span','', 'User A earning (revenue): '+formatAmount(earning)+' | '+formatAmount(earning/fx,'USD')));
  view.append(node('span','', 'Income used for profit: '+formatAmount(revenue)+' | '+formatAmount(revenue/fx,'USD')));
  view.append(node('span','', 'Total cost (making + shipping): '+formatAmount(cost)+' | '+formatAmount(cost/fx,'USD')));
  view.append(node('b','', 'Real earning / gross profit: '+formatAmount(profit)+' | '+formatAmount(profit/fx,'USD')));
  view.append(node('small','muted','Historical rate: '+fx+' PKR per USD'));
  }
 }else view.append(node('span','muted','User A earning: '+formatAmount(o.customer_earning_pkr||0)+'. User B will enter sale price, making cost, shipping cost and exchange rate.'));
 if(state.me?.role==='staff'){
  $('salePkr').value=f.sale_pkr??'';$('makingPkr').value=f.making_pkr??'';
  $('shippingPkr').value=f.shipping_pkr??'';$('usdRate').value=f.fx_pkr_per_usd??'';
 }
}
function alertNotification(message){
 state.notifications=(state.notifications||0)+1;
 $('notificationCount').textContent=state.notifications;$('notificationCount').classList.remove('hidden');
 if(state.me)toast(message);
}
