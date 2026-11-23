'use strict';
(function(){
  const ua=navigator.userAgent||'';
  // Only Android app WebView; ordinary desktop/mobile browser gets no APK prompt.
  const webview=/Android/i.test(ua)&&(/;\s*wv\b|\bVersion\/\d[^ ]* Chrome\/|FlyXJAndroid\/\d+/i.test(ua));
  if(!webview)return;
  const explicit=/FlyXJAndroid\/(\d+)/i.exec(ua);
  // Pre-v6 Android releases had no custom version in the user agent.
  // Those supported production clients are assumed to be v5 after migration.
  const installed=explicit?Number(explicit[1]):5;
  async function check(){
    let release;
    try{
      const response=await fetch('/assets/android-update.json?latest',{cache:'no-store'});
      if(!response.ok)return;
      release=await response.json();
    }catch{return}
    const v=Number(release?.version);
    if(!Number.isInteger(v)||v<=installed||v<6)return;
    const linkMatch=/^https:\/\/github\.com\/jamshedrajputt-debug\/pro-chatting\/releases\/download\/flyxj-android-v(\d+)\/signed-app\.apk$/.exec(release.apk||'');
    if(!linkMatch||Number(linkMatch[1])!==v)return;
    const dismissed='flyxj-v'+v+'-dismissed';
    if(sessionStorage.getItem(dismissed)==='1'||document.getElementById('flyxj-android-update-notice'))return;
    const box=document.createElement('div');
    box.id='flyxj-android-update-notice';
    box.setAttribute('role','dialog');box.setAttribute('aria-label','FlyXJ Android app update available');
    box.style.cssText='position:fixed;z-index:2147483646;inset:0;background:rgba(8,18,40,.75);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    const panel=document.createElement('section');
    panel.style.cssText='max-width:420px;width:100%;box-sizing:border-box;background:#fff;border-radius:18px;padding:24px;box-shadow:0 16px 50px #0005;color:#132744;font-family:system-ui,-apple-system,sans-serif;text-align:left';
    const heading=document.createElement('h2');heading.textContent='FLYXJ Update Available · v'+v;heading.style.cssText='font-size:22px;margin:0 0 12px';
    const desc=document.createElement('p');desc.textContent='Professional FlyXJ app update available. Tap Download Update, then approve Android installation. Keep your current app installed.';desc.style.cssText='font-size:14px;line-height:1.6;margin:0 0 20px;color:#43516a';
    const download=document.createElement('a');download.href=release.apk;download.textContent='⬇ Download Update V'+v;download.style.cssText='display:block;text-align:center;background:#174d99;color:white;text-decoration:none;padding:14px;border-radius:10px;font-weight:700';
    const later=document.createElement('button');later.type='button';later.textContent='Later';later.style.cssText='display:block;margin:12px auto 0;background:none;color:#43516a;border:0;padding:8px 18px;font-size:14px;cursor:pointer';
    later.onclick=()=>{sessionStorage.setItem(dismissed,'1');box.remove()};
    download.onclick=()=>{sessionStorage.setItem(dismissed,'1')};
    panel.append(heading,desc,download,later);box.append(panel);document.body.append(box);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
})();
