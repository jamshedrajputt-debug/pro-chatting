'use strict';
// WhatsApp click-to-chat only PREPARES a user-confirmed message.
// Automatic delivery is possible only with separately configured WhatsApp
// Business Platform credentials and an approved outbound message template.
const RECIPIENT='971567527192';
const PUBLIC_URL='https://flyxj-order-manager-free.onrender.com';
const safe=v=>String(v??'').replace(/[\r\n\t]/g,' ').slice(0,150);
function orderMessage(o){
 const id=encodeURIComponent(o.id);
 const base=PUBLIC_URL+'/';
 const rows=[
  'FLYXJ - New Order '+safe(o.reference||'FXJ-'+o.id),
  'Dress: '+safe(o.title),
  'Colour: '+safe(o.colour),
  'Size: '+safe(o.size),
  'Quantity: '+safe(o.quantity),
  '',
  'View the order: '+base+'order/'+id,
  'PDF: '+base+'api/orders/'+id+'/pdf'
 ];
 const count=Array.isArray(o.image_files)?o.image_files.length:(o.image?1:0);
 for(let i=0;i<Math.min(8,count);i++)rows.push('Photo '+(i+1)+': '+base+'api/orders/'+id+'/photos/'+i);
 rows.push('Secure FlyXJ login is required to view files.');
 return rows.join('\n');
}
function waLink(o){return 'https://wa.me/'+RECIPIENT+'?text='+encodeURIComponent(orderMessage(o))}
function whatsappConfigured(){
 return !!(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN&&process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID&&process.env.WHATSAPP_APPROVED_TEMPLATE);
}
async function notifyViaBusinessApi(o,fetcher=global.fetch){
 if(!whatsappConfigured())return {status:'not_connected',detail:'WhatsApp Business API is not connected'};
 const phoneId=process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID,token=process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
 const template=process.env.WHATSAPP_APPROVED_TEMPLATE;
 if(!/^\d{5,28}$/.test(phoneId)||!/^[a-z0-9_]{2,100}$/.test(template))return {status:'not_connected'};
 const version=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
 if(!/^v\d{1,2}\.\d$/.test(version))return {status:'not_connected'};
 try{
  const response=await fetcher('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{
   method:'POST',
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({
    messaging_product:'whatsapp',to:RECIPIENT,type:'template',
    template:{name:template,language:{code:'en'},
      components:[{type:'body',parameters:[
       {type:'text',text:safe(o.reference||'FXJ-'+o.id)},
       {type:'text',text:safe(o.title)},
       {type:'text',text:safe(o.size)},
       {type:'text',text:safe(o.colour)},
       {type:'text',text:PUBLIC_URL+'/order/'+encodeURIComponent(o.id)}
      ]}]}
   }),
   signal:AbortSignal.timeout(14000)
  });
  if(!response.ok)throw Error('WhatsApp Cloud API returned '+response.status);
  const result=await response.json();
  if(!result.messages?.[0]?.id)throw Error('No WhatsApp message ID returned');
  return {status:'accepted_by_provider',id:result.messages[0].id};
 }catch(e){
  console.warn('WhatsApp Business notification could not be sent:',e.message);
  return {status:'failed'};
 }
}
module.exports={RECIPIENT,orderMessage,waLink,whatsappConfigured,notifyViaBusinessApi};
