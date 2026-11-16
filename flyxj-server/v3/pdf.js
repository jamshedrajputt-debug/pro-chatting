'use strict';
function writePdf(lines){
 const esc=v=>String(v==null?'':v).replace(/[^ -~]/g,'?').replace(/([\\()])/g,'\\$1').slice(0,100);
 const stream=lines.slice(0,40).map((line,i)=>'BT /F1 10 Tf 42 '+String(795-i*17)+' Td ('+esc(line)+') Tj ET').join('\n');
 const objs=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
 let out='%PDF-1.4\n',offs=[0];
 for(let i=0;i<objs.length;i++){offs.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n'}
 const xref=Buffer.byteLength(out);
 out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
 for(const n of offs.slice(1))out+=String(n).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Root 1 0 R /Size '+(objs.length+1)+' >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(out,'ascii');
}
module.exports=writePdf;