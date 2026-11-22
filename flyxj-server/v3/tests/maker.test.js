'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {localPdfFields,aiPdfFields}=require('../maker-extract.js');
const {makeZip,crc32,sheetTxt,sheetCsv}=require('../maker-pack.js');
const inputPdf=Buffer.from(
 '%PDF-1.7\nstream\n'+
 'BT (Recipient: Jane Maker) Tj ET\n'+
 'BT (Delivery Address:) Tj ET\n'+
 'BT (25 Tailor Street) Tj ET\n'+
 'BT (London SW1A 1AA) Tj ET\n'+
 'BT (United Kingdom) Tj ET\n'+
 'BT (Email: customer@example.co.uk) Tj ET\n'+
 'BT (Phone: +44 7700 900123) Tj ET\n'+
 'BT (Colour: Brown) Tj ET\n'+
 'BT (Size: XL) Tj ET\n'+
 'BT (Quantity: 2) Tj ET\n'+
 'BT (Bust: 42 inches) Tj ET\n'+
 'BT (Waist: 36 inches) Tj ET\n'+
 'endstream\n%%EOF','latin1');
const order={id:7,reference:'FXJ-2026-000007',title:'Leather Jacket',colour:'Black',size:'M',quantity:2,comments:'Long sleeves',measurements:{bust:'40 in'},priority:'high'};
test('PDF extraction identifies recipient, full shipping address, email, size, colour and measurements',()=>{
 const result=localPdfFields(inputPdf,order);
 assert.equal(result.fields.recipient,'Jane Maker');
 assert.match(result.fields.address,/25 Tailor Street/);
 assert.match(result.fields.address,/London SW1A 1AA/);
 assert.equal(result.fields.email,'customer@example.co.uk');
 assert.match(result.fields.phone,/\+44/);
 assert.equal(result.fields.colour,'Brown');
 assert.equal(result.fields.size,'XL');
 assert.equal(result.fields.quantity,'2');
 assert.match(result.fields.measurements,/Bust: 42 inches/);
 assert.deepEqual(result.conflicts,['colour','size']);
 assert.equal(result.review_required,true);
 assert.equal(result.source,'pdf_text_labels');
 const sheet=sheetCsv(order,result);
 assert.match(sheet,/Black/);
 assert.match(sheet,/Brown/);
 assert.match(sheet,/MISMATCH/);
 assert.match(sheet,/customer@example.co.uk/);
 assert.doesNotMatch(sheet,/sale_pkr|making_pkr|fx_pkr/);
 const txt=sheetTxt(order,result);
 assert.match(txt,/MAKER/);
 assert.match(txt,/FULL DELIVERY ADDRESS/);
 assert.match(txt,/VERIFY/);
});
test('Unscannable image-only PDF does not invent an address or email',()=>{
 const imgPdf=Buffer.from('%PDF-1.4\n% Image only\n%%EOF');
 const data=localPdfFields(imgPdf,order);
 assert.equal(data.source,'scanned_pdf_unreadable');
 assert.equal(data.fields.address,null);
 assert.equal(data.fields.email,null);
 assert.equal(data.review_required,true);
});
test('Optional AI PDF vision uses server-only key and structured file input',async()=>{
 const prev=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-secret-key';
 try{
  const fields={recipient:'Maker Customer',address:'4 Example Road, London, UK',email:'maker@sample.org',phone:null,colour:'Black',size:'M',quantity:'2',measurements:null,notes:null};
  const parsed=await aiPdfFields(inputPdf,order,async(url,options)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');
   assert.equal(options.headers.Authorization,'Bearer unit-test-secret-key');
   const body=JSON.parse(options.body);
   assert.equal(body.store,false);
   assert.equal(body.input[0].content[1].type,'input_file');
   assert.match(body.input[0].content[1].file_data,/^data:application\/pdf;base64,/);
   return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(fields)}]}]})};
  });
  assert.equal(parsed.source,'ai_pdf_review');
  assert.equal(parsed.fields.email,'maker@sample.org');
 }finally{
  if(prev===undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=prev;
 }
});
function unzipStored(buffer){
 const entries=new Map();let i=0;
 while(i<buffer.length&&buffer.readUInt32LE(i)===0x04034b50){
  const method=buffer.readUInt16LE(i+8),crc=buffer.readUInt32LE(i+14);
  const size=buffer.readUInt32LE(i+18),nameSize=buffer.readUInt16LE(i+26),extraSize=buffer.readUInt16LE(i+28);
  assert.equal(method,0,'ZIP uses stored compressed images/PDF without quality loss');
  const name=buffer.subarray(i+30,i+30+nameSize).toString('utf8');
  const start=i+30+nameSize+extraSize;
  const data=buffer.subarray(start,start+size);
  assert.equal(crc32(data),crc,'CRC verified for '+name);
  entries.set(name,data);i=start+size;
 }
 assert.equal(buffer.readUInt32LE(i),0x02014b50,'ZIP central directory exists');
 assert.equal(buffer.readUInt32LE(buffer.length-22),0x06054b50,'ZIP end of central directory exists');
 return entries;
}
test('One-click maker ZIP contains complete TXT+CSV sheet, original PDF and exactly all photos',()=>{
 const maker=localPdfFields(inputPdf,order);
 const photo=Buffer.from([255,216,255,0,1,2,3]);
 const originals=[
  {name:'MAKER_ORDER.txt',data:Buffer.from(sheetTxt(order,maker))},
  {name:'MAKER_ORDER.csv',data:Buffer.from(sheetCsv(order,maker))},
  {name:'ORIGINAL_SPECIFICATION.pdf',data:inputPdf},
  ...Array.from({length:4},(_,i)=>({name:'PHOTOS/REFERENCE_0'+(i+1)+'.jpg',data:photo}))
 ];
 const zip=makeZip(originals);
 const parsed=unzipStored(zip);
 assert.equal(parsed.size,7);
 for(const o of originals)assert.deepEqual(parsed.get(o.name),o.data);
 assert.match(parsed.get('MAKER_ORDER.txt').toString('utf8'),/customer@example.co.uk/);
 assert.throws(()=>makeZip([{name:'../private-data',data:photo}]),/Unsafe/);
});
