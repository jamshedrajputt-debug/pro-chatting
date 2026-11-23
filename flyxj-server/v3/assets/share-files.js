'use strict';
/* Share real private order attachments, never a link. Native Android V7 opens
   Android's ACTION_SEND_MULTIPLE chooser with PNG + PDF. Chrome can use its own
   Web Share API on the second tap to preserve user activation. */
(function(){
 const pending=new Map();
 const origin=location.origin;
 const base='/api/orders/';
 async function json(url,options){
   const response=await fetch(url,{credentials:'same-origin',...options});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(body.detail||'Could not prepare order attachment');
   return body;
 }
 function validTicket(file){
   const url=new URL(file?.url||'',origin);
   if(url.origin!==origin||!/^\/api\/mobile-file\/[a-f0-9]{64}$/.test(url.pathname)||url.search||url.hash)throw Error('Invalid private file URL');
   return url.href;
 }
 async function prepare(id){
   if(!/^[1-9]\d{0,8}$/.test(String(id)))throw Error('Invalid order');
   const me=await json('/api/me');
   if(me.role!=='staff')throw Error('Staff only: combined maker image sharing');
   const make=kind=>json(base+encodeURIComponent(id)+'/mobile-file',{
     method:'POST',credentials:'same-origin',
     headers:{'content-type':'application/json','x-csrf-token':me.csrf},
     body:JSON.stringify({kind})
   });
   const files=await Promise.all([make('maker'),make('pdf')]);
   return files.map((file,i)=>({url:validTicket(file),filename:file.filename,type:i===0?'image/png':'application/pdf'}));
 }
 async function browserFiles(files){
   return Promise.all(files.map(async data=>{
     const response=await fetch(data.url,{credentials:'same-origin',cache:'no-store'});
     if(!response.ok)throw Error('Share file link expired. Prepare it again.');
     const blob=await response.blob();
     if(blob.size>35*1024*1024)throw Error('File too large to share');
     return new File([blob],data.filename,{type:data.type});
   }));
 }
 async function share(id,button,status){
   const set=(value)=>{if(status)status.textContent=value};
   const key=String(id);
   const cached=pending.get(key);
   // Native share requires no second tap: it downloads two private attachments
   // to private cache and opens Android's share sheet with both URIs.
   if(window.FlyxjShare&&typeof window.FlyxjShare.shareFiles==='function'){
     if(button)button.disabled=true;
     set('Preparing original PDF + combined PNG for Android share menu…');
     try {
       const tickets=await prepare(id);
       window.FlyxjShare.shareFiles(JSON.stringify({files:tickets.map(f=>f.url)}));
       set('Android share menu will open. Choose WhatsApp, Gmail, Bluetooth or another app.');
     }catch(e){set('Share failed: '+e.message);}
     finally{if(button)button.disabled=false}
     return;
   }
   // On Chrome/Web Share, prefetch on first tap, share on second tap to retain gesture.
   if(cached&&Date.now()-cached.created<8*60*1000){
     try{
       if(!navigator.share)throw Error('Share menu unavailable. Update FLYXJ Android app to V7.');
       if(navigator.canShare&&!navigator.canShare({files:cached.files}))throw Error('This browser cannot share both attachments together.');
       await navigator.share({files:cached.files,title:'FLYXJ order '+id});
       set('Files passed to the selected app. Recipient delivery is not confirmed.');
     }catch(e){set(e.name==='AbortError'?'Sharing cancelled.':e.message);}
     return;
   }
   if(button)button.disabled=true;
   set('Preparing combined PNG + original PDF…');
   try{
     const tickets=await prepare(id);
     if(!navigator.share)throw Error('Native sharing needs FLYXJ Android V7. You can still download files separately.');
     const files=await browserFiles(tickets);
     pending.set(key,{files,created:Date.now()});
     set('Both files ready. Tap Share PNG + PDF once more to select an app.');
   }catch(e){set(e.message)}
   finally{if(button)button.disabled=false}
 }
 window.FlyxjShareFiles={share};
})();
