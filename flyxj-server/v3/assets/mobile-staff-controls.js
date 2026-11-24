'use strict';
(function(){
 const $=id=>document.getElementById(id),match=/^\/order\/([1-9][0-9]{0,8})\/?$/.exec(location.pathname);
 if(!match)return;
 const id=match[1];let user,order;
 const money=window.FlyxjMoney;
 const field=(form,name)=>form?.elements.namedItem(name);
 const fmt=n=>'PKR '+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
 let controls={};
 async function api(route,method='GET',payload){
  const headers={accept:'application/json'};
  if(payload!==undefined){headers['content-type']='application/json';headers['x-csrf-token']=user.csrf}
  const r=await fetch(route,{method,credentials:'same-origin',headers,cache:'no-store',
   body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.detail||'Could not save order');return data;
 }
 function status(form,text,bad=false){const x=form?.querySelector('[data-feedback]');if(x){x.textContent=text;x.style.color=bad?'#b03240':'#11774f'}}
 async function save(form,route,body){
  const b=form.querySelector('button[type=submit]');b.disabled=true;status(form,'Saving…');
  try{order=(await api('/api/orders/'+id+route,'PATCH',body)).order;render();status(form,'✓ Saved and synced to both accounts')}
  catch(e){status(form,e.message,true)}finally{b.disabled=false}
 }
 function render(){
  if(!order||!user)return;
  const f=order.finance||{},fx=Number(f.fx_pkr_per_usd)||0;
  const earning=Number(order.customer_earning_pkr)||0;
  const shipped=Number.isInteger(order.shipped_quantity)?order.shipped_quantity:['shipped','delivered','completed'].includes(order.status)?order.quantity:0;
  const ship=order.shipping||{};
  $('fx9ShipmentSummary').textContent='Status: '+order.status.replaceAll('_',' ')+'\nShipped pieces: '+shipped+'/'+order.quantity+
    '\nCourier: '+(ship.courier||'Not entered')+'\nTracking ID: '+(ship.tracking_id||'Not entered');
  $('flyxjMobileStaffControls')?.classList.toggle('hidden',user.role!=='staff');
  $('fx9EarningCard')?.classList.toggle('hidden',user.role!=='customer');
  if(user.role==='customer'){
    const sale=$('fx9SaleForm'),earn=$('fx9EarningForm');
    field(sale,'fx_pkr_per_usd').value=fx||'';
    controls.sale?.set(f.sale_pkr,fx,f.sale_usd_input!=null?'USD':'USD');
    controls.earning?.set(order.customer_earning_pkr,fx,'USD');
    const el=$('fx9CustomerProfit');el.textContent='My earning: '+fmt(earning)+(fx>0?' / USD $'+(earning/fx).toFixed(2):'')+
      '\nSelling: '+(f.sale_pkr!=null?fmt(f.sale_pkr):'Not entered')+
      '\nStatus: '+order.status.replaceAll('_',' ')+'\nShipped: '+shipped+'/'+order.quantity;
  }else{
    const form=$('fx9FinanceForm'),sf=$('fx9ShipForm'),stage=$('fx9StatusForm');
    field(sf,'courier').value=ship.courier||'';field(sf,'tracking_id').value=ship.tracking_id||'';
    field(sf,'tracking_url').value=ship.tracking_url||'';field(sf,'shipped_quantity').value=shipped;
    field(sf,'shipped_quantity').max=String(order.quantity);field(sf,'total_quantity').value=order.quantity;
    field(form,'fx_pkr_per_usd').value=fx||'';
    field(form,'sale_pkr').value=f.sale_pkr??'';
    controls.making?.set(f.making_pkr,fx,'USD');
    controls.shipping?.set(f.shipping_pkr,fx,'USD');
    field(stage,'status').value=order.status;field(stage,'staff_note').value=order.staff_note||'';
    drawProfit();
  }
 }
 function drawProfit(){
  if(!order||user.role!=='staff')return;
  const form=$('fx9FinanceForm'),f=order.finance||{},sale=f.sale_pkr;
  const making=controls.making?.pkr(),shipping=controls.shipping?.pkr(),fx=Number(field(form,'fx_pkr_per_usd').value);
  const out=$('fx9ProfitView');
  if(sale==null||making==null||shipping==null||fx<=0){
   out.textContent='Saved selling price from User A: '+(sale==null?'Pending':fmt(sale))+
    '\nEnter making cost, shipping cost and FX rate to calculate gross profit.';return
  }
  const profit=money.round(Number(sale)-making-shipping-(Number(order.customer_earning_pkr)||0));
  out.textContent='Gross profit: '+fmt(profit)+' / USD $'+(profit/fx).toFixed(2)+
   '\nSale '+fmt(sale)+' − Making '+fmt(making)+' − Shipping '+fmt(shipping)+
   ' − User A earning '+fmt(order.customer_earning_pkr);
 }
 async function boot(){
  try{
   user=await api('/api/me');order=(await api('/api/orders/'+id)).order;
   const sale=$('fx9SaleForm'),earn=$('fx9EarningForm'),production=$('fx9FinanceForm'),ship=$('fx9ShipForm'),stage=$('fx9StatusForm');
   if(!sale||!earn||!production||!ship||!stage||!money)throw Error('Currency controls unavailable; refresh the app');
   if(user.role==='customer'){
    const rate=field(sale,'fx_pkr_per_usd');
    controls.sale=money.create(field(sale,'sale_usd'),order.finance?.sale_pkr,rate,{defaultCurrency:'USD'});
    controls.earning=money.create(field(earn,'customer_earning_pkr'),order.customer_earning_pkr,rate,{allowZero:true,defaultCurrency:'USD'});
    const update=()=>{
     const p=controls.sale?.pkr();$('fx9SalePkrPreview').textContent=p==null?'Enter USD/PKR amount and rate.':'Selling price = '+fmt(p)+
      ' / USD $'+(p/Number(rate.value)).toFixed(2);
    };
    sale.addEventListener('input',update);sale.addEventListener('change',update);
    sale.onsubmit=e=>{e.preventDefault();save(sale,'/selling-price',controls.sale.payload())};
    earn.onsubmit=e=>{e.preventDefault();save(earn,'/customer-earning',controls.earning.payload())};
   }else{
    const rate=field(production,'fx_pkr_per_usd');
    const saleInput=field(production,'sale_pkr');saleInput.readOnly=true;saleInput.required=false;
    saleInput.title='User A controls the selling price';
    const label=saleInput.closest('label');if(label)label.firstChild.textContent='User A selling price (PKR, read-only)';
    controls.making=money.create(field(production,'making_pkr'),order.finance?.making_pkr,rate,{allowZero:true,defaultCurrency:'USD'});
    controls.shipping=money.create(field(production,'shipping_pkr'),order.finance?.shipping_pkr,rate,{allowZero:true,defaultCurrency:'USD'});
    production.addEventListener('input',drawProfit);production.addEventListener('change',drawProfit);
    production.onsubmit=e=>{e.preventDefault();save(production,'/production-costs',{
      making:controls.making.payload(),shipping:controls.shipping.payload(),fx_pkr_per_usd:rate.value
    })};
    ship.onsubmit=e=>{e.preventDefault();save(ship,'/shipping',{
      courier:field(ship,'courier').value.trim(),tracking_id:field(ship,'tracking_id').value.trim(),
      tracking_url:field(ship,'tracking_url').value.trim(),shipped_quantity:Number(field(ship,'shipped_quantity').value)
    })};
    stage.onsubmit=e=>{e.preventDefault();save(stage,'/status',{
      status:field(stage,'status').value,staff_note:field(stage,'staff_note').value,
      shipped_quantity:Number(field(ship,'shipped_quantity').value)
    })};
   }
   render();
  }catch(e){if($('fx9ShipmentSummary'))$('fx9ShipmentSummary').textContent='Unable to load order money: '+e.message}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
