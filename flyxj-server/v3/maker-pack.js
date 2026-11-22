'use strict';
// ZIP file writer (STORE method), no external dependencies. Inputs are already
// compressed JPG/PNG/WebP/PDF documents. Supports Android/Windows/macOS ZIP.
const LIMIT=65*1024*1024;
const TABLE=Uint32Array.from({length:256},(_,i)=>{
 let c=i;
 for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
function crc32(buffer){
 let crc=0xffffffff;
 for(const byte of buffer)crc=TABLE[(crc^byte)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
function makeZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>48)throw Error('Invalid maker ZIP file list');
 const local=[],central=[];
 let offset=0,centralLength=0;
 const seen=new Set();
 for(const entry of entries){
  const name=entry.name,bytes=entry.data;
  if(typeof name!=='string'||!name.length||name.length>110||!/^([A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(name)||name.includes('..')||seen.has(name))
   throw Error('Unsafe or repeated ZIP filename');
  seen.add(name);
  if(!Buffer.isBuffer(bytes)||bytes.length>35*1024*1024)throw Error('ZIP input too large');
  if(offset+bytes.length+500>LIMIT)throw Error('Maker ZIP maximum size exceeded');
  const n=Buffer.from(name,'utf8'),crc=crc32(bytes);
  const header=Buffer.alloc(30+n.length);
  header.writeUInt32LE(0x04034b50,0);
  header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(0,8);
  header.writeUInt16LE(0,10);header.writeUInt16LE(0x21,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);
  header.writeUInt16LE(n.length,26);header.writeUInt16LE(0,28);n.copy(header,30);
  local.push(header,bytes);
  const record=Buffer.alloc(46+n.length);
  record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);
  record.writeUInt16LE(0x0800,8);record.writeUInt16LE(0,10);
  record.writeUInt16LE(0,12);record.writeUInt16LE(0x21,14);
  record.writeUInt32LE(crc,16);record.writeUInt32LE(bytes.length,20);record.writeUInt32LE(bytes.length,24);
  record.writeUInt16LE(n.length,28);record.writeUInt16LE(0,30);record.writeUInt16LE(0,32);
  record.writeUInt16LE(0,34);record.writeUInt16LE(0,36);record.writeUInt32LE(0,38);
  record.writeUInt32LE(offset,42);n.copy(record,46);
  central.push(record);centralLength+=record.length;
  offset+=header.length+bytes.length;
 }
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
 if(offset+centralLength+end.length>LIMIT)throw Error('Maker ZIP too large');
 return Buffer.concat([...local,...central,end],offset+centralLength+end.length);
}
const printable=v=>String(v??'Not supplied').replace(/[\x00-\x1f\x7f]/g,' ').trim()||'Not supplied';
function rows(order,maker){
 const p=maker.fields||{},s=maker.selected||{};
 return [
  ['Order reference',order.reference||('FXJ-'+order.id),'',''],
  ['Dress / product',order.title,'',''],
  ['Color / Colour',s.colour,p.colour,maker.conflicts.includes('colour')?'MISMATCH — VERIFY':''],
  ['Size',s.size,p.size,maker.conflicts.includes('size')?'MISMATCH — VERIFY':''],
  ['Quantity',s.quantity,p.quantity,maker.conflicts.includes('quantity')?'MISMATCH — VERIFY':''],
  ['Recipient / Customer','',p.recipient,!p.recipient?'VERIFY FROM PDF':''],
  ['Delivery address','',p.address,!p.address?'VERIFY FROM PDF':''],
  ['Email','',p.email,!p.email?'VERIFY FROM PDF':''],
  ['Phone','',p.phone,!p.phone?'VERIFY FROM PDF':''],
  ['Measurements',Object.entries(order.measurements||{}).filter(([,v])=>v).map(([k,v])=>k+': '+v).join('; '),p.measurements,''],
  ['Customer notes',order.comments||'',p.notes,''],
  ['Order priority',order.priority||'normal','',''],
  ['Deadline',order.expected_date||'','',''],
  ['Source',maker.source||'PDF parser','','']
 ];
}
function csvValue(s){return '"'+String(s??'').replace(/\r?\n/g,' | ').replace(/"/g,'""')+'"'}
function sheetCsv(order,maker){
 return '\ufeff'+[['Field','User A order selection','Extracted from uploaded PDF','Review'],...rows(order,maker)]
  .map(row=>row.map(csvValue).join(',')).join('\r\n')+'\r\n';
}
function sheetTxt(order,maker){
 const rs=rows(order,maker);
 const top=['FIELD','USER A SELECTED','PDF VALUE','REVIEW'];
 const widths=[23,31,42,25];
 const line=a=>a.map((v,i)=>printable(v).replace(/\s+/g,' ').slice(0,widths[i]).padEnd(widths[i])).join(' | ');
 const sep='-'.repeat(line(top).length);
 const blocks=['FLYXJ | MAKER / MANUFACTURING ORDER PACK',sep,line(top),sep,...rs.map(line),sep];
 blocks.push('IMPORTANT: Customer-selected size and colour are the main order choices.');
 blocks.push('If PDF values disagree, STOP and confirm with User B before making.');
 blocks.push('Never assume an unreadable address/email is correct. Check ORIGINAL_SPECIFICATION.pdf.');
 blocks.push('The attached PHOTOS folder contains all customer reference pictures.');
 blocks.push('SOURCE: '+(maker.source||'PDF field extraction'));
 if(maker.review_required)blocks.push('REVIEW REQUIRED: Yes — verify all missing or conflicting fields.');
 if(maker.fields?.address)blocks.push('\nFULL DELIVERY ADDRESS FROM PDF:\n'+maker.fields.address);
 return '\ufeff'+blocks.join('\r\n')+'\r\n';
}
module.exports={makeZip,rows,sheetTxt,sheetCsv,crc32};
