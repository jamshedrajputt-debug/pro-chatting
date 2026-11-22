'use strict';
/* One image only: four dress reference photos with Size + Color in the image.
   No ZIP, TXT, CSV, PDF text, API keys or extra manufacturer downloads.
   Paint in the browser so WebView can decode JPEG, PNG and WebP natively.
   POST the finished PNG to an authenticated short-lived download endpoint
   so Android DownloadManager can save the real .png (not a blob URL). */
(function(){
 const W=1200,H=1400,M=24,G=18,TILE=(W-2*M-G)/2;
 function picture(url){
  return new Promise((resolve,reject)=>{
   const image=new Image(),timeout=setTimeout(()=>reject(Error('Photo could not load. Please refresh.')),22000);
   image.onload=()=>{clearTimeout(timeout);resolve(image)};
   image.onerror=()=>{clearTimeout(timeout);reject(Error('An order photo is unavailable'))};
   image.src=url;
  });
 }
 function text(ctx,value,limit){
  const candidate=String(value||'Not set').trim();
  const safe=candidate.length>55?candidate.slice(0,52)+'…':candidate;
  let n=52;
  while(n>24){ctx.font='bold '+n+'px system-ui, Arial, sans-serif';if(ctx.measureText(safe).width<=limit)break;n-=2}
  ctx.font='bold '+n+'px system-ui, Arial, sans-serif';return safe;
 }
 function frame(ctx,image,x,y,side){
  ctx.fillStyle='#ffffff';ctx.fillRect(x,y,side,side);
  if(image){
   const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
   const ratio=Math.min(side/w,side/h);
   const scaledW=Math.max(1,Math.round(w*ratio)),scaledH=Math.max(1,Math.round(h*ratio));
   ctx.drawImage(image,x+(side-scaledW)/2,y+(side-scaledH)/2,scaledW,scaledH);
  }
  ctx.strokeStyle='#dce3ed';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,side-2,side-2);
 }
 async function render(order){
  if(!order||!Array.isArray(order.photos)||!order.photos.length)throw Error('This order has no uploaded photos');
  const images=await Promise.all(order.photos.slice(0,4).map(picture));
  const canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Image creation is not supported on this Android device');
  ctx.fillStyle='#f2f5fa';ctx.fillRect(0,0,W,H);
  if(images.length===1){
   frame(ctx,images[0],M,M,W-2*M);
  }else{
   for(let i=0;i<images.length;i++){
    const x=M+(i%2)*(TILE+G),y=M+Math.floor(i/2)*(TILE+G);
    frame(ctx,images[i],x,y,TILE);
   }
  }
  const footerY=1195;
  ctx.fillStyle='#182b4b';ctx.fillRect(0,footerY,W,H-footerY);
  ctx.fillStyle='#bdcbe1';ctx.font='bold 21px system-ui, Arial, sans-serif';
  ctx.fillText('SIZE',56,footerY+57);
  ctx.fillText('COLOR',W/2+20,footerY+57);
  ctx.fillStyle='#ffffff';
  ctx.fillText(text(ctx,order.size,500),56,footerY+124);
  ctx.fillText(text(ctx,order.colour,530),W/2+20,footerY+124);
  ctx.strokeStyle='#4a5e7c';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(W/2-22,footerY+36);ctx.lineTo(W/2-22,H-36);ctx.stroke();
  return canvas.toDataURL('image/png');
 }
 async function download(order,csrf,progress){
  if(!csrf)throw Error('Login has expired. Please sign in again.');
  const png=await render(order);
  if(typeof progress==='function')progress('Saving one combined image...');
  const url='/api/orders/'+encodeURIComponent(order.id)+'/maker-image';
  const result=await fetch(url,{
   method:'POST',credentials:'same-origin',
   headers:{'content-type':'application/json','x-csrf-token':csrf},
   body:JSON.stringify({png})
  });
  const body=await result.json().catch(()=>({}));
  if(!result.ok||!body.url)throw Error(body.detail||'Could not prepare the image download');
  const link=document.createElement('a');
  link.href=body.url;link.download=String(order.reference||'FLYXJ')+'-MAKER.png';
  link.style.display='none';document.body.appendChild(link);
  link.click();link.remove();
  return body.url;
 }
 window.FlyxjMakerCollage={download,render};
})();