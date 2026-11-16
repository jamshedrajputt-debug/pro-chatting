'use strict';
async function loadTeam(){
 if(state.me?.role!=='staff')return;
 try{
  const data=await api('/api/staff'),host=$('teamAccounts');host.replaceChildren();
  for(const account of data.staff||[]){
   const div=node('div','staff-item');
   div.append(node('b','',account.name),node('span','muted tiny',account.active?'Active staff':'Inactive'));
   host.append(div);
  }
 }catch(e){toast(e.message,true)}
}
function initExtraFeatures(){
 $('floatingChatButton').onclick=e=>{if(/Android/i.test(navigator.userAgent))return; e.preventDefault();toggleDirectChat()};
 $('chatClose').onclick=()=>toggleDirectChat(false);
 $('directChatForm').onsubmit=sendDirectChat;
 $('chatAttach').onchange=()=>{$('chatFileName').textContent=$('chatAttach').files?.[0]?.name||''};
 $('notificationButton').onclick=()=>{
  state.notifications=0;$('notificationCount').textContent='0';$('notificationCount').classList.add('hidden');
  toast('Latest updates are shown in order activity and live chat.');
 };
 $('periodWeek').onclick=()=>{state.financePeriod='weekly';renderFinance()};
 $('periodMonth').onclick=()=>{state.financePeriod='monthly';renderFinance()};
 $('financeCsv').onclick=()=>{window.location.href='/api/finance.csv'};
 $('financeForm').onsubmit=async e=>{
  e.preventDefault();await saveAndRefresh('/finance','PATCH',financeInputs(),'Order price & cost saved');
  if(state.view==='finance')loadFinance();
 };
 $('finishedForm').onsubmit=async e=>{
  e.preventDefault();
  const file=$('finishedPhoto').files?.[0];
  if(!file){toast('Select a completed dress picture',true);return}
  if(file.size>10000000){toast('File too large',true);return}
  try{
   const photo=await compress(file);
   await saveAndRefresh('/finished','POST',{photo},'Finished dress photo uploaded');
   $('finishedForm').reset();
  }catch(err){toast(err.message,true)}
 };
 $('requestApprovalForm').onsubmit=async e=>{
  e.preventDefault();
  await saveAndRefresh('/request-approval','POST',{note:$('approvalRequestNote').value},'Approval request sent to customer');
 };
 $('approveDesign').onclick=()=>saveAndRefresh('/approve','POST',{decision:'approved',note:$('approvalDecisionNote').value},'Design approved');
 $('requestChanges').onclick=()=>saveAndRefresh('/approve','POST',{decision:'changes_requested',note:$('approvalDecisionNote').value},'Change request sent to staff');
 $('staffCreateForm').onsubmit=async e=>{
  e.preventDefault();
  try{
   await api('/api/staff',{method:'POST',body:JSON.stringify({username:$('staffNewUser').value,password:$('staffNewPass').value})});
   $('staffCreateForm').reset();await loadTeam();toast('New staff account created');
  }catch(err){toast(err.message,true)}
 };
 $('exportBackup').onclick=()=>{
  if(state.me?.role!=='staff')return;
  toast('Downloading sensitive private backup. Store it safely.');
  window.location.href='/api/backup.json';
 };
 $('restoreBackup').onclick=async()=>{
  if(state.me?.role!=='staff')return;
  const file=$('backupFile').files?.[0];
  if(!file)return toast('Choose a JSON backup',true);
  if(!confirm('Restore will REPLACE EVERY current order, chat message, account and attachment. Continue only if you have another backup.'))return;
  const answer=prompt('Type RESTORE to replace all current FlyXJ data:');
  if(answer!=='RESTORE')return;
  try{
   const b=JSON.parse(await file.text());
   if(b.format!=='flyxj-backup-v3')throw Error('Invalid backup format');
   await api('/api/restore',{method:'POST',headers:{'x-confirm-restore':'REPLACE_ALL_DATA'},body:JSON.stringify(b)});
   await refresh({silent:true});await loadDirectChat();await loadTeam();
   toast('Backup restored. Please verify all photos and order data.');
  }catch(e){toast(e.message,true)}
 };
 setInterval(()=>{if(state.me&&state.chatOpen&&document.visibilityState==='visible')loadDirectChat()},14000);
}
