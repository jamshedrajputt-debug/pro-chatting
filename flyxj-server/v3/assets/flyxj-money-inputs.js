'use strict';
/* Explicit per-order USD / PKR conversion. Historical PKR values remain canonical. */
(function(){
 const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const formatted=n=>Number(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
 function connect(amount,unit,rate,caption){
  if(!amount||!unit||!rate)throw Error('Currency fields missing');
  let previous=unit.value;
  const currentRate=()=>Number(rate.value);
  function pkr(){
   const n=Number(amount.value),r=currentRate();
   if(amount.value===''||!Number.isFinite(n)||n<0||!Number.isFinite(r)||r<=0)return null;
   return round(unit.value==='USD'?n*r:n);
  }
  function preview(){
   const p=pkr(),r=currentRate();
   if(caption)caption.textContent=p===null?'Enter amount and order PKR/USD exchange rate':
    'USD $'+formatted(p/r)+' = PKR '+formatted(p)+' · Rate '+formatted(r);
   return p;
  }
  unit.addEventListener('change',()=>{
   const old=previous,oldAmount=amount.value===''?null:Number(amount.value),r=currentRate();
   if(oldAmount!==null&&Number.isFinite(oldAmount)&&r>0){
    const basis=old==='USD'?oldAmount*r:oldAmount;
    amount.value=String(round(unit.value==='USD'?basis/r:basis));
   }
   previous=unit.value;
   preview();
  });
  amount.addEventListener('input',preview);
  rate.addEventListener('input',preview);
  function load(amountPkr,rateValue){
   if(rateValue!=null&&Number(rateValue)>0)rate.value=rateValue;
   if(amountPkr===null||amountPkr===undefined||amountPkr===''){
    amount.value='';unit.value='USD';
   }else{
    amount.value=String(round(amountPkr));unit.value='PKR';
   }
   previous=unit.value;preview();
  }
  return {pkr,preview,load,payload:()=>({amount:amount.value,currency:unit.value,fx_pkr_per_usd:rate.value})};
 }
 window.FlyxjCurrency={connect,round,formatted};
})();
