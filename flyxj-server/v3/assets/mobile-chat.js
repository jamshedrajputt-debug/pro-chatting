'use strict';
(function(){
  var $=function(id){return document.getElementById(id)};
  var state={me:null,messages:[],source:null,loading:false,opened:false,atBottom:true};
  function showError(message){$('error').textContent=message||''}
  function stamp(iso){
    var d=new Date(iso);
    if(isNaN(d.getTime()))return '';
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }
  async function api(url,method,payload){
    var options={method:method||'GET',credentials:'same-origin',headers:{}};
    if(payload!==undefined){options.body=JSON.stringify(payload);options.headers['Content-Type']='application/json'}
    if(state.me&&state.me.csrf)options.headers['x-csrf-token']=state.me.csrf;
    var response;
    try{response=await fetch(url,options)}catch(e){throw new Error('Connection interrupted. Tap refresh and try again.')}
    var result=await response.json().catch(function(){return {}});
    if(response.status===401){location.replace('/');throw new Error('Please sign in to your FlyXJ account')}
    if(!response.ok)throw new Error(result.detail||('Request failed ('+response.status+')'));
    return result;
  }
  function make(tag,cls,value){
    var el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  }
  function bubble(m){
    var mine=m.from===state.me.username,div=make('article','bubble'+(mine?' mine':''));
    div.appendChild(make('small','',m.from+' · '+stamp(m.at)));
    if(m.body)div.appendChild(make('div','message',m.body));
    if(m.photo_url){
      var link=make('a');
      link.href=m.photo_url;link.target='_blank';link.rel='noopener noreferrer';
      var img=make('img');img.src=m.photo_url;img.alt='Attached chat photo';
      link.appendChild(img);div.appendChild(link);
    }
    if(mine)div.appendChild(make('small','',m.seen_by&&m.seen_by.some(function(name){return name!==m.from})?'✓✓ Seen':'✓ Sent'));
    return div;
  }
  function render(){
    var area=$('history');
    var stayDown=area.scrollHeight-area.scrollTop-area.clientHeight<140||!state.opened;
    area.replaceChildren();
    if(!state.messages.length)area.appendChild(make('div','empty','No messages yet. Send your first message to the FlyXJ team.'));
    state.messages.slice(-250).forEach(function(m){area.appendChild(bubble(m))});
    if(stayDown)area.scrollTop=area.scrollHeight;
    state.opened=true;
  }
  function setPresence(data){
    var online=state.me&&state.me.role==='staff'?data.customer_online:data.staff_online;
    $('presence').textContent=online?'● Other side online':'○ Other side offline · Chat is saved';
    $('presence').classList.toggle('status-dot',!!online);
  }
  async function fetchMessages(silent){
    if(!state.me||state.loading)return;
    state.loading=true;
    try{
      var data=await api('/api/chat','GET');
      var old=state.messages.length?state.messages[state.messages.length-1].id:null;
      state.messages=data.messages||[];
      setPresence(data.presence||{});
      if(!silent||old!==(state.messages.length?state.messages[state.messages.length-1].id:null))render();
      if(state.messages.some(function(m){return m.from!==state.me.username&&(!m.seen_by||m.seen_by.indexOf(state.me.username)<0)})){
        await api('/api/chat/read','POST',{});
      }
      showError('');
    }catch(e){if(!silent)showError(e.message)}
    finally{state.loading=false}
  }
  function activateLive(){
    if(typeof EventSource==='undefined')return;
    try{
      var source=new EventSource('/api/events');
      state.source=source;
      source.addEventListener('chat',function(){fetchMessages(true)});
      source.addEventListener('chat_read',function(){fetchMessages(true)});
      source.addEventListener('presence',function(event){
        try{setPresence(JSON.parse(event.data))}catch(e){}
      });
    }catch(e){}
  }
  function fileToData(file){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){resolve(reader.result)};
      reader.onerror=function(){reject(new Error('Cannot read selected image'))};
      reader.readAsDataURL(file);
    });
  }
  async function preparePhoto(file){
    if(!file)return null;
    if(['image/jpeg','image/png','image/webp'].indexOf(file.type)<0)throw new Error('Choose JPG, PNG or WebP photo');
    if(file.size>10*1024*1024)throw new Error('Photo cannot exceed 10MB');
    if(file.size<1900000)return fileToData(file);
    // The backend allows up to 2.5MB per chat image. Re-encode big photos on Android.
    var img=new Image(),url=URL.createObjectURL(file);
    try{
      await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=function(){reject(new Error('Cannot open selected photo'))};img.src=url});
      var scale=Math.min(1,1500/Math.max(img.naturalWidth,img.naturalHeight));
      var canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      var ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo compression unavailable');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      var result=canvas.toDataURL('image/jpeg',.78);
      if(result.length>3200000)result=canvas.toDataURL('image/jpeg',.55);
      if(result.length>3400000)throw new Error('Please choose a smaller photo');
      return result;
    }finally{URL.revokeObjectURL(url)}
  }
  async function send(e){
    e.preventDefault();showError('');
    var content=$('message').value.trim(),file=$('photo').files[0];
    if(!content&&!file)return;
    var button=$('send');button.disabled=true;button.textContent='Sending...';
    try{
      var photo=await preparePhoto(file);
      var result=await api('/api/chat','POST',{message:content,photo:photo});
      if(!state.messages.some(function(m){return m.id===result.message.id})){
        state.messages.push(result.message);render();
      }
      $('message').value='';$('photo').value='';$('filePreview').textContent='';$('filePreview').style.display='none';
      await fetchMessages(true);
    }catch(ex){showError(ex.message)}
    finally{button.disabled=false;button.textContent='Send'}
  }
  async function initialize(){
    $('compose').addEventListener('submit',send);
    $('refreshChat').addEventListener('click',function(){fetchMessages(false)});
    $('photo').addEventListener('change',function(){
      var f=this.files&&this.files[0],preview=$('filePreview');
      preview.textContent=f?'Attached: '+f.name:'';preview.style.display=f?'block':'none';
    });
    try{
      state.me=await api('/api/me','GET');
      await fetchMessages(false);
      activateLive();
    }catch(e){showError(e.message)}
    setInterval(function(){if(document.visibilityState==='visible')fetchMessages(true)},8000);
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')fetchMessages(false)});
    window.addEventListener('pagehide',function(){if(state.source)state.source.close()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();