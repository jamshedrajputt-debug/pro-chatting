'use strict';
(function(){
 const $=id=>document.getElementById(id),match=/^\/order\/([1-9][0-9]{0,8})\/?$/.exec(location.pathname);
 if(!match)return;
 const id=match[1];let user=null,order=null,earningMoney=null,makingMoney=null,shippingMoney=null;
 const field=(form,name)=>form?.elements.namedItem(name);
 const fmt=n=>'PKR '+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
 async function api(path,method='GET',payload){
  const headers={accept:'application/json'};
  if(payload!==undefined){headers['content-type']='application/json';headers['x-csrf-token']=user.csrf}
  const response=await fetch(path,{method,credentials:'same-origin',headers,
   body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.detail||'Unable to save order');
  return data;
 }
 function notice(form,text,bad=false){const x=form?.querySelector('[data-feedback]');if(x){x.textContent=text;x.style.color=bad?'#b03240':'#11774f'}}
 async function save(form,route,body){
  const button=form.querySelector('button[type=submit]');button.disabled=true;notice(form,'Saving…');
  try{
   order=(await api('/api/orders/'+id+route,'PATCH',body)).order;
   render();notice(form,'✓ Saved. Both accounts will see the updated order.');
  }catch(e){notice(form,e.message,true)}
  finally{button.disabled=false}
 }
 function updateProfit(){
  if(!order||user?.role!=='staff')return;
  const box=$('fx9ProfitView'),rate=Number(field($('fx9FinanceForm'),'fx_pkr_per_usd').value);
  const making=makingMoney?.pkr(),shipping=shippingMoney?.pkr();
  const income=order.customer_earning_pkr;
  if(income==null||making===null||shipping===null||!Number.isFinite(rate)||rate<=0){
    box.textContent='User A net earning: '+(income==null?'Not entered yet':fmt(income))+
     '\nEnter making/shipping amounts and order FX rate to calculate real profit.';
    return;
  }
  const profit=FlyxjCurrency.round(Number(income)-making-shipping);
  box.textContent='User A net earning: '+fmt(income)+'\nMaking cost: '+fmt(making)+
   '\nShipping cost: '+fmt(shipping)+'\nReal profit: '+fmt(profit)+
   ' / USD $'+(profit/rate).toFixed(2);
 }
 function render(){
  if(!order)return;
  const finance=order.finance||{},fx=finance.fx_pkr_per_usd;
  const shipped=Number.isInteger(order.shipped_quantity)?order.shipped_quantity:
    ['shipped','delivered','completed'].includes(order.status)?order.quantity:0;
  const ship=order.shipping||{};
  $('fx9ShipmentSummary').textContent='Status: '+order.status.replaceAll('_',' ')+
    '\nShipped: '+shipped+'/'+order.quantity+'\nCourier: '+(ship.courier||'Not entered')+
    '\nTracking ID: '+(ship.tracking_id||'Not entered');
  $('flyxjMobileStaffControls')?.classList.toggle('hidden',user.role!=='staff');
  $('fx9EarningCard')?.classList.toggle('hidden',user.role!=='customer');
  if(user.role==='staff'){
   const form=$('fx9FinanceForm'),sf=$('fx9ShipForm'),stage=$('fx9StatusForm');
   field(sf,'courier').value=ship.courier||'';field(sf,'tracking_id').value=ship.tracking_id||'';
   field(sf,'tracking_url').value=ship.tracking_url||'';field(sf,'shipped_quantity').value=shipped;
   field(sf,'shipped_quantity').max=String(order.quantity);field(sf,'total_quantity').value=order.quantity;
   field(form,'fx_pkr_per_usd').value=fx??'';
   makingMoney.load(finance.making_pkr,fx);
   shippingMoney.load(finance.shipping_pkr,fx);
   field(stage,'status').value=order.status;field(stage,'staff_note').value=order.staff_note||'';
   updateProfit();
  }else{
   const earningForm=$('fx9EarningForm');
   field(earningForm,'earning_rate').value=fx??'';
   earningMoney.load(order.customer_earning_pkr,fx);
   const x=$('fx9CustomerProfit'),n=order.customer_earning_pkr;
   x.textContent='My Etsy net earning: '+(n==null?'Not entered':fmt(n)+
     (Number(fx)>0?' / USD $'+(Number(n)/Number(fx)).toFixed(2):''))+
     '\nShipped: '+shipped+'/'+order.quantity;
  }
 }
 async function boot(){
  try{
   user=await api('/api/me');order=(await api('/api/orders/'+id)).order;
   const sf=$('fx9ShipForm'),form=$('fx9FinanceForm'),stage=$('fx9StatusForm'),earn=$('fx9EarningForm');
   if(!sf||!form||!stage||!earn||!window.FlyxjCurrency)throw Error('Finance controls missing. Refresh app.');
   if(user.role==='staff'){
    const rate=field(form,'fx_pkr_per_usd');
    makingMoney=FlyxjCurrency.connect(field(form,'making_pkr'),field(form,'making_currency'),rate,$('fx9CostConversion'));
    shippingMoney=FlyxjCurrency.connect(field(form,'shipping_pkr'),field(form,'shipping_currency'),rate,null);
    form.addEventListener('input',updateProfit);form.addEventListener('change',updateProfit);
    form.onsubmit=e=>{
     e.preventDefault();
     const making=makingMoney.pkr(),shipping=shippingMoney.pkr();
     if(making===null||shipping===null)return notice(form,'Enter making, shipping and a valid FX rate',true);
     save(form,'/finance',{making_pkr:making,shipping_pkr:shipping,fx_pkr_per_usd:rate.value});
    };
    sf.onsubmit=e=>{
     e.preventDefault();
     save(sf,'/shipping',{courier:field(sf,'courier').value.trim(),
      tracking_id:field(sf,'tracking_id').value.trim(),tracking_url:field(sf,'tracking_url').value.trim(),
      shipped_quantity:Number(field(sf,'shipped_quantity').value)});
    };
    stage.onsubmit=e=>{
     e.preventDefault();
     save(stage,'/status',{status:field(stage,'status').value,
      staff_note:field(stage,'staff_note').value,
      shipped_quantity:Number(field(sf,'shipped_quantity').value)});
    };
   }else{
    earningMoney=FlyxjCurrency.connect(field(earn,'customer_earning_pkr'),
      field(earn,'earning_currency'),field(earn,'earning_rate'),$('fx9EarningConversion'));
    earn.onsubmit=e=>{
     e.preventDefault();
     const data=earningMoney.payload();
     if(earningMoney.pkr()===null)return notice(earn,'Enter net earning and FX rate',true);
     save(earn,'/customer-earning',data);
    };
   }
   render();
  }catch(e){if($('fx9ShipmentSummary'))$('fx9ShipmentSummary').textContent='Unable to load order finance: '+e.message}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
