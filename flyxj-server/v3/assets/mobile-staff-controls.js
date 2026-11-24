'use strict';
(function(){
const $=id=>document.getElementById(id);
const match=/^\/order\/([1-9][0-9]{0,8})\/?$/.exec(location.pathname);
if(!match)return;
const orderId=match[1];
let user=null,order=null;
const amount=n=>'PKR '+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
async function request(path,method='GET',body){
 const headers={'accept':'application/json'};
 if(body!==undefined){headers['content-type']='application/json';headers['x-csrf-token']=user.csrf}
 const response=await fetch(path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.detail||'Could not save changes');
 return data;
}
function field(form,name){return form.elements.namedItem(name)}
function feedback(form,message,error=false){
 const x=form.querySelector('[data-feedback]');if(x){x.textContent=message;x.style.color=error?'#b03240':'#11774f'}
}
async function save(form,endpoint,data){
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 feedback(form,'Saving securely…');
 try{
  const result=await request('/api/orders/'+orderId+endpoint,'PATCH',data);
  order=result.order;
  render();
  feedback(form,'✓ Saved. Both accounts will see the updated order.');
 }catch(e){feedback(form,e.message,true)}
 finally{button.disabled=false}
}
function render(){
 if(!order)return;
 const shipped=Number.isInteger(order.shipped_quantity)?order.shipped_quantity:
   ['shipped','delivered','completed'].includes(order.status)?Number(order.quantity)||0:0;
 const tracking=order.shipping||{};
 const info=$('fx9ShipmentSummary');
 if(info)info.textContent='Status: '+order.status.replaceAll('_',' ')+'\nShipped pieces: '+shipped+' / '+order.quantity+
 '\nCourier: '+(tracking.courier||'Not entered')+'\nShipping ID: '+(tracking.tracking_id||'Not entered');
 const finance=order.finance||{};
 const earning=Number(order.customer_earning_pkr)||0;
 const valid=finance.sale_pkr!==null&&finance.sale_pkr!==undefined&&Number(finance.fx_pkr_per_usd)>0;
 const price=Number(finance.sale_pkr)||0,making=Number(finance.making_pkr)||0,cost=Number(finance.shipping_pkr)||0;
 const revenue=order.customer_earning_pkr!=null?earning:price;
 const profit=revenue-making-cost;
 const staff=$('flyxjMobileStaffControls');
 if(staff)staff.classList.toggle('hidden',user?.role!=='staff');
 const earningCard=$('fx9EarningCard');
 if(earningCard)earningCard.classList.toggle('hidden',user?.role!=='customer');
 if(user?.role==='staff'){
  const ship=$('fx9ShipForm'),calc=$('fx9FinanceForm'),stage=$('fx9StatusForm');
  field(ship,'courier').value=tracking.courier||'';
  field(ship,'tracking_id').value=tracking.tracking_id||'';
  field(ship,'tracking_url').value=tracking.tracking_url||'';
  field(ship,'total_quantity').value=order.quantity;
  field(ship,'shipped_quantity').max=String(order.quantity);
  field(ship,'shipped_quantity').value=shipped;
  for(const name of ['sale_pkr','making_pkr','shipping_pkr','fx_pkr_per_usd'])
   field(calc,name).value=finance[name]??'';
  field(stage,'status').value=order.status;
  field(stage,'staff_note').value=order.staff_note||'';
  $('fx9ProfitView').textContent=valid?
   'User A earning (income): '+amount(earning)+'\nMaking: '+amount(making)+
   '\nShipping: '+amount(cost)+'\nReal earning / gross profit: '+amount(profit)+
   '\nUSD profit: $'+(profit/Number(finance.fx_pkr_per_usd)).toFixed(2):
   'Enter selling price, making, shipping cost and exchange rate to calculate profit.';
 }else if(user?.role==='customer'){
  field($('fx9EarningForm'),'customer_earning_pkr').value=earning;
  $('fx9CustomerProfit').textContent='My earning: '+amount(earning)+
   '\nStatus: '+order.status.replaceAll('_',' ')+'\nShipped: '+shipped+' / '+order.quantity;
 }
}
async function start(){
 try{
  user=await request('/api/me');
  order=(await request('/api/orders/'+orderId)).order;
  const ship=$('fx9ShipForm'),finance=$('fx9FinanceForm'),stage=$('fx9StatusForm'),earning=$('fx9EarningForm');
  if(!ship||!finance||!stage||!earning)return;
  if(user.role==='staff'){
   ship.onsubmit=e=>{
    e.preventDefault();
    save(ship,'/shipping',{courier:field(ship,'courier').value.trim(),
      tracking_id:field(ship,'tracking_id').value.trim(),
      tracking_url:field(ship,'tracking_url').value.trim(),
      shipped_quantity:Number(field(ship,'shipped_quantity').value)});
   };
   finance.onsubmit=e=>{
    e.preventDefault();
    const body={};
    for(const key of ['sale_pkr','making_pkr','shipping_pkr','fx_pkr_per_usd'])body[key]=field(finance,key).value;
    save(finance,'/finance',body);
   };
   stage.onsubmit=e=>{
    e.preventDefault();
    save(stage,'/status',{status:field(stage,'status').value,staff_note:field(stage,'staff_note').value,
      shipped_quantity:Number(field(ship,'shipped_quantity').value)});
   };
   finance.addEventListener('input',()=>{
    const sale=Number(field(finance,'sale_pkr').value)||0;
    const making=Number(field(finance,'making_pkr').value)||0;
    const shipping=Number(field(finance,'shipping_pkr').value)||0;
    const earning=Number(order.customer_earning_pkr)||0;
    const fx=Number(field(finance,'fx_pkr_per_usd').value);
    const income=order.customer_earning_pkr!=null?earning:sale;
    const p=income-making-shipping;
    $('fx9ProfitView').textContent='Gross profit: '+amount(p)+(fx>0?'  ·  USD $'+(p/fx).toFixed(2):'')+
      '\nCalculation: User A earning (or selling price if blank) − Making − Shipping';
   });
  }
  if(user.role==='customer')earning.onsubmit=e=>{
   e.preventDefault();
   save(earning,'/customer-earning',{customer_earning_pkr:field(earning,'customer_earning_pkr').value});
  };
  render();
 }catch(e){
  const info=$('fx9ShipmentSummary');if(info)info.textContent='Unable to load mobile finance: '+e.message;
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();