'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function randomPort(){
 return new Promise((resolve,reject)=>{
  const s=net.createServer();
  s.on('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))});
 });
}
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZJ2cAAAAASUVORK5CYII=';
const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64');
test('FLYXJ V3: authenticated PDF orders, approval, shipment, profit, chat, backups',async()=>{
 const port=await randomPort(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-v3-'));
 const env={...process.env,PORT:String(port),FLYXJ_DATA_DIR:directory,
  FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_CUSTOMER_PASSWORD:'TestingCustomerPass!123',
  FLYXJ_STAFF_USERNAME:'userb',FLYXJ_STAFF_PASSWORD:'TestingStaffPass!123'};
 const processServer=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env,stdio:['ignore','pipe','pipe']});
 let logs='';
 processServer.stdout.on('data',b=>logs+=String(b));
 processServer.stderr.on('data',b=>logs+=String(b));
 const base='http://127.0.0.1:'+port;
 async function api(route,session,method='GET',payload=null,extraHeaders={}){
  const headers={...extraHeaders};
  if(session){headers.cookie=session.cookie;if(!Object.prototype.hasOwnProperty.call(headers,'x-csrf-token'))headers['x-csrf-token']=session.csrf}
  if(payload!==null)headers['Content-Type']='application/json';
  return fetch(base+route,{method,headers,...(payload!==null?{body:JSON.stringify(payload)}:{})});
 }
 async function login(name,password){
  const response=await api('/api/login',null,'POST',{username:name,password});
  assert.equal(response.status,200,'login '+name+': '+await response.clone().text());
  const body=await response.json();
  return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:body.csrf};
 }
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   if(processServer.exitCode!==null)throw Error('Server crash: '+logs);
   try{const response=await api('/api/health');if(response.ok){ready=true;break}}catch{}
   await delay(150);
  }
  assert.ok(ready,'server started: '+logs);
  const health=await (await api('/api/health')).json();
  assert.equal(health.version,'3.0');
  assert.equal((await api('/api/orders')).status,401,'require login');
  const a=await login('usera','TestingCustomerPass!123');
  const b=await login('userb','TestingStaffPass!123');
  const baseOrder={title:'Custom leather dress',size:'M',colour:'Black',quantity:1,comments:'Made to size',
   images:[picture],measurements:{bust:'36 in',waist:'28 in'},expected_date:'2026-12-30',priority:'high'};
  assert.equal((await api('/api/orders',a,'POST',baseOrder)).status,400,'PDF required');
  assert.equal((await api('/api/orders',b,'POST',{...baseOrder,pdf})).status,403,'staff cannot submit');
  const newResponse=await api('/api/orders',a,'POST',{...baseOrder,pdf});
  assert.equal(newResponse.status,201,'create order: '+await newResponse.clone().text());
  const order=(await newResponse.json()).order;
  assert.equal(order.measurements.bust,'36 in');
  assert.ok(order.pdf_url);
  assert.equal((await api(order.pdf_url,a)).status,200,'customer can open own PDF');
  assert.equal((await api(order.pdf_url,b)).status,200,'staff can open PDF');
  assert.equal((await api(order.photos[0],a)).status,200,'customer photo');
  assert.equal((await api('/api/orders/'+order.id+'/status',a,'PATCH',{status:'shipped'})).status,403);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'shipped'})).status,400,'shipping needs prices and tracking');
  assert.equal((await api('/api/orders/'+order.id+'/finance',a,'PATCH',{sale_pkr:40000})).status,403);
  const approveRequest=await api('/api/orders/'+order.id+'/request-approval',b,'POST',{note:'Please approve design'});
  assert.equal(approveRequest.status,200);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'cutting'})).status,400,'approval required');
  assert.equal((await api('/api/orders/'+order.id+'/approve',a,'POST',{decision:'approved'})).status,200);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'cutting'})).status,200);
  const finance={sale_pkr:40000,making_pkr:22000,shipping_pkr:3000,fx_pkr_per_usd:300};
  const shipment=await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'shipped',
   shipping:{courier:'DHL',tracking_id:'AB12345678',tracking_url:'https://www.dhl.com/'},finance});
  assert.equal(shipment.status,200,'ship with full details: '+await shipment.clone().text());
  const customerOrder=(await (await api('/api/orders/'+order.id,a)).json()).order;
  assert.equal(customerOrder.shipping.tracking_id,'AB12345678');
  assert.equal(customerOrder.shipping.courier,'DHL');
  assert.equal(customerOrder.finance.sale_pkr,40000);
  const report=(await (await api('/api/finance',a)).json());
  assert.equal(report.count,1);
  assert.equal(report.totals.sale_pkr,40000);
  assert.equal(report.totals.making_pkr,22000);
  assert.equal(report.totals.shipping_pkr,3000);
  assert.equal(report.totals.cost_pkr,25000);
  assert.equal(report.totals.profit_pkr,15000);
  assert.equal(report.rows[0].profit_usd,50);
  assert.ok(report.weekly.length===10&&report.monthly.length===12);
  assert.equal((await api('/api/finance.csv',a)).status,200);
  const summary=await api('/api/orders/'+order.id+'/summary.pdf',a);
  assert.equal(summary.status,200,'summary pdf');
  assert.match((await summary.text()).slice(0,10),/^%PDF/);
  const c1=await api('/api/chat',a,'POST',{message:'Is the parcel on its way?'});
  assert.equal(c1.status,201);
  const c2=await api('/api/chat',b,'POST',{message:'Yes, DHL tracking is on your order'});
  assert.equal(c2.status,201);
  const chat=(await (await api('/api/chat',a)).json()).messages;
  assert.equal(chat.length,2);
  assert.equal((await api('/api/chat/read',a,'POST',{})).status,200);
  assert.equal((await api('/api/chat',null)).status,401);
  const finished=await api('/api/orders/'+order.id+'/finished',b,'POST',{photo:picture});
  assert.equal(finished.status,200);
  assert.equal((await api('/api/orders/'+order.id+'/finished/0',a)).status,200);
  assert.equal((await api('/api/backup.json',a)).status,403,'only staff can export all data');
  const backup=(await (await api('/api/backup.json',b)).json());
  assert.equal(backup.format,'flyxj-backup-v3');
  assert.equal(backup.orders.length,1);
  const addedStaff=await api('/api/staff',b,'POST',{username:'cuttingteam',password:'NewStaffStrongPassword!223'});
  assert.equal(addedStaff.status,201);
  const third=await login('cuttingteam','NewStaffStrongPassword!223');
  assert.equal((await api('/api/finance',third)).status,200);
  assert.equal((await api('/api/orders',third)).status,200);
  assert.equal((await api('/api/orders',a,'POST',{...baseOrder,pdf},{'x-csrf-token':'wrong'})).status,403);
 }finally{
  processServer.kill('SIGTERM');
  await delay(200);
  fs.rmSync(directory,{recursive:true,force:true});
 }
});