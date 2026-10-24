import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,snapshot} from '../server/domain.mjs';
import {supportState,handoverProgress} from '../public/service-desk.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-desk-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}

test('assets must belong to the client, never hold a password, and stamp the handover date',t=>{
  const store=fixture(t),a=saveRecord(store,'clients',{name:'A'}),b=saveRecord(store,'clients',{name:'B'}),project=saveRecord(store,'projects',{name:'Site',clientId:b.id});
  assert.throws(()=>saveRecord(store,'clientAssets',{name:'Domain',clientId:a.id,projectId:project.id}),/different client/);
  assert.throws(()=>saveRecord(store,'clientAssets',{name:'Hosting',clientId:a.id,accessNote:'password: hunter2'}),/never the password/);
  for(const ok of ['1Password: Clients vault','LastPass folder: Acme','Bitwarden collection: Web'])saveRecord(store,'clientAssets',{name:'Probe',clientId:a.id,accessNote:ok});
  for(const bad of ['Password = abc','api key: sk-123','token:xyz'])assert.throws(()=>saveRecord(store,'clientAssets',{name:'Probe',clientId:a.id,accessNote:bad}),/never the password/);
  const asset=saveRecord(store,'clientAssets',{name:'Domain',kind:'Domain',clientId:a.id,accessNote:'1Password vault “Clients”'});
  assert.equal(asset.status,'Agency-held');
  const done=saveRecord(store,'clientAssets',{status:'Handed over'},asset.id);
  assert.match(done.handoverDate,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(saveRecord(store,'clientAssets',{status:'Agency-held'},asset.id).handoverDate,'');
  assert.throws(()=>deleteRecord(store,'clients',a.id),/assets or support/);
});

test('handover progress ignores assets that do not apply',()=>{
  const p=handoverProgress([{status:'Handed over'},{status:'Agency-held'},{status:'Not applicable'}]);
  assert.deepEqual(p,{total:2,done:1,remaining:1,complete:false});
  assert.equal(handoverProgress([{status:'Handed over'}]).complete,true);
  assert.equal(handoverProgress([]).complete,false);
});

test('support requests get a due date from priority and track resolution',t=>{
  const store=fixture(t),c=saveRecord(store,'clients',{name:'A'});
  const urgent=saveRecord(store,'supportRequests',{title:'Site down',clientId:c.id,priority:'Urgent',reportedOn:'2026-10-20'});
  assert.equal(urgent.dueBy,'2026-10-21');
  assert.equal(saveRecord(store,'supportRequests',{title:'Typo',clientId:c.id,priority:'Low',reportedOn:'2026-10-20'}).dueBy,'2026-10-27');
  assert.equal(supportState(urgent,'2026-10-20'),'On track');
  assert.equal(supportState(urgent,'2026-10-21'),'Due today');
  assert.equal(supportState(urgent,'2026-10-22'),'Overdue');
  assert.equal(supportState({...urgent,status:'Waiting on client'},'2026-10-22'),'Waiting');
  const done=saveRecord(store,'supportRequests',{status:'Resolved'},urgent.id);
  assert.ok(done.resolvedAt);
  assert.equal(supportState(done,'2026-10-30'),'Resolved');
  assert.equal(saveRecord(store,'supportRequests',{status:'In progress'},urgent.id).resolvedAt,'');
  assert.throws(()=>saveRecord(store,'supportRequests',{title:'X',clientId:c.id,assigneeId:'nobody'}),/existing person/);
  assert.equal(snapshot(store).supportRequests.length,2);
});
