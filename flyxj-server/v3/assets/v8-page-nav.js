'use strict';
(function(){
 if(document.getElementById('fx8PageNav'))return;
 const nav=document.createElement('nav');nav.id='fx8PageNav';nav.className='fx8-page-nav';nav.setAttribute('aria-label','FLYXJ app bottom navigation');
 const current=location.pathname==='/chat'?'chat':'files';
 const items=[['⌂','Home','/#overview','home'],['▤','Orders','/#orders','orders'],['▣','Files','/#files','files'],['✉','Chat','/chat','chat'],['⚙','More','/#more','more']];
 for(const [symbol,label,url,id] of items){
   const link=document.createElement('a');link.href=url;
   const ico=document.createElement('span');ico.className='symbol';ico.textContent=symbol;
   const caption=document.createElement('span');caption.textContent=label;
   link.append(ico,caption);
   if(id===current)link.setAttribute('aria-current','page');
   nav.append(link);
 }
 document.body.append(nav);
})();
