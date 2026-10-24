import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,snapshot} from '../server/domain.mjs';
import {applyListView} from '../public/list-views.js';

test('saved list views persist and reject a condition on the wrong list',t=>{
  const dir=mkdtempSync(join(tmpdir(),'vareon-views-')),store=createStore(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const view=saveRecord(store,'listViews',{name:'Overdue invoices',scope:'invoices',condition:'overdue'});
  assert.equal(snapshot(store).listViews.find(v=>v.id===view.id)?.name,'Overdue invoices');
  assert.throws(()=>saveRecord(store,'listViews',{name:'Wrong',scope:'clients',condition:'overdue'}));
  assert.throws(()=>saveRecord(store,'listViews',{name:'Wrong category',scope:'clients',category:'Policy'}));
});

test('invoice view uses computed overdue status',()=>{
  const records=[{id:'1',state:'Overdue'},{id:'2',state:'Paid'},{id:'3',state:'Outstanding'}];
  assert.deepEqual(applyListView('invoices',records,{condition:'overdue'},{}).map(i=>i.id),['1']);
});

test('document views combine search, category and status',()=>{
  const docs=[{title:'Master services agreement',category:'Contract',status:'Active'},{title:'Old services agreement',category:'Contract',status:'Archived'},{title:'Master brand guide',category:'Brand',status:'Active'}];
  assert.deepEqual(applyListView('documents',docs,{query:'master',category:'Contract',status:'Active'},{}).map(d=>d.title),['Master services agreement']);
});

test('prospect view counts outgoing mail and logged contact, and excludes closed leads',()=>{
  const now=new Date('2026-10-24T00:00:00Z');
  const prospects=[
    {id:'old',email:'old@example.com',status:'Found',createdAt:'2026-10-01T00:00:00Z'},
    {id:'recent',email:'recent@example.com',status:'Found',createdAt:'2026-10-22T00:00:00Z'},
    {id:'emailed',email:'emailed@example.com',status:'Contacted',createdAt:'2026-10-01T00:00:00Z'},
    {id:'logged',email:'logged@example.com',status:'Contacted',createdAt:'2026-10-01T00:00:00Z'},
    {id:'won',email:'won@example.com',status:'Won',createdAt:'2026-10-01T00:00:00Z'}
  ];
  const data={emails:[{status:'Sent',to:'emailed@example.com',sentAt:'2026-10-23T00:00:00Z'}],prospectTouches:[{prospectId:'logged',kind:'Contacted',occurredAt:'2026-10-23T00:00:00Z'}]};
  assert.deepEqual(applyListView('prospects',prospects,{condition:'notContacted7Days'},data,now).map(p=>p.id),['old']);
});
