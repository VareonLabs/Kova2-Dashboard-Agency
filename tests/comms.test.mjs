import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,snapshot,canText} from '../server/domain.mjs';
import {saveRecording,removeRecording,sniffAudio} from '../server/recordings.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-comms-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store};}
const AT='2026-10-24T10:30:00+10:00';
const MP3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(40,1)]);

test('audio is recognised by its bytes, not its name',()=>{
  assert.equal(sniffAudio(MP3),'audio/mpeg');
  assert.equal(sniffAudio(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt ')])),'audio/wav');
  assert.equal(sniffAudio(Buffer.concat([Buffer.alloc(4),Buffer.from('ftypM4A '),Buffer.alloc(8)])),'audio/mp4');
  assert.equal(sniffAudio(Buffer.from('<html>not audio</html>')),'');
  assert.equal(sniffAudio(Buffer.from([0x89,0x50,0x4e,0x47,0,0,0,0])),'');
});

test('a call needs a person, can carry a recording only with the notice confirmed, and cannot pose as Twilio',t=>{
  const {dir,store}=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  assert.throws(()=>saveRecord(store,'calls',{startedAt:AT}),/client or a prospect/);
  assert.throws(()=>saveRecord(store,'calls',{clientId:client.id,startedAt:AT,source:'Twilio'}),/not set up yet/);
  const call=saveRecord(store,'calls',{clientId:client.id,startedAt:AT,durationSeconds:300,summary:'Agreed the new scope'});
  assert.equal(call.direction,'Outgoing');assert.equal(call.source,'Logged by hand');
  const rec=saveRecording(store,dir,{name:'call.mp3',bytes:MP3});
  assert.throws(()=>saveRecord(store,'calls',{recordingId:rec.id},call.id),/told the call was being recorded/);
  const withRec=saveRecord(store,'calls',{recordingId:rec.id,recordingNotice:true},call.id);
  assert.equal(withRec.recordingId,rec.id);
  assert.throws(()=>saveRecord(store,'calls',{recordingId:'nope',recordingNotice:true},call.id),/no longer exists/);
  assert.throws(()=>deleteRecord(store,'clients',client.id),/calls or text messages/);
  assert.ok(existsSync(join(dir,'recordings',rec.id)));
  removeRecording(store,dir,rec.id);
  assert.ok(!existsSync(join(dir,'recordings',rec.id)));
});

test('recordings refuse non-audio and oversize files',t=>{
  const {dir,store}=fixture(t);
  assert.throws(()=>saveRecording(store,dir,{name:'x.mp3',bytes:Buffer.from('hello')}),/MP3, M4A, WAV/);
  assert.throws(()=>saveRecording(store,dir,{name:'x',bytes:Buffer.alloc(0)}),/Choose an audio file/);
});

test('texts can be logged or drafted but never claim to be sent, and opt-outs are respected',t=>{
  const {store}=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  const ana=saveRecord(store,'clientContacts',{name:'Ana',phone:'0412 345 678',clientId:client.id,smsConsent:'Opted in',smsConsentSource:'Said yes on the discovery call, 20 Oct'});
  assert.equal(canText(ana),true);
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:client.id,body:'Hi',at:AT,status:'Sent'}),/only once a phone line is connected/);
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:client.id,body:'Hi',at:AT,status:'Delivered',source:'Twilio'}),/not set up yet|only once/);
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:client.id,body:'',at:AT}),/Write the message/);
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:client.id,direction:'Incoming',body:'Hi',at:AT,status:'Draft'}),/outgoing/);
  assert.equal(saveRecord(store,'smsMessages',{clientId:client.id,contactId:ana.id,body:'Running 10 minutes late',at:AT,status:'Draft'}).status,'Draft');
  assert.equal(saveRecord(store,'smsMessages',{clientId:client.id,contactId:ana.id,body:'Thanks, see you then',direction:'Incoming',status:'Received',at:AT}).status,'Received');
  saveRecord(store,'smsMessages',{clientId:client.id,contactId:ana.id,body:'  STOP ',direction:'Incoming',status:'Received',at:AT});
  const after=store.get('clientContacts',ana.id);
  assert.equal(after.smsConsent,'Opted out');assert.match(after.smsConsentSource,/Replied “STOP”/);
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:client.id,contactId:ana.id,body:'Quick one',at:AT,status:'Draft'}),/opted out of text messages/);
  assert.throws(()=>saveRecord(store,'clientContacts',{smsConsent:'Opted in'},ana.id),/how consent to text messages was given|opted out of text messages/);
  assert.equal(saveRecord(store,'clientContacts',{smsConsent:'Opted in',smsConsentSource:'Re-subscribed by phone, 30 Oct'},ana.id).smsConsent,'Opted in');
  assert.throws(()=>deleteRecord(store,'clientContacts',ana.id),/calls or text messages/);
});

test('contacts must match the person the message is for',t=>{
  const {store}=fixture(t),a=saveRecord(store,'clients',{name:'A'}),b=saveRecord(store,'clients',{name:'B'});
  const contact=saveRecord(store,'clientContacts',{name:'Ben',clientId:b.id});
  assert.throws(()=>saveRecord(store,'smsMessages',{clientId:a.id,contactId:contact.id,body:'Hi',at:AT}),/belongs to someone else/);
  assert.throws(()=>saveRecord(store,'calls',{clientId:a.id,contactId:contact.id,startedAt:AT}),/belongs to someone else/);
});

test('phone lines need an international number and can never be marked connected by hand',t=>{
  const {store}=fixture(t);
  assert.throws(()=>saveRecord(store,'phoneLines',{name:'Main',number:'0412345678'}),/international format/);
  assert.throws(()=>saveRecord(store,'phoneLines',{name:'Main',number:'+61412345678',status:'Connected'}),/only when its sign-in succeeds/);
  assert.equal(saveRecord(store,'phoneLines',{name:'Main',number:'+61412345678'}).status,'Not connected');
  assert.ok(snapshot(store).phoneLines.length===1&&Array.isArray(snapshot(store).calls));
});
