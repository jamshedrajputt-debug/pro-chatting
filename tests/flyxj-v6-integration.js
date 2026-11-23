'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const base='http://127.0.0.1:18765';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-v6-test-'));
const first=new Date('2026-11-01T12:00:00Z').toISOString();
const orders=[{id:1,reference:'FXJ-TEST-0001',title:'Test leather jacket',colour:'Black',size:'M',quantity:1,priority:'urgent',expected_date:'2026-11-10',status:'pending',customer:'usera',ordered_by:'usera',created_at:first,updated_at:first,image_files:[],messages:[],history:[],shipping:{},finance:{},approval:{status:'not_requested'},assigned_to:''}];
fs.writeFileSync(path.join(dir,'orders.json'),JSON.stringify(orders));
const proc=spawn(process.execPath,['flyxj-server/v3/server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'18765',FLYXJ_DATA_DIR:dir,FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',FLYXJ_STAFF_USERNAME:'userb',FLYXJ_STAFF_PASSWORD:'staff-test-password-12345',WHATSAPP_ACCESS_TOKEN:'',META_WHATSAPP_TOKEN:''},stdio:['ignore','pipe','pipe']});
let logs='';proc.stdout.on('data',c=>logs+=c.toString());proc.stderr.on('data',c=>logs+=c.toString());
async function req(p,session,options={}){
 const headers={...(options.headers||{})};if(session){headers.cookie=session.cookie;if(options.body)headers['x-csrf-token']=session.csrf}
 if(options.body)headers['content-type']='application/json';
 const r=await fetch(base+p,{...options,headers});let data;try{data=await r.json()}catch{data=null};return {status:r.status,data,headers:r.headers};
}
async function login(username,password){
 const res=await req('/api/login',null,{method:'POST',body:JSON.stringify({username,password})});
 assert.equal(res.status,200,'login '+username);
 return {cookie:res.headers.get('set-cookie').split(';')[0],csrf:res.data.csrf};
}
async function run(){
 let ready=false;
 for(let i=0;i<120;i++){
  if(proc.exitCode!==null)throw Error('server exited: '+logs);
  try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'test server started');
 const customer=await login('usera','customer-test-password-12345');
 const owner=await login('userb','staff-test-password-12345');
 const ownerStaff=await req('/api/staff',owner);assert.equal(ownerStaff.status,200);assert.equal(ownerStaff.data.can_manage,true);
 const created=await req('/api/staff',owner,{method:'POST',body:JSON.stringify({username:'maker',password:'maker-test-password-12345'})});
 assert.equal(created.status,201,'create additional staff');
 const maker=await login('maker','maker-test-password-12345');
 assert.equal((await req('/api/staff',maker)).data.can_manage,false);
 for(const [route,options] of [['/api/backup.json',{}],['/api/restore',{method:'POST',body:JSON.stringify({})}],['/api/staff',{method:'POST',body:JSON.stringify({username:'extra',password:'test-password-123456'})}]]){
  const r=await req(route,maker,options);assert.equal(r.status,403,'nonowner permission '+route);
 }
 assert.equal((await req('/api/orders/1/summary.pdf',customer)).status,403,'financial PDF should be staff only');
 assert.equal((await req('/api/orders/1/assign',customer,{method:'PATCH',body:JSON.stringify({assigned_to:'maker',updated_at:first})})).status,403,'customer cannot assign');
 const bad=await req('/api/orders/1/assign',maker,{method:'PATCH',body:JSON.stringify({assigned_to:'nonexistent',updated_at:first})});
 assert.equal(bad.status,400,'unknown staff rejected');
 const ok=await req('/api/orders/1/assign',maker,{method:'PATCH',body:JSON.stringify({assigned_to:'maker',updated_at:first})});
 assert.equal(ok.status,200,'staff assignment succeeds');assert.equal(ok.data.order.assigned_to,'maker');
 const conflict=await req('/api/orders/1/assign',owner,{method:'PATCH',body:JSON.stringify({assigned_to:'userb',updated_at:first})});
 assert.equal(conflict.status,409,'concurrent order assignment conflict prevents data loss');
 const active=await req('/api/orders',owner);assert.equal(active.data.orders[0].assigned_to,'maker');
 const metrics=await req('/api/operations',owner);assert.equal(metrics.status,200);assert.equal(metrics.data.active,1);assert.equal(metrics.data.unassigned,0);
 const visibility=await req('/api/operations',customer);assert.equal(visibility.status,200);assert.equal(visibility.data.unassigned,null);
 assert.equal((await req('/api/backup.json',owner)).status,200,'owner backup retained');
 const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/v6-professional\.js/);
 console.log('PASS integration: login, owner permissions, private backup, safe staff assignment, optimistic concurrency, metrics, website');
}
run().then(()=>{proc.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})}).catch(e=>{console.error('INTEGRATION FAILED',e,logs.slice(-1800));proc.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});process.exitCode=1});
