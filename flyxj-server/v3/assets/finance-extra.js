'use strict';
async function loadFinance(){
 if(!state.me)return;
 try{
  const data=await api('/api/finance');
  state.finance=data;renderFinance();
 }catch(e){toast(e.message,true)}
}
function renderFinance(){
 const f=state.finance;if(!f)return;
 const all=document.getElementById('financeScope')?.value!=='shipped';
 const totals=(all?f.all_totals:f.totals)||{};
 const selectedRows=(all?f.all_rows:f.rows)||[];
 const show=(id,value,currency)=>$(id).textContent=formatAmount(value||0,currency);
 show('fSalesPkr',totals.income_pkr);show('fSalesUsd',totals.income_usd,'USD');
 show('fCostPkr',totals.cost_pkr);show('fCostUsd',totals.cost_usd,'USD');
 show('fProfitPkr',totals.profit_pkr);show('fProfitUsd',totals.profit_usd,'USD');
 $('financeCount').textContent=all?(f.all_count||0)+' costed orders · '+(f.pending_count||0)+' estimated / not shipped':(f.count||0)+' shipped order(s) · recognised';
 $('financeDisclaimer').textContent=(all?'ESTIMATED TOTALS include orders not yet shipped. Do not treat them as realised profit. ':'Recognised orders only. ')+(f.disclaimer||'Gross profit excludes other expenses.');
 const tbody=$('financeRows');tbody.replaceChildren();
 if(!selectedRows.length){
  const tr=node('tr'),td=node('td','muted','No orders with User A net earning, making, shipping and FX figures yet.');td.colSpan=9;tr.append(td);tbody.append(tr);
 }
 for(const r of selectedRows){
  const tr=node('tr');tr.dataset.id=r.id;tr.className='finance-order-row';
  const first=node('td');first.append(node('b','',r.reference),node('div','tiny muted',r.title),node('div','tiny muted',r.recognised?'● Shipped · recognised':'◌ Not shipped · estimate'));
  const date=node('td','',day(r.date));
  const track=node('td');track.append(node('b','',r.courier||'—'),node('div','tiny muted',r.tracking_id||'—'));
  tr.append(first,date,track);
  for(const [p,u] of [['income_pkr','income_usd'],['making_pkr','making_usd'],['shipping_pkr','shipping_usd'],['cost_pkr','cost_usd'],['profit_pkr','profit_usd'],['cumulative_profit_pkr','cumulative_profit_usd']]){
   const td=node('td');td.append(node('b','',formatAmount(r[p])),node('div','tiny muted',formatAmount(r[u],'USD')));
   if(p==='profit_pkr'||p==='cumulative_profit_pkr')td.classList.add(r[p]<0?'negative-profit':'positive-profit');
   tr.append(td);
  }
  tr.onclick=()=>openDetail(r.id);
  tbody.append(tr);
 }
 $('periodWeek').classList.toggle('active',state.financePeriod==='weekly');
 $('periodMonth').classList.toggle('active',state.financePeriod==='monthly');
 drawFinanceChart(f[(all?'all_':'')+state.financePeriod]||[]);
}
function drawFinanceChart(periods){
 const host=$('profitChart');host.replaceChildren();
 if(!periods.length){host.append(node('p','muted','No chart data'));return}
 const ns='http://www.w3.org/2000/svg',width=850,height=320,left=69,right=22,top=24,bottom=58;
 const widthPlot=width-left-right,heightPlot=height-top-bottom;
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+width+' '+height);
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Weekly or monthly net earning, costs and real profit chart');
 svg.style.width='100%';svg.style.height='auto';
 const types=[{key:'income_pkr',color:'#4a6ec4',name:'Income'},{key:'making_pkr',color:'#dc9e42',name:'Making + shipping',other:'shipping_pkr'},
 {key:'profit_pkr',color:'#219972',name:'Gross profit'},{key:'cumulative_profit_pkr',color:'#845ec8',name:'Cumulative profit'}];
 const value=(point,type)=>Number(point[type.key]||0)+(type.other?Number(point[type.other]||0):0);
 const numbers=[0,...periods.flatMap(p=>types.map(t=>value(p,t)))];
 const maximum=Math.max(1,...numbers),minimum=Math.min(0,...numbers);
 const range=Math.max(1,maximum-minimum);
 const X=i=>left+(periods.length===1?widthPlot/2:(widthPlot*i)/(periods.length-1));
 const Y=n=>top+(maximum-n)*heightPlot/range;
 function svgEl(tag,attrs={},valueText){
  const el=document.createElementNS(ns,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  if(valueText!=null)el.textContent=valueText;
  svg.append(el);return el;
 }
 for(let t=0;t<=4;t++){
  const n=minimum+(range*t)/4,y=Y(n);
  svgEl('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#e8edf4','stroke-width':1});
  svgEl('text',{x:left-12,y:y+4,fill:'#8490a5','font-size':11,'text-anchor':'end'},Math.round(n).toLocaleString('en-US'));
 }
 for(let i=0;i<periods.length;i++){
  svgEl('text',{x:X(i),y:height-bottom+22,fill:'#758199','font-size':11,'text-anchor':'middle'},periods[i].label);
 }
 for(const type of types){
  const pts=periods.map((p,i)=>X(i).toFixed(1)+','+Y(value(p,type)).toFixed(1)).join(' ');
  svgEl('polyline',{points:pts,fill:'none',stroke:type.color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
  for(let i=0;i<periods.length;i++){
   const c=svgEl('circle',{cx:X(i),cy:Y(value(periods[i],type)),r:4,fill:type.color});
   const tip=document.createElementNS(ns,'title');
   tip.textContent=periods[i].label+' · '+type.name+': '+formatAmount(value(periods[i],type));
   c.append(tip);
  }
 }
 host.append(svg);
 const lbl=node('div','muted tiny',state.financePeriod==='weekly'?'Last 10 weeks · PKR':'Last 12 months · PKR');
 host.append(lbl);
}
