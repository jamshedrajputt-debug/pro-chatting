'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const port=18837,base='http://127.0.0.1:'+port;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-mobile-control-'));
const first='2026-11-01T12:00:00.000Z';
fs.writeFileSync(path.join(dir,'orders.json'),JSON.stringify([
 {id:1,title:'Black leather jacket',colour:'Black',size:'M',quantity:5,customer_earning_pkr:500,
  status:'pending',customer:'usera',ordered_by:'usera',created_at:first,updated_at:first,image_files:[],
  messages:[],history:[],shipping:{courier:'',tracking_id:''},finance:{sale_pkr:null,making_pkr:null,shipping_pkr:null,fx_pkr_per_usd:null},approval:{status:'approved'}}
]));
const child=spawn(process.execPath,['flyxj-server/v3/server.js'],{
 cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),FLYXJ_DATA_DIR:dir,FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',
 FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',
 FLYXJ_STAFF_USERNAME:'userb',FLYXJ_STAFF_PASSWORD:'staff-test-password-12345',WHATSAPP_ACCESS_TOKEN:''},
 stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr+=b.toString());
async function req(p,s,method='GET',body){
 const headers={};if(s){headers.cookie=s.cookie;if(body)headers['x-csrf-token']=s.csrf}
 if(body)headers['content-type']='application/json';
 const res=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined});
 const data=await res.json().catch(()=>null);
 return {status:res.status,data};
}
async function login(user,pass){
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:pass})});
 assert.equal(res.status,200);const d=await res.json();
 return {cookie:res.headers.get('set-cookie').split(';')[0],csrf:d.csrf};
}
async function run(){
 let ready=false;
 for(let i=0;i<120;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.ok(ready,'server started');
 const a=await login('usera','customer-test-password-12345'),b=await login('userb','staff-test-password-12345');
 const denied=await req('/api/orders/1/shipping',a,'PATCH',{courier:'DHL',tracking_id:'123',shipped_quantity:2});
 assert.equal(denied.status,403,'User A cannot edit shipping');
 assert.equal((await req('/api/orders/1/finance',a,'PATCH',{sale_pkr:12000,making_pkr:5000,shipping_pkr:700,fx_pkr_per_usd:270})).status,403);
 assert.equal((await req('/api/orders/1/customer-earning',b,'PATCH',{customer_earning_pkr:200})).status,403);
 let r=await req('/api/orders/1/shipping',b,'PATCH',{courier:'DHL',tracking_id:'DHL-2026-123',tracking_url:'https://www.dhl.com/',shipped_quantity:2});
 assert.equal(r.status,200,'User B can save courier+ID and partial shipped quantity');assert.equal(r.data.order.shipped_quantity,2);
 assert.equal((await req('/api/orders/1/shipping',b,'PATCH',{courier:'DHL',tracking_id:'123',shipped_quantity:6})).status,400,'cannot ship more than ordered');
 r=await req('/api/orders/1/finance',b,'PATCH',{sale_pkr:12000,making_pkr:5000,shipping_pkr:700,fx_pkr_per_usd:270});
 assert.equal(r.status,200,'User B can save making+shipping cost');assert.equal(r.data.order.finance.making_pkr,5000);
 const pendingFinance=await req('/api/finance',a);
 assert.equal(pendingFinance.status,200);
 assert.equal(pendingFinance.data.count,0,'pending order not counted as realised');
 assert.equal(pendingFinance.data.all_count,1,'existing pending order appears in projected graph after User B saves prices');
 assert.equal(pendingFinance.data.pending_count,1);
 assert.equal(pendingFinance.data.all_rows[0].recognised,false);
 assert.equal(pendingFinance.data.all_totals.profit_pkr,5800);
 assert.equal(pendingFinance.data.totals.profit_pkr,0,'actual profit remains zero until shipped');
 r=await req('/api/orders/1/status',b,'PATCH',{status:'shipped',staff_note:'Two pieces sent',shipped_quantity:2});
 assert.equal(r.status,200,'User B may mark shipped after storing shipping and finance');assert.equal(r.data.order.shipped_quantity,2);
 r=await req('/api/dashboard',a);
 assert.equal(r.status,200);assert.equal(r.data.stats.shipped,1);assert.equal(r.data.stats.shipped_units,2);
 r=await req('/api/orders/1',a);assert.equal(r.data.order.shipping.tracking_id,'DHL-2026-123');assert.equal(r.data.order.shipped_quantity,2);
 r=await req('/api/orders/1/customer-earning',a,'PATCH',{customer_earning_pkr:750});
 assert.equal(r.status,200);assert.equal(r.data.order.customer_earning_pkr,750);
 const finances=await req('/api/finance',a);assert.equal(finances.status,200);assert.equal(finances.data.rows[0].profit_pkr,5550);
 const staffFinances=await req('/api/finance',b);assert.equal(staffFinances.data.rows[0].profit_pkr,5550,'both accounts see the same finance result');
 assert.equal(staffFinances.data.all_count,1,'shipped order stays in all priced graph');
 assert.equal(staffFinances.data.all_rows[0].recognised,true);
 assert.equal(staffFinances.data.all_totals.profit_pkr,5550,'both graph scopes reflect User A earning edit');
 assert.equal(finances.data.all_totals.profit_pkr,5550,'User A and B see consistent report');

 const sheet=await fetch(base+'/order/1');assert.equal(sheet.status,200);const html=await sheet.text();assert.match(html,/fx9ShipForm/);assert.match(html,/fx9FinanceForm/);assert.match(html,/fx9EarningForm/);
 const script=await fetch(base+'/assets/mobile-staff-controls.js');assert.equal(script.status,200);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'orders.json'),'utf8'));assert.equal(saved[0].shipped_quantity,2);assert.equal(saved[0].finance.making_pkr,5000);
 console.log('PASS: staff shipping ID, shipped quantity, making cost, same profit graphs, customer earning, safe persistent orders, mobile form route');
}
run().catch(e=>{console.error(e,stderr.slice(-900));process.exitCode=1}).finally(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});
