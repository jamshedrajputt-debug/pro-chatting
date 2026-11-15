// FlyXJ Order Manager — free-tier prototype.
// WARNING: Render free filesystem is ephemeral. Orders and photos may disappear on restarts.
'use strict';
const express=require('express');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'6mb'}));
const dataDir=process.env.FLYXJ_DATA_DIR || path.join(__dirname,'data');
fs.mkdirSync(dataDir,{recursive:true});
const file=path.join(dataDir,'orders.json');
let orders=[];
try { orders=JSON.parse(fs.readFileSync(file,'utf8')); if(!Array.isArray(orders))orders=[]; } catch(e) {}
const sessions=new Map();
const U=[{name:process.env.FLYXJ_CUSTOMER_USERNAME||'usera',pass:process.env.FLYXJ_CUSTOMER_PASSWORD||'',role:'customer'},{name:process.env.FLYXJ_STAFF_USERNAME||'userb',pass:process.env.FLYXJ_STAFF_PASSWORD||'',role:'staff'}];
if(U.some(u=>u.pass.length<12)||U[0].name===U[1].name) {console.error('Set separate FLYXJ_CUSTOMER_PASSWORD and FLYXJ_STAFF_PASSWORD (12+ characters)'); process.exit(1);}
function save(){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(orders));fs.renameSync(temp,file);}
function fail(res,status,msg){return res.status(status).json({detail:msg});}
function getSession(req){const match=/(?:^|;\s*)flyxj_session=([^;]+)/.exec(req.headers.cookie||'');if(!match)return null;const t=match[1],s=sessions.get(t);if(!s||s.until<Date.now()){sessions.delete(t);return null;}return {s,t};}
function auth(req,res,next){const item=getSession(req);if(!item)return fail(res,401,'Please log in');req.user=item.s;req.sessionToken=item.t;next();}
function csrf(req,res,next){if(req.get('x-csrf-token')!==req.user.csrf)return fail(res,403,'Invalid security token');next();}
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.set('X-Frame-Options','DENY');if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');next();});
app.get('/api/health',(req,res)=>res.json({ok:true,storage:'ephemeral'}));
app.post('/api/login',(req,res)=>{
 const {username,password}=req.body||{};
 if(typeof username!=='string'||typeof password!=='string')return fail(res,400,'Username and password required');
 const user=U.find(u=>u.name.toLowerCase()===username.trim().toLowerCase());
 const candidate=crypto.scryptSync(password,'flyxj-credential-check',32);
 const expected=crypto.scryptSync(user?user.pass:'invalid-password-value','flyxj-credential-check',32);
 if(!user||!crypto.timingSafeEqual(candidate,expected))return fail(res,401,'Incorrect username or password');
 const token=crypto.randomBytes(32).toString('hex'),csrfValue=crypto.randomBytes(24).toString('hex');
 const s={name:user.name,role:user.role,csrf:csrfValue,until:Date.now()+30*86400000};
 sessions.set(token,s);
 res.set('Set-Cookie','flyxj_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
 res.json({username:s.name,role:s.role,csrf:s.csrf});
});
app.get('/api/me',auth,(req,res)=>res.json({username:req.user.name,role:req.user.role,csrf:req.user.csrf}));
app.post('/api/logout',auth,csrf,(req,res)=>{sessions.delete(req.sessionToken);res.set('Set-Cookie','flyxj_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');res.json({ok:true});});
function visibleOrder(o){const {image,...rest}=o;return {...rest,photo_url:'/api/orders/'+o.id+'/image'};}
function permitted(req,o){return req.user.role==='staff'||o.ordered_by===req.user.name;}
app.get('/api/orders',auth,(req,res)=>res.json({orders:orders.filter(o=>permitted(req,o)).slice().reverse().map(visibleOrder)}));
app.post('/api/orders',auth,csrf,(req,res)=>{
 const v=req.body||{};
 if(!['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','CUSTOM'].includes(String(v.size||'').toUpperCase())&&!String(v.size||'').toUpperCase().startsWith('CUSTOM:'))return fail(res,400,'Invalid size');
 if(typeof v.title!=='string'||v.title.trim().length<2||v.title.length>120||typeof v.colour!=='string'||v.colour.length>80||!v.colour.trim())return fail(res,400,'Invalid title or colour');
 if(!Number.isInteger(Number(v.quantity))||Number(v.quantity)<1||Number(v.quantity)>1000||String(v.comments||'').length>2000)return fail(res,400,'Invalid quantity or comments');
 const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v.photo||'');
 if(!m||m[2].length>5500000)return fail(res,400,'Upload JPG, PNG or WebP under 4 MB');
 const img=Buffer.from(m[2],'base64');
 const jpg=img[0]===255&&img[1]===216&&img[2]===255;
 const png=img.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=img.subarray(0,4).toString()==='RIFF'&&img.subarray(8,12).toString()==='WEBP';
 if(img.length>4000000||img.length<20||!(jpg||png||webp))return fail(res,400,'Invalid image format');
 const id=orders.reduce((n,o)=>Math.max(n,o.id),0)+1,now=new Date().toISOString();
 const o={id,title:v.title.trim(),size:String(v.size).trim(),colour:v.colour.trim(),quantity:Number(v.quantity),comments:String(v.comments||''),staff_note:'',status:'pending',ordered_by:req.user.name,created_at:now,updated_at:now,completed_at:null,image:v.photo,history:[{new_status:'pending',note:'',created_at:now,username:req.user.name}]};
 orders.push(o);save();res.status(201).json({order:visibleOrder(o)});
});
app.get('/api/orders/:id/image',auth,(req,res)=>{
 const o=orders.find(o=>String(o.id)===req.params.id);
 if(!o||!permitted(req,o))return fail(res,404,'Not found');
 const m=/^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(o.image||'');
 if(!m)return fail(res,404,'No image');
 res.set('Content-Type','image/'+m[1]);res.send(Buffer.from(m[2],'base64'));
});
app.get('/api/orders/:id/history',auth,(req,res)=>{
 const o=orders.find(o=>String(o.id)===req.params.id);
 if(!o||!permitted(req,o))return fail(res,404,'Not found');
 res.json({history:o.history});
});
app.patch('/api/orders/:id/status',auth,csrf,(req,res)=>{
 if(req.user.role!=='staff')return fail(res,403,'Staff only');
 const o=orders.find(o=>String(o.id)===req.params.id);
 if(!o)return fail(res,404,'Not found');
 const status=String(req.body.status||'');
 if(!['pending','in_progress','completed'].includes(status)||String(req.body.staff_note||'').length>2000)return fail(res,400,'Invalid status or note');
 o.status=status;o.staff_note=String(req.body.staff_note||'');o.updated_at=new Date().toISOString();o.completed_at=status==='completed'?o.updated_at:null;
 o.history.push({new_status:status,note:o.staff_note,created_at:o.updated_at,username:req.user.name});
 save();res.json({order:visibleOrder(o)});
});
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((req,res)=>fail(res,404,'Not found'));
app.listen(process.env.PORT||10000,'0.0.0.0',()=>console.log('FlyXJ server started'));
