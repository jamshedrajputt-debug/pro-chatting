'use strict';
/* FLYXJ shared money controls: canonical PKR, per-order explicit FX, USD/PKR user choice. */
(function(){
 const fmt=n=>Number(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const rateOf=order=>Number(order?.finance?.fx_pkr_per_usd)||0;
 function create(input,initialPkr,rateInput,options={}){
   if(!input)return null;
   input.step='0.01';input.inputMode='decimal';input.min=options.allowZero?'0':'0.01';
   const wrap=document.createElement('div');wrap.className='fx9-money-field';input.parentNode.insertBefore(wrap,input);wrap.append(input);
   const select=document.createElement('select');select.className='fx9-money-currency';select.setAttribute('aria-label','Choose USD or PKR');
   for(const c of ['USD','PKR']){const o=document.createElement('option');o.value=c;o.textContent=c;select.append(o)}
   wrap.append(select);
   const preview=document.createElement('small');preview.className='fx9-money-preview';wrap.append(preview);
   let currentRate=Number(rateInput?.value)||0;
   function rate(){return Number(rateInput?.value)||currentRate||0}
   function displayPkr(v){
     const fx=rate();return select.value==='USD'?(fx>0?String(round(v/fx)):''):String(round(v))
   }
   function update(){
     const amount=Number(input.value),fx=rate();
     if(input.value===''||!Number.isFinite(amount)||amount<0||!Number.isFinite(fx)||fx<=0){
       preview.textContent='Enter the order PKR/USD exchange rate to see both currencies.';return
     }
     const pkr=select.value==='USD'?round(amount*fx):round(amount);
     const usd=select.value==='USD'?round(amount):round(amount/fx);
     preview.textContent='USD $'+fmt(usd)+'  =  PKR '+fmt(pkr)+' · Rate '+fmt(fx);
   }
   function set(pkr,fx,preferred){
     currentRate=Number(fx)||currentRate;
     const currency=preferred||select.value;
     select.value=currency;
     input.value=pkr===null||pkr===undefined||pkr===''?'':displayPkr(Number(pkr));
     update()
   }
   select.value=options.defaultCurrency||'USD';
   let valueBeforeSwitch=null;
   select.addEventListener('focus',()=>{valueBeforeSwitch=select.value});
   select.addEventListener('change',()=>{
     const fx=rate(),value=input.value===''?null:Number(input.value);
     if(value!==null&&Number.isFinite(value)&&fx>0){
       const old=valueBeforeSwitch|| (select.value==='USD'?'PKR':'USD');
       const pkr=old==='USD'?round(value*fx):value;
       input.value=displayPkr(pkr);
     }
     valueBeforeSwitch=select.value;update();
   });
   input.addEventListener('input',update);
   if(rateInput)rateInput.addEventListener('input',()=>{
     currentRate=Number(rateInput.value)||currentRate;
     update()
   });
   set(initialPkr,rate(),options.defaultCurrency||'USD');
   return {input,select,preview,rate,set,update,
     payload(){return {amount:input.value,currency:select.value,fx_pkr_per_usd:String(rate())}},
     pkr(){const n=Number(input.value),fx=rate();return input.value===''||fx<=0?null:round(select.value==='USD'?n*fx:n)}
   };
 }
 window.FlyxjMoney={create,rateOf,fmt,round};
})();
