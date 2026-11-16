'use strict';
function updateChatBadge(){
 $('chatUnread').textContent=state.unread>99?'99+':String(state.unread||0);
 $('chatUnread').classList.toggle('hidden',state.unread<1);
}
function displayPresence(p){
 const online=state.me?.role==='staff'?p.customer_online:p.staff_online;
 $('chatPresence').textContent=online?'● Other side online':'○ Other side offline — messages will be delivered';
 $('chatPresence').classList.toggle('chat-online',!!online);
}
async function loadDirectChat(){
 if(!state.me)return;
 try{
  const result=await api('/api/chat');
  state.chat=result.messages||[];
  state.unread=state.chat.filter(m=>m.from!==state.me.username&&!m.seen_by?.includes(state.me.username)).length;
  updateChatBadge();displayPresence(result.presence||{});renderDirectChat();
 }catch(e){if(state.chatOpen)toast(e.message,true)}
}
function renderDirectChat(){
 const wrap=$('chatMessages');wrap.replaceChildren();
 if(!state.chat.length)wrap.append(node('p','muted tiny','No messages yet. Say hello!'));
 for(const m of state.chat.slice(-120)){
  const div=node('div','chat-bubble'+(m.from===state.me?.username?' own':''));
  div.append(node('small','',m.from+' · '+time(m.at)));
  if(m.body)div.append(node('div','chat-bubble-text',m.body));
  if(m.photo_url){
   const img=node('img','chat-bubble-image');img.src=m.photo_url;img.alt='Image attachment';
   img.onclick=()=>window.open(img.src,'_blank','noopener');div.append(img);
  }
  if(m.from===state.me?.username)div.append(node('small','',m.seen_by?.some(name=>name!==m.from)?'✓✓ Read':'✓ Sent'));
  wrap.append(div);
 }
 wrap.scrollTop=wrap.scrollHeight;
}
async function markChatRead(){
 if(!state.me)return;
 state.unread=0;updateChatBadge();
 try{await api('/api/chat/read',{method:'POST',body:'{}'})}catch(e){}
}
async function toggleDirectChat(open){
 state.chatOpen=typeof open==='boolean'?open:!state.chatOpen;
 $('floatingChatPanel').classList.toggle('hidden',!state.chatOpen);
 if(state.chatOpen){
  await loadDirectChat();await markChatRead();$('chatInput').focus();
 }
}
async function sendDirectChat(event){
 event.preventDefault();
 const file=$('chatAttach').files?.[0],body=$('chatInput').value.trim();
 if(!body&&!file)return;
 const btn=$('directChatForm').querySelector('button[type=submit]');
 btn.disabled=true;
 try{
  let photo=null;
  if(file){
   if(file.size>10000000)throw Error('Image must be under 10 MB');
   photo=await compress(file);
  }
  const data=await api('/api/chat',{method:'POST',body:JSON.stringify({message:body,photo})});
  if(!state.chat.some(m=>m.id===data.message.id))state.chat.push(data.message);
  $('chatInput').value='';$('chatAttach').value='';$('chatFileName').textContent='';
  renderDirectChat();
 }catch(e){toast(e.message,true)}
 finally{btn.disabled=false}
}
