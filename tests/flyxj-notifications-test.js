'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {spawn}=require('node:child_process');
const folder=path.join(__dirname,'../flyxj-server/v3');
for(const x of ['server.js','assets/app.js','assets/two-way-notifications.js','assets/v8-experience.js'])
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(folder,x),'utf8'),{filename:x}));
const pro=fs.readFileSync(path.join(folder,'assets/v13-command-center.js'),'utf8');
assert.doesNotThrow(()=>new vm.Script(pro,{filename:'v13-command-center.js'}));
assert.match(pro,/onNotifications/,'dashboard receives missed alerts');
assert.match(pro,/Enable alerts/,'Android or web notification permission control exists');
const notifyClient=fs.readFileSync(path.join(folder,'assets/two-way-notifications.js'),'utf8');
assert.match(notifyClient,/if\(!old\)/,'first login surfaces recent updates');
assert.match(notifyClient,/window\.FlyxjPro\?\.onNotifications/,'missed updates reach dashboard');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
assert.match(html,/two-way-notifications\.js/);
assert.match(html,/v13-command-center\.js/);
assert.match(html,/v13-command-center\.css/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-alert-test-'));
const now=new Date().toISOString(),id='b7a7f234-bb11-4d34-a878-124abfc82200';
const orders=[{id:1,reference:'FXJ-TEST-000001',title:'Test Jacket',size:'M',colour:'Black',quantity:1,
 customer:'usera',ordered_by:'usera',status:'shipped',created_at:now,updated_at:now,
 history:[{id,at:now,by:'usera',kind:'created',label:'Order submitted'},
 {id:'f756ba4e-4b22-4973-8ff8-f06a7c0def02',at:now,by:'userb',kind:'shipping',label:'Tracking changed'},
 {id:'45a0921c-f498-4c6e-9bdd-bfcbd54210b2',at:now,by:'userb',kind:'status',label:'Status changed'},
 {id:'c394bd63-f37e-4f32-a498-33ad144199e6',at:now,by:'userb',kind:'message',label:'Staff sent a message'}],
 image_files:[],messages:[],shipping:{courier:'DHL',tracking_id:'TEST'},finance:{making_pkr:10,shipping_pkr:5,fx_pkr_per_usd:270},
 approval:{status:'approved'}}];
fs.writeFileSync(path.join(temp,'orders.json'),JSON.stringify(orders));
const chat=[{id:'7e5c59e0-1d28-4054-90ec-4f3cc77d44b5',from:'userb',to:'usera',at:now,body:'Tracking is ready',seen_by:['userb']}];
fs.writeFileSync(path.join(temp,'direct-chat.json'),JSON.stringify(chat));
const port=18943,base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['flyxj-server/v3/server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,
 PORT:String(port),FLYXJ_DATA_DIR:temp,FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',
 FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_STAFF_USERNAME:'userb',
 FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',FLYXJ_STAFF_PASSWORD:'staff-test-password-12345'},
 stdio:['ignore','pipe','pipe']});
async function login(user,password){
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password})});
 assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];
}
async function run(){
 for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'/api/notifications')).status,401,'anonymous denied');
 const a=await login('usera','customer-test-password-12345'),b=await login('userb','staff-test-password-12345');
 const get=async cookie=>(await (await fetch(base+'/api/notifications',{headers:{cookie}})).json()).notifications;
 const aa=await get(a),bb=await get(b);
 assert.equal(aa.length,4,'customer receives staff order changes and staff direct chat');
 assert.equal(bb.length,1,'staff receives customer new order, not own actions or other chat');
 assert.equal(bb[0].type,'created');
 assert.equal(aa.filter(x=>x.type==='shipping').length,1);
 assert.equal(aa.filter(x=>x.type==='status').length,1);
 assert.equal(aa.filter(x=>x.type==='chat').length,1);
 assert(aa.every(x=>!x.body.includes('password')),'no private auth info');
 assert(aa.every(x=>x.url==='/chat'||x.url==='/order/1'),'trusted app links only');
 console.log('PASS private User A/B alerts, new orders, messages, shipping, status, no self-notification, no anonymous access');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{child.kill();fs.rmSync(temp,{recursive:true,force:true})});
