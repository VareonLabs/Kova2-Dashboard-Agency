import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve,basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
export function saveMedia(store,directory,{name,type,role='Image',bytes}){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>100*1024*1024)throw new Error('Choose a media file up to 100 MB.');
  const head=bytes.subarray(0,32),text=head.toString();
  const valid=type==='image/png'&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||type==='image/jpeg'&&head[0]===255&&head[1]===216&&head[2]===255||type==='image/gif'&&/^GIF8[79]a/.test(text)||type==='image/webp'&&text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'||['video/mp4','video/quicktime'].includes(type)&&text.slice(4,8)==='ftyp'||type==='video/webm'&&head.length>=4&&head.readUInt32BE(0)===0x1a45dfa3;
  if(type==='image/svg+xml'){
    if(bytes.length>2000000||!bytes.toString().includes('<svg'))throw new Error('Use an SVG under 2 MB.');
    const svg=sanitizeHtml(bytes.toString(),{allowedTags:['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','mask','title','desc'],allowedAttributes:{'*':['xmlns','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','clip-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','transform','opacity','offset','stop-color','stop-opacity','id','clip-path','mask','gradientUnits','gradientTransform']},parser:{lowerCaseTags:false,lowerCaseAttributeNames:false},allowedSchemes:[],transformTags:{'*':(tag,attrs)=>({tagName:tag,attribs:Object.fromEntries(Object.entries(attrs).filter(([,v])=>!/(?:https?:|data:|javascript:|url\((?!#))/i.test(v)||v==='http://www.w3.org/2000/svg'))})}});
    if(!svg.includes('<svg'))throw new Error('Invalid SVG logo');bytes=Buffer.from(svg);
  }else if(!valid)throw new Error('Use a PNG, JPEG, GIF, WebP, SVG, MP4, MOV or WebM file with a matching file type.');
  const id=randomUUID(),folder=resolve(directory,'media');mkdirSync(folder,{recursive:true,mode:0o700});writeFileSync(resolve(folder,id),bytes,{flag:'wx',mode:0o600});
  const item=store.put('media',{id,name:basename(name||'Media').slice(0,200),contentType:type,size:bytes.length,role:type.startsWith('video/')?'Video':role==='Logo'?'Logo':'Image'});store.emit('ui',{action:'records_changed',collection:'media',id});store.log('Uploaded media: '+item.name);return item;
}
