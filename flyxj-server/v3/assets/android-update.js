'use strict';
(function(){
  // FlyXJ v4 Android app uses a stock Android System WebView UA.
  // Browser pages must not advertise an APK update to desktop browsers.
  const ua=navigator.userAgent||'';
  if(!(/Android/i.test(ua) && (/(?:;\s*wv\b|\bVersion\/\d[^ ]* Chrome\/)/i.test(ua))))return;
  const endpoint='/assets/android-update.json?v=5';
  async function check(){
    let update;
    try{
      const response=await fetch(endpoint,{cache:'no-store'});
      if(!response.ok)throw new Error('Update manifest not available');
      update=await response.json();
    }catch{return}
    if(!update||update.version!==5||!/^https:\/\/github\.com\/jamshedrajputt-debug\/pro-chatting\/releases\/download\/flyxj-android-v5\/signed-app\.apk$/.test(update.apk))return;
    if(sessionStorage.getItem('flyxj-android-update-5-dismissed')==='1')return;
    const box=document.createElement('div');
    box.id='flyxj-android-update-notice';
    box.setAttribute('role','dialog');box.setAttribute('aria-label','FlyXJ Android app update available');
    box.style.cssText='position:fixed;z-index:2147483646;inset:0;background:rgba(8,18,40,.7);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    const panel=document.createElement('section');
    panel.style.cssText='max-width:420px;width:100%;box-sizing:border-box;background:#fff;border-radius:18px;padding:24px;box-shadow:0 16px 50px #0005;color:#132744;font-family:system-ui,-apple-system,sans-serif;text-align:left';
    const h=document.createElement('h2');h.textContent='FLYXJ Update Available · v5';h.style.cssText='font-size:21px;margin:0 0 12px';
    const p=document.createElement('p');p.textContent='New Android app update available. Tap Download Update to save the official APK, then open the downloaded file and approve installation. Do not uninstall your current app.';p.style.cssText='font-size:14px;line-height:1.55;margin:0 0 20px;color:#43516a';
    const link=document.createElement('a');link.href=update.apk;link.textContent='⬇ Download Update V5';link.style.cssText='display:block;text-align:center;background:#174d99;color:white;text-decoration:none;padding:14px;border-radius:10px;font-weight:700';
    const later=document.createElement('button');later.type='button';later.textContent='Later';later.style.cssText='display:block;margin:12px auto 0;background:none;color:#43516a;border:0;padding:8px 18px;font-size:14px;cursor:pointer';
    later.onclick=()=>{sessionStorage.setItem('flyxj-android-update-5-dismissed','1');box.remove()};
    link.addEventListener('click',()=>{sessionStorage.setItem('flyxj-android-update-5-dismissed','1')});
    panel.append(h,p,link,later);box.append(panel);document.body.append(box);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});
  else check();
})();
