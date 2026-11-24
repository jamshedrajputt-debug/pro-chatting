'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'../flyxj-server/v3');
for(const file of ['server.js','assets/order-extra.js','assets/mobile-staff-controls.js','assets/finance-extra.js'])
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}));
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-profit-rule-'));
const original={id:1,title:'Existing user jacket',size:'M',colour:'Black',quantity:1,customer:'usera',ordered_by:'usera',
 created_at:'2026-11-01T10:00:00Z',updated_at:'2026-11-01T10:00:00Z',status:'shipped',
 shipping:{courier:'DHL',tracking_id:'DH-OLD'},shipped_quantity:1,image_files:[],messages:[],history:[],
 approval:{status:'approved'},customer_earning_pkr:60000,
 finance:{sale_pkr:60000,making_pkr:30000,shipping_pkr:15000,fx_pkr_per_usd:270,recognized_at:'2026-11-01T10:00:00Z'}};
fs.writeFileSync(path.join(dataDir,'orders.json'),JSON.stringify([original]));
const port=18977,base='http://127.0.0.1:'+port;
const proc=spawn(process.execPath,['flyxj-server/v3/server.js'],{
 cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),FLYXJ_DATA_DIR:dataDir,
 FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',FLYXJ_CUSTOMER_USERNAME:'usera',
 FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',FLYXJ_STAFF_USERNAME:'userb',
 FLYXJ_STAFF_PASSWORD:'staff-test-password-12345',WHATSAPP_ACCESS_TOKEN:''},
 stdio:['ignore','pipe','pipe']
});
let logs='';proc.stderr.on('data',b=>logs+=b.toString());
async function signin(user,pwd){
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({username:user,password:pwd})});
 assert.equal(r.status,200);const json=await r.json();
 return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:json.csrf};
}
async function req(p,s,method='GET',body){
 const headers={};if(s)headers.cookie=s.cookie;
 if(body){headers['content-type']='application/json';headers['x-csrf-token']=s.csrf}
 const r=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json().catch(()=>({}))}
}
async function run(){
 let healthy=false;
 for(let i=0;i<130;i++){try{if((await fetch(base+'/api/health')).ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.ok(healthy,'server startup');
 const a=await signin('usera','customer-test-password-12345');
 const b=await signin('userb','staff-test-password-12345');
 for(const who of [a,b]){
  const report=await req('/api/finance',who);
  assert.equal(report.status,200);
  assert.equal(report.data.count,1);
  assert.equal(report.data.rows[0].sale_pkr,60000);
  assert.equal(report.data.rows[0].income_pkr,60000);
  assert.equal(report.data.rows[0].cost_pkr,45000);
  assert.equal(report.data.rows[0].profit_pkr,15000);
  assert.equal(report.data.rows[0].profit_usd,55.56);
  assert.equal(report.data.totals.profit_pkr,15000);
  assert.equal(report.data.all_totals.profit_pkr,15000);
  assert.equal(report.data.totals.cost_pkr,45000);
 }
 let r=await req('/api/orders/1/customer-earning',a,'PATCH',{customer_earning_pkr:50000});
 assert.equal(r.status,200);
 r=await req('/api/finance',b);
 assert.equal(r.data.rows[0].profit_pkr,5000,'Earning minus only production and shipping');
 assert.equal(r.data.rows[0].income_pkr,50000);
 r=await req('/api/orders/1/customer-earning',a,'PATCH',{amount:'200',currency:'USD',fx_pkr_per_usd:'270'});
 assert.equal(r.status,200,'User A can enter net Etsy earnings in USD');
 assert.equal(r.data.order.customer_earning_pkr,54000,'USD converted to PKR using saved order rate');
 assert.equal((await req('/api/finance',b)).data.all_totals.profit_pkr,9000,'graph updates from USD earning');
 r=await req('/api/orders/1/customer-earning',a,'PATCH',{amount:'200',currency:'USD',fx_pkr_per_usd:'290'});
 assert.equal(r.status,400,'prevent conflicting order FX rate');
 const stored=JSON.parse(fs.readFileSync(path.join(dataDir,'orders.json'),'utf8'));
 assert.equal(stored[0].finance.sale_pkr,60000,'selling price preserved');
 assert.equal(stored[0].finance.making_pkr,30000,'making preserved');
 assert.equal(stored[0].finance.shipping_pkr,15000,'shipping preserved');
 assert.equal(stored[0].customer_earning_pkr,54000,'USD earning converted safely');
 console.log('PASS: Etsy net 60000 - making 30000 - shipping 15000 = real profit 15000; both graphs, USD conversion and rate validation work');
}
run().catch(e=>{console.error(e,logs.slice(-1100));process.exitCode=1}).finally(()=>{proc.kill();fs.rmSync(dataDir,{recursive:true,force:true})});
