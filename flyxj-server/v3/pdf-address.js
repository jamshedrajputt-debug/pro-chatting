'use strict';
// Best-effort reader for searchable PDF text. This does not perform OCR.
// Scanned/image-only PDFs and custom font encodings require human review.
const zlib=require('zlib');
const MAX_STREAM=2*1024*1024;
function decodePdfLiteral(raw){
 return raw.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g,(_,part)=>{
  if(/^[0-7]+$/.test(part))return String.fromCharCode(parseInt(part,8));
  return {n:'\n',r:'\r',t:'\t',b:'',f:'','(':'(',')':')','\\':'\\'}[part]||'';
 }).replace(/[\u0000-\u001f]/g,' ').trim();
}
function readableText(pdf){
 if(!Buffer.isBuffer(pdf)||pdf.length>35*1024*1024)return [];
 const source=pdf.toString('latin1');
 const texts=[source.slice(0,Math.min(source.length,100000))];
 const stream=/stream(?:\r\n|\n|\r)([\s\S]*?)\r?\n?endstream/g;
 let found,loops=0;
 while((found=stream.exec(source))&&++loops<500){
  const raw=Buffer.from(found[1],'latin1');
  if(raw.length>MAX_STREAM)continue;
  const dict=source.slice(Math.max(0,found.index-600),found.index);
  if(/\/FlateDecode\b/.test(dict)){
   try{texts.push(zlib.inflateSync(raw,{maxOutputLength:MAX_STREAM}).toString('latin1'))}catch{}
  }else texts.push(raw.toString('latin1'));
 }
 const out=[];
 for(const content of texts){
  const object=/BT([\s\S]*?)ET/g;
  let segment,limit=0;
  while((segment=object.exec(content))&&limit++<2000){
   const strings=[];
   const literal=/\(((?:\\.|[^\\)])*)\)/g;
   let piece;
   while((piece=literal.exec(segment[1]))&&strings.length<250){
    const value=decodePdfLiteral(piece[1]);if(value)strings.push(value);
   }
   if(strings.length)out.push(strings.join(' ').slice(0,900));
  }
 }
 // Some generated PDFs contain readable address fields directly, outside BT/ET.
 if(!out.length){
  const matches=source.match(/(?:Delivery|Shipping|Ship\s*To|Address)\s*(?::|-)\s*[^\r\n]{5,180}/gi);
  if(matches)out.push(...matches.slice(0,12));
 }
 return out.slice(0,300);
}
function extractDeliveryAddress(pdf){
 const lines=readableText(pdf);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const match=/(?:ship\s*to|shipping\s*address|delivery\s*address|customer\s*address|full\s*address|address)\s*[:\-]\s*(.*)$/i.exec(line);
  if(!match)continue;
  const result=[];
  if(match[1].trim())result.push(match[1].trim());
  for(let j=i+1;j<Math.min(lines.length,i+7)&&result.join(' ').length<850;j++){
   const current=lines[j].trim();
   if(!current)break;
   if(/^(?:tel|telephone|mobile|phone|email|e-mail|order|invoice|quantity|size|colour|color|item|product|sku|total|date|payment|notes)\b/i.test(current))break;
   if(current.length>160)break;
   result.push(current);
   if(/\b(?:UK|USA|United Kingdom|United States|Pakistan)\b/i.test(current)&&result.length>=2)break;
  }
  const address=result.join('\n').trim();
  if(address.length>=7)return {address:address.slice(0,850),source:'searchable_pdf',reliable:false};
 }
 return {address:null,source:'unavailable',reliable:false};
}
module.exports={extractDeliveryAddress,readableText};