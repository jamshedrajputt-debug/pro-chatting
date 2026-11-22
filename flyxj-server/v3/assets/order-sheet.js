'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const match=/^\/order\/([1-9]\d{0,8})\/?$/.exec(location.pathname);
  const id=match?match[1]:null;
  let order=null,viewIndex=0,allPhotos=false;
  function el(tag,className,text){
    const n=document.createElement(tag);
    if(className)n.className=className;
    if(text!==undefined)n.textContent=String(text);
    return n;
  }
  function fail(message){
    $('message').textContent=message;
    $('message').classList.add('error');
  }
  async function api(url){
    let response;
    try{response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}})}
    catch(e){throw Error('Connection interrupted. Please check the internet and reload.')}
    if(response.status===401){
      location.assign('/');throw Error('Please sign in to your FlyXJ account');
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.detail||'Could not open order');
    return data;
  }
  function safeText(v){
    return v===undefined||v===null||v===''?'Not specified':String(v);
  }
  function addChip(label,value){
    const chip=el('span','chip'),b=el('b','',label+': ');
    chip.append(b,document.createTextNode(safeText(value)));$('chips').append(chip);
  }
  function row(label,value){
    const box=el('div');box.append(el('small','',label),el('strong','',safeText(value)));
    $('information').append(box);
  }
  function formatDate(value){
    if(!value)return 'Not set';
    const d=new Date(value);
    return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):value;
  }
  function showThumbs(){
    const grid=$('photoGrid');grid.replaceChildren();
    const pictures=order.photos||[];
    $('photoCount').textContent=pictures.length+' picture'+(pictures.length===1?'':'s');
    const limit=allPhotos?pictures.length:Math.min(pictures.length,4);
    for(let i=0;i<limit;i++){
      const figure=el('figure','image-card');
      const img=el('img');img.src=pictures[i];img.alt='Dress reference photo '+(i+1);img.loading=i<4?'eager':'lazy';
      const button=el('button');button.type='button';button.setAttribute('aria-label','View photo '+(i+1));
      button.onclick=()=>openPhoto(i);
      figure.append(img,button,el('figcaption','', 'Photo '+(i+1)));
      grid.append(figure);
    }
    if(!pictures.length)grid.append(el('p','muted','No dress photos available. Check whether free-server storage was reset.'));
    const more=$('morePhotos');
    more.classList.toggle('hidden',pictures.length<=4);
    more.textContent=allPhotos?'Show first four photos':'View all '+pictures.length+' photos';
  }
  function imagePresent(){
    const pictures=order?.photos||[];
    if(!pictures.length)return;
    $('viewerImage').src=pictures[viewIndex];
    $('viewerCount').textContent='Photo '+(viewIndex+1)+' of '+pictures.length;
  }
  function openPhoto(index){
    if(!order?.photos?.length)return;
    viewIndex=index;
    $('viewer').classList.remove('hidden');
    document.body.style.overflow='hidden';
    imagePresent();
    try{history.pushState({flyxjPhoto:true,index},'',location.pathname+'#photo-'+(index+1))}catch(e){}
  }
  function hidePhoto(){
    $('viewer').classList.add('hidden');
    document.body.style.overflow='';
    $('viewerImage').removeAttribute('src');
  }
  function closePhoto(){
    if(history.state&&history.state.flyxjPhoto)history.back();
    else hidePhoto();
  }
  function stepPhoto(direction){
    const len=order?.photos?.length||0;
    if(!len)return;
    viewIndex=(viewIndex+direction+len)%len;imagePresent();
    if(history.state?.flyxjPhoto)history.replaceState({flyxjPhoto:true,index:viewIndex},'',location.pathname+'#photo-'+(viewIndex+1));
  }
  function renderOrder(o){
    order=o;
    $('title').textContent=o.title||'Dress order';
    $('barRef').textContent=o.reference||'Order';
    $('ref').textContent=(o.reference||'')+' · Received '+formatDate(o.created_at);
    $('chips').replaceChildren();
    addChip('Colour',o.colour);addChip('Size',o.size);addChip('Quantity',o.quantity);
    addChip('Status',String(o.status||'pending').replaceAll('_',' '));
    $('information').replaceChildren();
    row('Customer',o.customer);row('Order reference',o.reference);
    row('Priority',o.priority||'Normal');row('Expected delivery',formatDate(o.expected_date));
    row('Courier',o.shipping?.courier||'Not shipped');row('Tracking ID',o.shipping?.tracking_id||'Not assigned');
    row('PDF spec',o.pdf_url?'Attached':'Not available');
    row('Measurements',Object.entries(o.measurements||{}).filter(([,v])=>v).map(([key,v])=>key+': '+v).join(' · ')||'See PDF');
    $('notes').textContent=o.comments?'Notes: '+o.comments:'';
    if(o.pdf_url){$('pdfLink').href=o.pdf_url;$('pdfLink').classList.remove('hidden')}
    else $('pdfLink').classList.add('hidden');
    showThumbs();
    $('message').classList.add('hidden');
    $('content').classList.remove('hidden');
  }
  async function showAddress(){
    try{
      const result=await api('/api/orders/'+id+'/address');
      const address=(result.address||'').trim();
      if(address){
        $('addressText').textContent=address;
        $('copyAddress').classList.remove('hidden');
        $('addressHint').textContent='Address extracted from the PDF automatically. Check the original PDF before making a shipping label.';
        $('copyAddress').onclick=async()=>{
          try{
            if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(address);
            else {
              const input=el('textarea');input.value=address;
              document.body.append(input);input.select();document.execCommand('copy');input.remove();
            }
            $('copyAddress').textContent='✓ Copied';
          }catch(e){$('copyAddress').textContent='Select the address above to copy'}
        };
      }else{
        $('addressText').textContent='Delivery address could not be read automatically from this PDF.';
        $('addressHint').textContent='Open the original PDF above to see the complete address. Scanned or image-only PDFs require manual checking.';
      }
    }catch(e){
      $('addressText').textContent='Address preview unavailable.';
      $('addressHint').textContent='Use the original attached PDF as the source of truth.';
    }
  }
  async function downloadMakerImage(){
    const button=$('makerDownload'),status=$('makerStatus');
    if(!order||!window.FlyxjMakerCollage)return;
    button.disabled=true;button.textContent='Preparing your image…';
    status.textContent='Combining photos with size and color...';
    try{
      const user=await api('/api/me');
      if(user.role!=='staff')throw Error('Only User B / staff can download this image.');
      await window.FlyxjMakerCollage.download(order,user.csrf,message=>{status.textContent=message});
      status.textContent='One PNG image prepared. Check your Downloads folder.';
    }catch(e){
      status.textContent=e.message||'Could not download the image. Try again.';
    }finally{
      button.disabled=false;button.textContent='↓ Download Maker Image';
    }
  }
  async function start(){
    if(!id)return fail('Invalid order link. Return to orders and open a valid order.');
    $('morePhotos').onclick=()=>{allPhotos=!allPhotos;showThumbs()};
    $('makerDownload').onclick=downloadMakerImage;
    $('viewerClose').onclick=closePhoto;
    $('viewerPrev').onclick=()=>stepPhoto(-1);
    $('viewerNext').onclick=()=>stepPhoto(1);
    window.addEventListener('popstate',e=>{
      if(!e.state?.flyxjPhoto)hidePhoto();
      else {viewIndex=e.state.index||0;$('viewer').classList.remove('hidden');imagePresent()}
    });
    let touchX=null;
    $('viewerImage').addEventListener('touchstart',e=>{touchX=e.touches[0]?.clientX??null},{passive:true});
    $('viewerImage').addEventListener('touchend',e=>{
      if(touchX===null)return;
      const delta=(e.changedTouches[0]?.clientX??touchX)-touchX;touchX=null;
      if(Math.abs(delta)>40)stepPhoto(delta<0?1:-1);
    },{passive:true});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!$('viewer').classList.contains('hidden'))closePhoto();
      else if(e.key==='ArrowRight')stepPhoto(1);
      else if(e.key==='ArrowLeft')stepPhoto(-1);
    });
    try{
      const data=await api('/api/orders/'+id);
      renderOrder(data.order);showAddress();
      const actions=window.FlyxjOrderActions;
      if(actions){
        $('sheetEdit').onclick=()=>actions.edit(data.order.id);
        $('sheetDelete').onclick=()=>actions.delete(data.order.id);
        $('sheetWhatsApp').onclick=()=>actions.share(data.order);
      }
      if(new URLSearchParams(location.search).has('download')){
        downloadMakerImage();
      }
    }catch(e){fail(e.message)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();