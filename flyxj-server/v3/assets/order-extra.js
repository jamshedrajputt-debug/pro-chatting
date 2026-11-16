'use strict';
function readMeasurements(){
 const map={bust:'measureBust',waist:'measureWaist',hips:'measureHips',shoulder:'measureShoulder',sleeve:'measureSleeve',length:'measureLength'};
 const result={};
 for(const [name,id] of Object.entries(map))if($(id).value.trim())result[name]=$(id).value.trim();
 return result;
}
async function readRequiredPdf(){
 const file=$('orderPdf').files?.[0];
 if(!file)throw Error('Attach specification PDF (required)');
 if(file.size<25||file.size>6000000)throw Error('PDF must be under 6 MB');
 const raw=await readAsDataURL(file);
 const result=raw.replace(/^data:[^;]*;base64,/,'data:application/pdf;base64,');
 if(!result.startsWith('data:application/pdf;base64,JVBER'))throw Error('Choose a valid PDF');
 return result;
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
  const cost=making+shipping,profit=sale-cost;
  view.append(node('b','', 'Selling price: '+formatAmount(sale)+' | '+formatAmount(sale/fx,'USD')));
  view.append(node('span','', 'Making cost: '+formatAmount(making)+' | '+formatAmount(making/fx,'USD')));
  view.append(node('span','', 'Shipping cost: '+formatAmount(shipping)+' | '+formatAmount(shipping/fx,'USD')));
  view.append(node('span','', 'Total cost: '+formatAmount(cost)+' | '+formatAmount(cost/fx,'USD')));
  view.append(node('b','', 'Gross profit: '+formatAmount(profit)+' | '+formatAmount(profit/fx,'USD')));
  view.append(node('small','muted','Historical rate: '+fx+' PKR per USD'));
 }else view.append(node('span','muted','Staff will enter sale price, making cost, shipping cost and exchange rate.'));
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
