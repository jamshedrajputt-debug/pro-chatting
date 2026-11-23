'use strict';
// Compact PDF 1.4 report writer. All content is encoded with bounded ASCII
// to keep report generation deterministic and independent of external services.
function writePdf(lines){
 const esc=v=>String(v==null?'':v)
   .replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');
 const wrap=value=>{
  const src=String(value==null?'':value).replace(/\s+/g,' ').trim();
  if(!src)return [''];
  const words=src.split(' '),result=[];let line='';
  for(const word of words){
   if(word.length>90){if(line){result.push(line);line=''};for(let i=0;i<word.length;i+=90)result.push(word.slice(i,i+90));continue;}
   if(line.length+word.length+1>82){result.push(line);line=word}
   else line=line?line+' '+word:word;
  }
  if(line)result.push(line);
  return result;
 };
 const rowLines=(Array.isArray(lines)?lines:[]).flatMap(wrap).slice(0,39);
 const ops=[];
 // Premium branded navy header, safe printing margins, subtle structural rules.
 ops.push('q 0.07 0.14 0.28 rg 0 742 595 100 re f Q');
 ops.push('q 0.13 0.33 0.67 rg 0 736 595 6 re f Q');
 ops.push('q 1 1 1 rg BT /F2 25 Tf 42 799 Td (FLYXJ) Tj ET Q');
 ops.push('q 0.72 0.83 0.99 rg BT /F1 9 Tf 43 777 Td (ORDER STUDIO  /  PRODUCTION REPORT) Tj ET Q');
 ops.push('q 0.26 0.35 0.52 rg BT /F1 9 Tf 42 717 Td (REPORT DETAILS) Tj ET Q');
 ops.push('q 0.9 0.93 0.97 rg 42 707 510 1 re f Q');
 let y=687;
 for(let i=0;i<rowLines.length&&y>=90;i++){
  const line=rowLines[i],trim=line.trim();
  if(!trim){y-=9;continue;}
  const section=/^(ORDER COST|PRODUCTION|NOT A TAX|FLYXJ\s*\|)/i.test(trim);
  if(section){
   ops.push('q 0.91 0.95 0.99 rg 35 '+(y-8)+' 524 24 re f Q');
   ops.push('q 0.12 0.29 0.52 rg BT /F2 10 Tf 43 '+y+' Td ('+esc(trim.slice(0,82))+') Tj ET Q');
   y-=22;continue;
  }
  ops.push('q 0.18 0.25 0.38 rg BT /F1 10 Tf 43 '+y+' Td ('+esc(line.slice(0,82))+') Tj ET Q');
  y-=18;
 }
 ops.push('q 0.9 0.93 0.97 rg 42 62 510 1 re f Q');
 ops.push('q 0.45 0.53 0.64 rg BT /F1 8 Tf 42 48 Td (FLYXJ ORDER STUDIO   |   Private business record) Tj ET Q');
 ops.push('q 0.45 0.53 0.64 rg BT /F1 8 Tf 517 48 Td (1 / 1) Tj ET Q');
 const stream=ops.join('\n')+'\n';
 const objs=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+Buffer.byteLength(stream,'ascii')+' >>\nstream\n'+stream+'endstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
 ];
 let out='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objs.length;i++){
  offsets.push(Buffer.byteLength(out,'ascii'));
  out+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n';
 }
 const xref=Buffer.byteLength(out,'ascii');
 out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
 for(const n of offsets.slice(1))out+=String(n).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Root 1 0 R /Size '+(objs.length+1)+' >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(out,'ascii');
}
module.exports=writePdf;
