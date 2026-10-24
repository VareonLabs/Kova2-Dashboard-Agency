import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,snapshot} from '../server/domain.mjs';
import {teamLoad,weekStart} from '../public/people.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-people-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const NOW=new Date('2026-10-21T02:00:00Z'); // Wednesday 21 Oct, Brisbane

test('weeks start on Monday',()=>{
  assert.equal(weekStart('2026-10-21'),'2026-10-19');
  assert.equal(weekStart('2026-10-25'),'2026-10-19');
  assert.equal(weekStart('2026-10-26'),'2026-10-26');
});

test('team load buckets open ticket hours by week against capacity',t=>{
  const store=fixture(t),project=saveRecord(store,'projects',{name:'Site'});
  const ana=saveRecord(store,'people',{name:'Ana',kind:'Contractor',weeklyHours:20});
  const mk=(title,extra)=>saveRecord(store,'tasks',{title,projectId:project.id,...extra});
  mk('A',{assigneeId:ana.id,estimatedHours:12,dueDate:'2026-10-23'});
  mk('B',{assigneeId:ana.id,estimatedHours:10,scheduledDate:'2026-10-22'});
  mk('C',{assigneeId:ana.id,estimatedHours:5,dueDate:'2026-11-02'});
  mk('D',{assigneeId:ana.id,estimatedHours:3});
  mk('E',{assigneeId:ana.id,estimatedHours:2,dueDate:'2026-10-10'});
  mk('F',{assigneeId:ana.id,estimatedHours:50,dueDate:'2026-10-23',status:'Done'});
  mk('G',{estimatedHours:4,dueDate:'2026-10-27'});
  const load=teamLoad(snapshot(store),{now:NOW});
  assert.deepEqual(load.weeks,['2026-10-19','2026-10-26','2026-11-02','2026-11-09']);
  const row=load.rows[0];
  assert.deepEqual(row.weekly,[22,0,5,0]);
  assert.equal(row.unscheduled,3);
  assert.equal(row.overdue,2);
  assert.equal(row.capacity,20);
  assert.deepEqual(load.unassigned.weekly,[0,4,0,0]);
});

test('inactive people are left out, and assignment rules protect the plan',t=>{
  const store=fixture(t),project=saveRecord(store,'projects',{name:'Site'});
  const ana=saveRecord(store,'people',{name:'Ana'});
  assert.throws(()=>saveRecord(store,'tasks',{title:'X',projectId:project.id,assigneeId:'nobody'}),/existing person/);
  const task=saveRecord(store,'tasks',{title:'X',projectId:project.id,assigneeId:ana.id});
  assert.throws(()=>deleteRecord(store,'people',ana.id),/tickets assigned/);
  saveRecord(store,'people',{status:'Inactive'},ana.id);
  assert.throws(()=>saveRecord(store,'tasks',{title:'Y',projectId:project.id,assigneeId:ana.id}),/inactive/);
  assert.equal(saveRecord(store,'tasks',{notes:'still ok'},task.id).assigneeId,ana.id);
  assert.equal(teamLoad(snapshot(store),{now:NOW}).rows.length,0);
});

test('contacts need a company, one primary per client, and consent that is recorded and sticky',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  assert.throws(()=>saveRecord(store,'clientContacts',{name:'Orphan'}),/client or a prospect/);
  const a=saveRecord(store,'clientContacts',{name:'Ana',email:'ana@harbour.com',clientId:client.id,primary:true});
  const b=saveRecord(store,'clientContacts',{name:'Ben',email:'ben@harbour.com',clientId:client.id,primary:true});
  assert.equal(store.get('clientContacts',a.id).primary,false);
  assert.equal(b.primary,true);
  assert.throws(()=>saveRecord(store,'clientContacts',{name:'Ana 2',email:'ANA@harbour.com',clientId:client.id}),/already a contact/);
  assert.throws(()=>saveRecord(store,'clientContacts',{marketingConsent:'Opted in'},a.id),/how consent to marketing emails was given/);
  const opted=saveRecord(store,'clientContacts',{marketingConsent:'Opted in',consentSource:'Form on harbour.com, 24 Oct'},a.id);
  assert.ok(opted.consentDate);
  saveRecord(store,'clientContacts',{marketingConsent:'Opted out'},a.id);
  assert.throws(()=>saveRecord(store,'clientContacts',{marketingConsent:'Opted in'},a.id),/opted out/);
  assert.equal(saveRecord(store,'clientContacts',{marketingConsent:'Opted in',consentSource:'Re-subscribed by email, 30 Oct'},a.id).marketingConsent,'Opted in');
  assert.throws(()=>deleteRecord(store,'clients',client.id),/linked records|contacts/);
});
