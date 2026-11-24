'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-dual-money-'));
const port=18902,base='http://127.0.0.1:'+port,first='2026-11-01T12:00:00.000Z';
const existing={id:1,reference:'FLYXJ-HISTORIC-1',title:'Existing jacket',customer:'usera',ordered_by:'usera',
 quantity:3,colour:'Black',size:'M',priority:'normal',created_at:first,updated_at:first,status:'pending',
 image_files:[],history:[],messages:[],shipping:{},finance:{sale_pkr:null,making_pkr:null,shipping_pkr:null,fx_pkr_per_usd:null},
 approval:{status:'approved'}};
fs.writeFileSync(path.join(dir,'orders.json'),JSON.stringify([existing]));
const proc=spawn(process.execPath,['flyxj-server/v3/server.js'],{cwd:path.join(__dirname,'..'),
 env:{...process.env,PORT:String(port),FLYXJ_DATA_DIR:dir,FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',
 FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',
 FLYXJ_STAFF_USERNAME:'userb',FLYXJ_STAFF_PASSWORD:'staff-test-password-12345',
 WHATSAPP_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
let log='';proc.stdout.on('data',b=>log+=b);proc.stderr.on('data',b=>log+=b);
async function call(uri,session,method='GET',body){
 const h={};if(session)h.cookie=session.cookie;
 if(body){h['content-type']='application/json';h['x-csrf-token']=session.csrf}
 const r=await fetch(base+uri,{method,headers:h,body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json().catch(()=>null)};
}
async function login(name,password){
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:name,password})});
 assert.equal(r.status,200,'login '+name);
 return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};
}
async function test(){
 let online=false;for(let i=0;i<150;i++){try{const r=await fetch(base+'/api/health');if(r.ok){online=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.ok(online,'local server ready');
 const A=await login('usera','customer-test-password-12345'),B=await login('userb','staff-test-password-12345');
 assert.equal((await call('/api/orders/1/production-costs',A,'PATCH',{making:{amount:30,currency:'USD',fx_pkr_per_usd:280},shipping:{amount:1400,currency:'PKR',fx_pkr_per_usd:280}})).status,403);
 assert.equal((await call('/api/orders/1/selling-price',B,'PATCH',{amount:100,currency:'USD',fx_pkr_per_usd:280})).status,403);
 let r=await call('/api/orders/1/selling-price',A,'PATCH',{amount:'100.00',currency:'USD',fx_pkr_per_usd:'280'});
 assert.equal(r.status,200,'User A saves historical order selling price in USD');assert.equal(r.data.order.finance.sale_pkr,28000);
 r=await call('/api/orders/1/customer-earning',A,'PATCH',{amount:'20',currency:'USD',fx_pkr_per_usd:'280'});
 assert.equal(r.status,200,'USD earning saved');assert.equal(r.data.order.customer_earning_pkr,5600);
 r=await call('/api/orders/1/production-costs',B,'PATCH',{
  making:{amount:'30',currency:'USD',fx_pkr_per_usd:'280'},shipping:{amount:'1400',currency:'PKR',fx_pkr_per_usd:'280'}
 });
 assert.equal(r.status,200,'staff mixed USD PKR costs saved');
 assert.equal(r.data.order.finance.making_pkr,8400);assert.equal(r.data.order.finance.shipping_pkr,1400);
 r=await call('/api/finance',A);
 assert.equal(r.status,200);assert.equal(r.data.count,0);assert.equal(r.data.all_count,1);
 assert.equal(r.data.all_totals.profit_pkr,12600,'canonical PKR profit correct');
 assert.equal(r.data.all_rows[0].profit_usd,45,'USD profit at historical rate correct');
 assert.equal((await call('/api/finance',B)).data.all_totals.profit_pkr,12600,'both users identical estimates');
 r=await call('/api/orders/1/selling-price',A,'PATCH',{amount:'30000',currency:'PKR',fx_pkr_per_usd:'280'});
 assert.equal(r.status,200,'PKR input selectable');assert.equal(r.data.order.finance.sale_pkr,30000);
 assert.equal((await call('/api/finance',B)).data.all_totals.profit_pkr,14600,'graph recalculates after selling update');
 assert.equal((await call('/api/orders/1/production-costs',B,'PATCH',{
 making:{amount:30,currency:'USD',fx_pkr_per_usd:300},shipping:{amount:1400,currency:'PKR',fx_pkr_per_usd:300}})).status,400,'prevent mismatch with saved historical FX');
 r=await call('/api/orders/1/shipping',B,'PATCH',{courier:'DHL',tracking_id:'DHL123',shipped_quantity:3});assert.equal(r.status,200);
 r=await call('/api/orders/1/status',B,'PATCH',{status:'shipped',shipped_quantity:3});assert.equal(r.status,200);
 r=await call('/api/finance',A);assert.equal(r.data.count,1);assert.equal(r.data.totals.profit_pkr,14600);
 assert.equal(r.data.rows[0].profit_usd,52.14);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'orders.json'),'utf8'));assert.equal(saved[0].finance.sale_pkr,30000);
 assert.equal(saved[0].customer_earning_pkr,5600);assert.equal(saved[0].finance.making_pkr,8400);
 const order=await fetch(base+'/order/1'),html=await order.text();assert.match(html,/fx9-money\.js/);
 assert.match(html,/fx9SaleForm/);assert.match(html,/fx9FinanceForm/);
 const page=await fetch(base+'/');assert.match(await page.text(),/fx9-dashboard-money\.js/);
 console.log('PASS historic order: USD or PKR selectable for User A sale and earning, User B mixed costs, accurate dual-currency profit graphs, role permissions and persistence');
}
test().catch(e=>{console.error('FAILED',e,log.slice(-1700));process.exitCode=1}).finally(()=>{proc.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})});
