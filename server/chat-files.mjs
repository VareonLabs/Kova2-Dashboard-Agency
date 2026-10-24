import {mkdirSync,writeFileSync,readFileSync,lstatSync,realpathSync,constants,openSync,closeSync} from 'node:fs';
import {resolve,dirname,extname,basename,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {Parser} from 'htmlparser2';

export const CHAT_FILE_LIMITS={count:100,totalBytes:25*1024*1024,textCharacters:500000};
const ignored=new Set(['node_modules','.git','.svn','.hg','dist','build','.next','.cache','coverage','.venv','venv','__pycache__']);
export function chatFilePath(value){
  if(typeof value!=='string'||!value||value.length>1000||value.startsWith('/')||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value))throw new Error('Use a valid relative file path.');
  const parts=value.normalize('NFC').split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p.length>255||p.includes(':')))throw new Error('This file path is not supported.');
  if(parts.some(p=>p.startsWith('.')||ignored.has(p)||/^(?:id_(?:rsa|ed25519|ecdsa)|credentials|secrets?)(?:\.|$)/i.test(p))||/\.(?:pem|key|p12|pfx|mobileprovision)$/i.test(value))throw new Error('Hidden, credential and generated files are excluded from chat folders.');
  return parts.join('/');
}
export function chatFileKind(name,bytes){
  const extension=extname(name).toLowerCase(),head=bytes.subarray(0,1024);
  if(extension==='.pdf'&&head.toString().startsWith('%PDF-'))return {kind:'pdf',contentType:'application/pdf'};
  if(extension==='.png'&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {kind:'image',contentType:'image/png'};
  if(['.jpg','.jpeg'].includes(extension)&&head[0]===255&&head[1]===216&&head[2]===255)return {kind:'image',contentType:'image/jpeg'};
  if(extension==='.webp'&&head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP')return {kind:'image',contentType:'image/webp'};
  if(extension==='.gif'&&/^GIF8[79]a/.test(head.toString()))return {kind:'image',contentType:'image/gif'};
  if(['.docx','.xlsx','.pptx'].includes(extension)&&head[0]===80&&head[1]===75)return {kind:'office',contentType:({'.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'})[extension]};
  const textExtensions=new Set(['.txt','.md','.markdown','.csv','.tsv','.json','.jsonl','.js','.mjs','.cjs','.jsx','.ts','.tsx','.html','.htm','.css','.scss','.sass','.less','.xml','.svg','.yaml','.yml','.toml','.ini','.conf','.log','.sql','.py','.rb','.go','.rs','.java','.kt','.swift','.c','.h','.cpp','.hpp','.sh','.zsh','.bash','.vue','.svelte','.astro','.tex','.rtf']);
  if((textExtensions.has(extension)||['Dockerfile','Makefile','LICENSE','README'].includes(basename(name)))&&!head.includes(0)&&!head.includes(0xff))return {kind:'text',contentType:'text/plain'};
  throw new Error('Supported: PDF, DOCX, XLSX, PPTX, PNG, JPEG, GIF, WebP, text and code files.');
}
function xmlText(xml){let text='';new Parser({ontext:value=>text+=value,onclosetag:name=>{if(/(?:^|:)(?:p|row|tr|si)$/.test(name))text+='\n';else if(/(?:^|:)(?:t|v)$/.test(name))text+=' ';}},{xmlMode:true,decodeEntities:true}).end(xml);return text.trim();}
export function officeText(bytes,name){
  let expanded=0;
  const files=unzipSync(new Uint8Array(bytes),{filter:entry=>{const include=/^(?:word\/(?:document|header\d+|footer\d+)\.xml|ppt\/slides\/slide\d+\.xml|xl\/(?:sharedStrings|workbook)\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(entry.name);if(include){expanded+=entry.originalSize;if(entry.originalSize>10000000||expanded>20000000)throw new Error('This document expands beyond the 20 MB reading limit.');}return include;}});
  if(extname(name).toLowerCase()==='.xlsx'){
    if(!files['xl/workbook.xml'])throw new Error('This is not a readable XLSX workbook.');
    const strings=[];let current='',inside=false;
    if(files['xl/sharedStrings.xml'])new Parser({onopentag:name=>{if(name==='si'){inside=true;current='';}},ontext:text=>{if(inside)current+=text;},onclosetag:name=>{if(name==='si'){strings.push(current);inside=false;}}},{xmlMode:true,decodeEntities:true}).end(strFromU8(files['xl/sharedStrings.xml']));
    const sheets=[];new Parser({onopentag:(name,attrs)=>{if(name==='sheet')sheets.push(attrs.name||'Sheet');}},{xmlMode:true,decodeEntities:true}).end(strFromU8(files['xl/workbook.xml']));
    return Object.keys(files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map((path,index)=>{let text=`\nSheet: ${sheets[index]||path}\n`,cell=null,tag='';new Parser({onopentag:(name,attrs)=>{tag=name;if(name==='c')cell={ref:attrs.r||'',type:attrs.t||'',value:'',formula:''};},ontext:value=>{if(cell&&['v','t'].includes(tag))cell.value+=value;if(cell&&tag==='f')cell.formula+=value;},onclosetag:name=>{if(name==='c'&&cell){text+=`${cell.ref}: ${cell.type==='s'?strings[Number(cell.value)]??cell.value:cell.value}${cell.formula?' [formula: '+cell.formula+']':''}\t`;cell=null;}if(name==='row')text+='\n';tag='';}},{xmlMode:true,decodeEntities:true}).end(strFromU8(files[path]));return text;}).join('\n');
  }
  const paths=Object.keys(files).filter(p=>extname(name).toLowerCase()==='.docx'?p.startsWith('word/'):p.startsWith('ppt/')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!paths.length)throw new Error('No document text was found in this Office file.');
  return paths.map(path=>`\n${path}\n${xmlText(strFromU8(files[path]))}`).join('\n');
}
async function pdfText(bytes){
  const {spawn}=await import('node:child_process');
  return new Promise((resolveResult,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=256',resolve(import.meta.dirname,'pdf-text.mjs')],{stdio:['pipe','pipe','ignore'],timeout:20000});const output=[];let length=0;child.stdout.on('data',chunk=>{length+=chunk.length;if(length>4000000)child.kill();else output.push(chunk);});child.on('error',reject);child.stdin.on('error',()=>{});child.on('close',code=>{if(code!==0)return reject(new Error('PDF text extraction unavailable.'));try{resolveResult(JSON.parse(Buffer.concat(output).toString()));}catch(error){reject(error);}});child.stdin.end(bytes);});
}
const publicFile=({id,name,relativePath,groupId,size,kind,contentType,note,textLength,pages})=>({id,name,relativePath,groupId,size,kind,contentType,note,textLength,pages});
export function createChatFiles(store,directory){
  const folder=resolve(directory,'chat-files');mkdirSync(folder,{recursive:true,mode:0o700});
  if(lstatSync(folder).isSymbolicLink())throw new Error('The chat attachment folder must be a real local directory.');
  const blob=(id,suffix='')=>{if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Attachment not found.');const path=resolve(folder,id+suffix);if(lstatSync(path).isSymbolicLink()||!lstatSync(path).isFile()||!realpathSync(path).startsWith(realpathSync(folder)+sep))throw new Error('Unsafe attachment path.');return path;};
  const get=id=>{const file=store.get('chatFiles',id);if(!file)throw new Error('An attached file is no longer available.');return file;};
  function resolveFiles(ids=[]){if(!Array.isArray(ids)||ids.length>CHAT_FILE_LIMITS.count||ids.some(id=>typeof id!=='string'))throw new Error('Attach up to 100 files per message.');const files=[...new Set(ids)].map(id=>get(id));if(files.reduce((n,f)=>n+f.size,0)>CHAT_FILE_LIMITS.totalBytes)throw new Error('Keep the message’s attachments under 25 MB in total.');for(const file of files)blob(file.id);return files.map(publicFile);}
  return {
    get:id=>publicFile(get(id)),resolve:resolveFiles,
    async save({relativePath,groupId,bytes}){
      relativePath=chatFilePath(relativePath);if(!Buffer.isBuffer(bytes)||bytes.length>CHAT_FILE_LIMITS.totalBytes)throw new Error('Choose a file up to 25 MB.');
      if(!/^[a-f0-9-]{36}$/i.test(groupId||''))throw new Error('Choose files again to start a valid attachment group.');
      const group=store.list('chatFiles').filter(f=>f.groupId===groupId);if(group.some(f=>f.relativePath===relativePath))throw new Error('This path is already attached in the selected folder.');if(group.length>=CHAT_FILE_LIMITS.count||group.reduce((n,f)=>n+f.size,0)+bytes.length>CHAT_FILE_LIMITS.totalBytes)throw new Error('Attach up to 100 files and 25 MB per group.');
      const name=basename(relativePath),format=chatFileKind(name,bytes);let text='',note='',pages;
      if(format.kind==='text'){try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Save this text file as UTF-8 before attaching it.');}note='Text ready';}
      if(format.kind==='office'){text=officeText(bytes,name);note='Extracted text · embedded images/charts are not included';}
      if(format.kind==='pdf'){try{const result=await pdfText(bytes);text=result.text;pages=result.pages;note=result.note;}catch{note='PDF visual input available to GPT; text extraction unavailable';}}
      if(format.kind==='image')note='Image ready';
      const originalLength=text.length;text=text.slice(0,CHAT_FILE_LIMITS.textCharacters);if(originalLength>text.length)note+=' · text preview limited to 500,000 characters';
      const id=randomUUID();writeFileSync(resolve(folder,id),bytes,{flag:'wx',mode:0o600});if(format.kind!=='image')writeFileSync(resolve(folder,id+'.txt'),text,{flag:'wx',mode:0o600});
      return publicFile(store.put('chatFiles',{id,name,relativePath,groupId,size:bytes.length,...format,note,textLength:text.length,pages}));
    },
    path:id=>blob(id),
    read(id,offset=0,limit=16000){const file=get(id);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>32000)throw new Error('Choose a valid text range.');const text=file.kind==='image'?'':readFileSync(blob(id,'.txt'),'utf8');return {...publicFile(file),offset,text:text.slice(offset,offset+limit),nextOffset:offset+limit<text.length?offset+limit:null,note:file.note};},
    manifest(files){return files.map(file=>({id:file.id,path:file.relativePath,size:file.size,kind:file.kind,textLength:file.textLength,note:file.note}));},
    parts(files){return files.filter(file=>['image','pdf'].includes(file.kind)).map(file=>file.kind==='image'?{type:'input_image',image_url:`data:${file.contentType};base64,${readFileSync(blob(file.id)).toString('base64')}`,detail:'auto'}:{type:'input_file',filename:file.name,file_data:`data:application/pdf;base64,${readFileSync(blob(file.id)).toString('base64')}`});},
    materialise(files,runId){
      if(!files.length)return [];mkdirSync(resolve(directory,'codex-workspace'),{recursive:true,mode:0o700});if(lstatSync(resolve(directory,'codex-workspace')).isSymbolicLink())throw new Error('Unsafe coding workspace.');
      const root=resolve(directory,'codex-workspace','chat-attachments',runId),workspace=realpathSync(resolve(directory,'codex-workspace'));let parent=workspace;
      for(const part of ['chat-attachments',runId]){parent=resolve(parent,part);mkdirSync(parent,{recursive:true,mode:0o700});if(lstatSync(parent).isSymbolicLink()||!realpathSync(parent).startsWith(workspace+sep))throw new Error('Unsafe coding attachment directory.');}
      return files.map(file=>{const relative=chatFilePath(file.relativePath),target=resolve(root,file.groupId,relative);let parent=root;for(const part of [file.groupId,...relative.split('/').slice(0,-1)]){parent=resolve(parent,part);mkdirSync(parent,{recursive:true,mode:0o700});if(lstatSync(parent).isSymbolicLink())throw new Error('Unsafe coding attachment path.');}
        // A fresh run directory and exclusive writes protect existing work and original files.
        const fd=openSync(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,readFileSync(blob(file.id)));}finally{closeSync(fd);}
        let textPath='';if(['office','pdf'].includes(file.kind)){textPath=resolve(root,file.id+'.extracted.txt');writeFileSync(textPath,readFileSync(blob(file.id,'.txt')),{flag:'wx',mode:0o600});}
        return {...file,path:target,textPath};});
    }
  };
}
