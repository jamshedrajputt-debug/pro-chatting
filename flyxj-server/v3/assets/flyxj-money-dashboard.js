'use strict';
/* Desktop dashboard USD / PKR inputs. Never change saved data until user saves form. */
(function(){
 let controls=null;
 function elem(id){return document.getElementById(id)}
 function init(order){
  if(!order||!window.FlyxjCurrency)return;
  if(!controls){
   controls={
    earning:FlyxjCurrency.connect(elem('customerEarningEdit'),elem('earningCurrency'),elem('earningRate'),elem('earningConverted')),
    making:FlyxjCurrency.connect(elem('makingPkr'),elem('makingCurrency'),elem('usdRate'),elem('staffCostsConverted')),
    shipping:FlyxjCurrency.connect(elem('shippingPkr'),elem('shippingCurrency'),elem('usdRate'),null)
   };
  }
  const finance=order.finance||{},fx=finance.fx_pkr_per_usd??null;
  elem('earningRate').value=fx??'';
  elem('usdRate').value=fx??'';
  controls.earning.load(order.customer_earning_pkr,fx);
  controls.making.load(finance.making_pkr,fx);
  controls.shipping.load(finance.shipping_pkr,fx);
 }
 function earning(){if(!controls)return null;return controls.earning.payload()}
 function costs(){
  if(!controls)return null;
  const making=controls.making.pkr(),shipping=controls.shipping.pkr();
  if(making===null||shipping===null)return null;
  return {making_pkr:making,shipping_pkr:shipping,fx_pkr_per_usd:elem('usdRate').value};
 }
 window.FlyxjDashboardMoney={init,earning,costs};
})();
