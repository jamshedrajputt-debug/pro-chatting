'use strict';
(function(){
 let controls={},initialized=false;
 const el=id=>document.getElementById(id);
 function init(order){
  if(!window.FlyxjMoney||!order)return;
  const f=order.finance||{},fx=Number(f.fx_pkr_per_usd)||0;
  if(!initialized){
   controls.sale=window.FlyxjMoney.create(el('customerSellingUsd'),null,el('customerSellingRate'),{defaultCurrency:'USD'});
   controls.earning=window.FlyxjMoney.create(el('customerEarningEdit'),null,el('customerSellingRate'),{defaultCurrency:'USD',allowZero:true});
   controls.making=window.FlyxjMoney.create(el('makingPkr'),null,el('usdRate'),{defaultCurrency:'USD',allowZero:true});
   controls.shipping=window.FlyxjMoney.create(el('shippingPkr'),null,el('usdRate'),{defaultCurrency:'USD',allowZero:true});
   const sale=el('salePkr');if(sale){sale.readOnly=true;sale.title='User A controls selling price';sale.required=false;
    const parent=sale.closest('label');if(parent)parent.textContent='User A selling price (PKR, read only)';
    if(parent&&!parent.contains(sale))parent.append(sale);
   }
   initialized=true;
  }
  if(el('customerSellingRate'))el('customerSellingRate').value=fx||'';
  if(el('usdRate'))el('usdRate').value=fx||'';
  if(el('salePkr'))el('salePkr').value=f.sale_pkr??'';
  controls.sale?.set(f.sale_pkr,fx,'USD');
  controls.earning?.set(order.customer_earning_pkr,fx,'USD');
  controls.making?.set(f.making_pkr,fx,'USD');
  controls.shipping?.set(f.shipping_pkr,fx,'USD');
 }
 function payload(kind){return controls[kind]?.payload()}
 function costs(){
  if(!controls.making||!controls.shipping)return null;
  return {making:payload('making'),shipping:payload('shipping'),fx_pkr_per_usd:el('usdRate').value};
 }
 window.FlyxjDashboardMoney={init,payload,costs,control:kind=>controls[kind]};
})();
