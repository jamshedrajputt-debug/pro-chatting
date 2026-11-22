'use strict';
// Server-side maker collage. The image pixels contain 4 photos + Size + Color.
// No public image URL or external processing service.
const sharp=require('sharp');
const WIDTH=1200,HEIGHT=1400,MARGIN=24,GAP=18,TILE=(WIDTH-2*MARGIN-GAP)/2;
const safe=s=>String(s??'Not set').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,48);
const xml=s=>safe(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function svgCaption(size,colour){
 const labelSize=xml(size),labelColour=xml(colour);
 const leftSize=Math.max(24,Math.min(57,Math.floor(55*18/Math.max(18,labelSize.length))));
 const rightSize=Math.max(24,Math.min(57,Math.floor(55*18/Math.max(18,labelColour.length))));
 return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="205" viewBox="0 0 1200 205">'+
  '<rect x="0" y="0" width="1200" height="205" fill="#182b4b"/>'+
  '<path d="M 578 35 V 176" stroke="#526583" stroke-width="2"/>'+
  '<text x="56" y="57" fill="#bdcbe1" font-family="Arial,DejaVu Sans,sans-serif" font-weight="bold" font-size="21">SIZE</text>'+
  '<text x="620" y="57" fill="#bdcbe1" font-family="Arial,DejaVu Sans,sans-serif" font-weight="bold" font-size="21">COLOR</text>'+
  '<text x="56" y="125" fill="#ffffff" font-family="Arial,DejaVu Sans,sans-serif" font-weight="bold" font-size="'+leftSize+'">'+labelSize+'</text>'+
  '<text x="620" y="125" fill="#ffffff" font-family="Arial,DejaVu Sans,sans-serif" font-weight="bold" font-size="'+rightSize+'">'+labelColour+'</text>'+
 '</svg>');
}
async function normalizePhoto(buffer,{quality=83,maxDimension=1600}={}){
 if(!Buffer.isBuffer(buffer)||buffer.length<16||buffer.length>12*1024*1024)throw Error('Invalid photo data for WhatsApp');
 const info=await sharp(buffer,{limitInputPixels:40_000_000,failOn:'error'}).metadata();
 if(!['jpeg','png','webp'].includes(info.format))throw Error('Unsupported uploaded photo format');
 return sharp(buffer,{limitInputPixels:40_000_000,failOn:'error'})
  .rotate().resize({width:maxDimension,height:maxDimension,fit:'inside',withoutEnlargement:true})
  .flatten({background:'#ffffff'}).jpeg({quality,mozjpeg:true}).toBuffer();
}
async function makerCollage(photoBuffers,{size,colour}={}){
 if(!Array.isArray(photoBuffers)||photoBuffers.length<1||photoBuffers.length>4)
   throw Error('Maker collage requires one to four reference photos');
 const layers=[];
 const tileBackground=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+TILE+'" height="'+TILE+'">'+
  '<rect width="100%" height="100%" fill="#ffffff" stroke="#dce3ed" stroke-width="3"/></svg>');
 for(let i=0;i<4;i++){
  const x=MARGIN+(i%2)*(TILE+GAP),y=MARGIN+Math.floor(i/2)*(TILE+GAP);
  layers.push({input:tileBackground,left:x,top:y});
  if(i<photoBuffers.length){
   const image=await sharp(photoBuffers[i],{limitInputPixels:40_000_000,failOn:'error'})
    .rotate().resize(TILE-5,TILE-5,{fit:'contain',background:'#ffffff'})
    .flatten({background:'#ffffff'}).jpeg({quality:84,mozjpeg:true}).toBuffer();
   layers.push({input:image,left:x+2,top:y+2});
  }
 }
 layers.push({input:svgCaption(size,colour),left:0,top:1195});
 const output=await sharp({create:{width:WIDTH,height:HEIGHT,channels:3,background:'#f2f5fa'}})
  .composite(layers).jpeg({quality:85,mozjpeg:true}).toBuffer();
 if(output.length>4_500_000)throw Error('Maker collage exceeds WhatsApp image size');
 return output;
}
module.exports={makerCollage,normalizePhoto,svgCaption,WIDTH,HEIGHT};
