'use strict';
/* Deterministic one-file WhatsApp dispatch. A page is ONE order: original photos
   followed by the order's visible specs. PDF page sequence is intrinsic and
   cannot be rearranged by Android/WhatsApp's multi-image gallery. */
const sharp=require('sharp');
const W=1200,H=1700;
const safe=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,110);
const esc=v=>safe(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function displayReference(order){
 const id=Number(order.id);
 const created=new Date(order.created_at||order.createdAt||'');
 const date=Number.isNaN(created.getTime())?null:created;
 const existing=String(order.reference||'').trim();
 if(!Number.isInteger(id)||id<=0||!date)return existing||'FXJ-'+String(id||0).padStart(6,'0');
 return 'FXJ-'+date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(id).padStart(6,'0');
}
function panelSvg(order,index,total,photoCount){
 const reference=esc(displayReference(order)),size=esc(order.size||'Not set'),colour=esc(order.colour||'Not set');
 return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1700">'+
  '<rect width="1200" height="1700" fill="#f5f8fa"/>'+
  '<rect width="1200" height="195" fill="#112d43"/>'+
  '<rect width="1200" height="9" fill="#139789"/>'+
  '<text x="56" y="86" font-family="Arial,sans-serif" font-weight="bold" font-size="42" fill="#a7e5d8">REFERENCE</text>'+
  '<text x="56" y="156" font-family="Arial,sans-serif" font-size="49" font-weight="bold" fill="#fff">'+reference+'</text>'+
  '<rect x="35" y="1440" width="1130" height="215" rx="22" fill="#ffffff" stroke="#d9e6e9" stroke-width="3"/>'+
  '<rect x="35" y="1440" width="11" height="215" rx="5" fill="#118c80"/>'+
  '<text x="75" y="1523" font-family="Arial,sans-serif" font-weight="bold" font-size="39" fill="#173e55">SIZE: '+size+'</text>'+
  '<text x="75" y="1610" font-family="Arial,sans-serif" font-weight="bold" font-size="39" fill="#173e55">COLOR: '+colour+'</text>'+
 '</svg>');
}
async function page(order,photos,index,total){
 if(!photos.length||photos.length>8)throw Error('Select between 1 and 8 images');
 const nRows=Math.ceil(photos.length/2),gap=14;
 const tileW=548,tileH=Math.floor((1132-(nRows-1)*gap)/nRows);
 const composites=[{input:panelSvg(order,index,total,photos.length),top:0,left:0}];
 const tileBg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+tileW+'" height="'+tileH+'"><rect width="100%" height="100%" fill="#ffffff" rx="10"/></svg>');
 for(let i=0;i<photos.length;i++){
  const x=45+(i%2)*(tileW+14),y=273+Math.floor(i/2)*(tileH+gap);
  const img=await sharp(photos[i],{limitInputPixels:40_000_000,failOn:'error'}).rotate()
   .resize(tileW-12,tileH-12,{fit:'contain',background:'#fff'}).flatten({background:'#ffffff'})
   .jpeg({quality:77,mozjpeg:true}).toBuffer();
  composites.push({input:tileBg,left:x,top:y},{input:img,left:x+6,top:y+6});
 }
 return sharp({create:{width:W,height:H,channels:3,background:'#f1f6f9'}})
  .composite(composites).jpeg({quality:83,mozjpeg:true}).toBuffer();
}
function pdfFromJpegs(images){
 if(!Array.isArray(images)||images.length<1||images.length>6)throw Error('Invalid PDF pages');
 const objs=[null,'<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids ['+images.map((_,i)=>(3+3*i)+' 0 R').join(' ')+'] /Count '+images.length+' >>'];
 for(let i=0;i<images.length;i++){
  const pageId=3+3*i,imgId=pageId+1,contentId=pageId+2;
  const j=images[i];if(!Buffer.isBuffer(j)||j.length<100)throw Error('Invalid image page');
  objs[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 '+imgId+' 0 R >> >> /Contents '+contentId+' 0 R >>';
  objs[imgId]=Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width '+W+' /Height '+H+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+j.length+' >>\nstream\n','ascii'),j,Buffer.from('\nendstream','ascii')]);
  const commands=Buffer.from('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n','ascii');
  objs[contentId]=Buffer.concat([Buffer.from('<< /Length '+commands.length+' >>\nstream\n','ascii'),commands,Buffer.from('endstream','ascii')]);
 }
 const chunks=[],offsets=[0];let pos=0;
 const put=x=>{const b=Buffer.isBuffer(x)?x:Buffer.from(x,'ascii');chunks.push(b);pos+=b.length};
 put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 for(let i=1;i<objs.length;i++){
  offsets[i]=pos;put(i+' 0 obj\n');put(objs[i]);put('\nendobj\n');
 }
 const xref=pos;put('xref\n0 '+objs.length+'\n0000000000 65535 f \n');
 for(let i=1;i<objs.length;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 put('trailer\n<< /Root 1 0 R /Size '+objs.length+' >>\nstartxref\n'+xref+'\n%%EOF');
 return Buffer.concat(chunks);
}
async function make(orders){
 if(!Array.isArray(orders)||!orders.length||orders.length>6)throw Error('Select 1–6 orders');
 const pages=[];
 for(let i=0;i<orders.length;i++){
  pages.push(await page(orders[i].order,orders[i].photos,i+1,orders.length));
 }
 const pdf=pdfFromJpegs(pages);
 if(pdf.length>28*1024*1024)throw Error('PDF too large: select fewer images');
 return pdf;
}
async function makeImage(orders){
 if(!Array.isArray(orders)||!orders.length||orders.length>6)throw Error('Choose 1 to 6 orders');
 const layers=[];
 for(let i=0;i<orders.length;i++){
  const input=await page(orders[i].order,orders[i].photos,i+1,orders.length);
  layers.push({input,left:0,top:H*i});
 }
 const output=await sharp({create:{width:W,height:H*orders.length,channels:3,background:'#f1f6f9'}})
  .composite(layers).jpeg({quality:80,mozjpeg:true}).toBuffer();
 if(output.length>13*1024*1024)throw Error('Image too large: select fewer photos');
 return output;
}
module.exports={make,makeImage,pdfFromJpegs,page,displayReference,panelSvg};
