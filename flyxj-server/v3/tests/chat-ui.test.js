'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
test('Android chat bubble opens a real popup and sends a customer message',async()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://flyxj.example/',runScripts:'outside-only',pretendToBeVisual:true});
 const win=dom.window,doc=win.document;
 const calls=[];
 win.fetch=async(url,options={})=>{
  const req={url:String(url),method:options.method||'GET',body:options.body||null};
  calls.push(req);
  let payload={ok:true};
  if(req.url==='/api/me')payload={username:'usera',role:'customer',csrf:'test-token'};
  else if(req.url==='/api/orders')payload={orders:[]};
  else if(req.url==='/api/dashboard')payload={stats:{total:0,active:0,shipped:0,completed:0,by_status:{}},statuses:[]};
  else if(req.url==='/api/chat'&&req.method==='GET')payload={messages:[],presence:{staff_online:true,customer_online:true}};
  else if(req.url==='/api/chat'&&req.method==='POST')payload={message:{id:'sample-1',from:'usera',to:'userb',body:JSON.parse(req.body).message,at:new Date().toISOString(),seen_by:['usera'],photo_url:null}};
  else if(req.url==='/api/chat/read')payload={ok:true,count:0};
  return {ok:true,status:200,json:async()=>payload};
 };
 // Load scripts in exactly the same order as the real deferred webpage.
 const browserContext=dom.getInternalVMContext();
 for(const script of ['app.js','order-extra.js','chat-extra.js','finance-extra.js','init-extra.js']){
  // Real <script> execution shares top-level bindings; strict eval() does not.
  vm.runInContext(fs.readFileSync(path.join(root,'assets',script),'utf8'),browserContext,{filename:script});
 }
 try{
  await wait(140);
  const button=doc.getElementById('floatingChatButton'),panel=doc.getElementById('floatingChatPanel');
  assert.ok(!button.classList.contains('hidden'),'chat button appears after login');
  assert.equal(panel.classList.contains('hidden'),true,'popup starts closed');
  button.click();
  assert.equal(panel.classList.contains('hidden'),false,'popup opens instantly when clicked');
  assert.equal(button.getAttribute('aria-expanded'),'true','button announces expanded state');
  await wait(100);
  assert.match(doc.getElementById('chatPresence').textContent,/online/i);
  const input=doc.getElementById('chatInput');
  input.value='Hi, order tracking please';
  doc.getElementById('directChatForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  await wait(100);
  const sent=calls.find(c=>c.url==='/api/chat'&&c.method==='POST');
  assert.ok(sent,'chat message POST performed');
  assert.equal(JSON.parse(sent.body).message,'Hi, order tracking please');
  assert.match(doc.getElementById('chatMessages').textContent,/Hi, order tracking please/);
  assert.equal(button.getAttribute('href'),'/chat','bubble is also a reliable Android navigation link');
  Object.defineProperty(win.navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36',configurable:true});
  let androidDefaultAllowed=null;
  button.addEventListener('click',function(e){
    androidDefaultAllowed=!e.defaultPrevented;
    e.preventDefault(); // keep jsdom from trying to navigate
  },{once:true});
  button.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true}));
  assert.equal(androidDefaultAllowed,true,'Android WebView navigation is not blocked by popup handler');
  Object.defineProperty(win.navigator,'userAgent',{value:'Mozilla/5.0 Desktop Chrome',configurable:true});
  doc.getElementById('chatClose').click();
  assert.equal(panel.classList.contains('hidden'),true,'X closes chat popup');
  button.click();
  assert.equal(panel.classList.contains('hidden'),false,'reopening works');
 }finally{
  dom.window.close();
 }
});


test('Dedicated Android chat screen loads history and sends a message',async()=>{
 const html=fs.readFileSync(path.join(root,'mobile-chat.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://flyxj.example/chat',runScripts:'outside-only',pretendToBeVisual:true});
 const win=dom.window,doc=win.document,history=[];
 const called=[];
 win.fetch=async(url,options={})=>{
  const endpoint=String(url),method=options.method||'GET';
  called.push({endpoint,method});
  let payload={ok:true};
  if(endpoint==='/api/me')payload={username:'usera',role:'customer',csrf:'token-123'};
  else if(endpoint==='/api/chat'&&method==='GET')payload={messages:history,presence:{staff_online:true,customer_online:true}};
  else if(endpoint==='/api/chat'&&method==='POST'){
   const body=JSON.parse(options.body);
   const message={id:'android-test-'+(history.length+1),from:'usera',to:'userb',body:body.message,at:'2026-11-16T10:00:00Z',seen_by:['usera'],photo_url:null};
   history.push(message);payload={message};
  }
  else if(endpoint==='/api/chat/read')payload={ok:true,marked:0};
  return {ok:true,status:200,json:async()=>payload};
 };
 // Avoid a network EventSource in the standalone DOM.
 win.EventSource=undefined;
 vm.runInContext(fs.readFileSync(path.join(root,'assets/mobile-chat.js'),'utf8'),dom.getInternalVMContext(),{filename:'mobile-chat.js'});
 try{
  await wait(130);
  assert.match(doc.getElementById('presence').textContent,/online/i);
  assert.match(doc.getElementById('history').textContent,/No messages yet/);
  doc.getElementById('message').value='Please send my tracking ID';
  doc.getElementById('compose').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  await wait(90);
  assert.ok(called.some(x=>x.endpoint==='/api/chat'&&x.method==='POST'),'sends via authenticated chat endpoint');
  assert.match(doc.getElementById('history').textContent,/Please send my tracking ID/,'message appears in chat; error='+doc.getElementById('error').textContent+'; calls='+JSON.stringify(called));
  assert.equal(doc.getElementById('message').value,'','input clears after successful sending');
  assert.equal(doc.querySelector('a.back').getAttribute('href'),'/','Android back link returns to dashboard');
 }finally{dom.window.close()}
});
