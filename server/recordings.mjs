import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

// Call recordings. Kept apart from the media library so they never show up in content pickers.
// The file type is decided from the file's own bytes, never from what the browser says it is.
export const MAX_RECORDING=100*1024*1024;
export function sniffAudio(bytes){
  const head=bytes.subarray(0,16),text=head.toString('latin1');
  if(text.startsWith('ID3')||head.length>1&&head[0]===0xff&&(head[1]&0xe0)===0xe0)return 'audio/mpeg';
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WAVE')return 'audio/wav';
  if(text.slice(4,8)==='ftyp')return 'audio/mp4';
  if(text.startsWith('OggS'))return 'audio/ogg';
  if(text.startsWith('fLaC'))return 'audio/flac';
  if(head.length>=4&&head.readUInt32BE(0)===0x1a45dfa3)return 'audio/webm';
  return '';
}
export function saveRecording(store,directory,{name,bytes}){
  if(!Buffer.isBuffer(bytes)||!bytes.length)throw new Error('Choose an audio file.');
  if(bytes.length>MAX_RECORDING)throw new Error('Choose a recording up to 100 MB.');
  const type=sniffAudio(bytes);
  if(!type)throw new Error('Use an MP3, M4A, WAV, OGG, FLAC or WebM audio file.');
  const id=randomUUID(),folder=resolve(directory,'recordings');
  mkdirSync(folder,{recursive:true,mode:0o700});writeFileSync(resolve(folder,id),bytes,{flag:'wx',mode:0o600});
  const item=store.put('recordings',{id,name:basename(String(name||'Recording')).slice(0,200),contentType:type,size:bytes.length});
  store.log('Added a call recording',typeof name==='string'?'You':'You',id);
  return item;
}
export function removeRecording(store,directory,id){
  if(!id||!/^[a-f0-9-]{36}$/i.test(id))return;
  store.remove('recordings',id);
  try{rmSync(resolve(directory,'recordings',id),{force:true});}catch{/* the record is gone either way */}
}
