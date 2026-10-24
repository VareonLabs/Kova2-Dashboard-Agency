import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,unbilledTime,invoiceUnbilledTime,invoiceRetainer,retainerUsage,snapshot} from '../server/domain.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-retainer-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
function setup(store){
  const client=saveRecord(store,'clients',{name:'Harbour Co'}),project=saveRecord(store,'projects',{name:'Site',clientId:client.id});
  const entry=(title,minutes,billRate,extra={})=>saveRecord(store,'timeEntries',{title,projectId:project.id,date:'2026-10-12',minutes,billRate,...extra});
  return {client,project,entry};
}

test('unbilled time lists priced entries and flags those with no rate',t=>{
  const store=fixture(t),{client,entry}=setup(store);
  entry('Design',90,120);entry('Call',30,0);entry('Internal',60,120,{billable:false});
  const u=unbilledTime(store,client.id);
  assert.equal(u.ready.length,1);
  assert.equal(u.noRate.length,1);
  assert.equal(u.value,180);
});

test('invoicing unbilled time raises one draft invoice, locks the entries and releases them on void',t=>{
  const store=fixture(t),{client,entry}=setup(store);
  const a=entry('Design',90,120),b=entry('Build',45,100);
  assert.throws(()=>invoiceUnbilledTime(store,client.id,'Claude'),/Only the owner/);
  const invoice=invoiceUnbilledTime(store,client.id);
  assert.equal(invoice.amount,255);
  assert.equal(invoice.status,'Draft');
  assert.equal(store.get('timeEntries',a.id).invoiceId,invoice.id);
  assert.throws(()=>invoiceUnbilledTime(store,client.id),/no billable time/);
  assert.throws(()=>saveRecord(store,'timeEntries',{minutes:200},a.id),/on an invoice/);
  assert.throws(()=>deleteRecord(store,'timeEntries',b.id),/on an invoice/);
  saveRecord(store,'invoices',{status:'Void'},invoice.id);
  assert.equal(store.get('timeEntries',a.id).invoiceId,'');
  assert.equal(unbilledTime(store,client.id).ready.length,2);
});

test('deleting a draft time invoice frees its entries',t=>{
  const store=fixture(t),{client,entry}=setup(store);
  const a=entry('Design',60,100);
  const invoice=invoiceUnbilledTime(store,client.id);
  deleteRecord(store,'invoices',invoice.id);
  assert.equal(store.get('timeEntries',a.id).invoiceId,'');
});

test('a retainer invoices each month once and reports hours against the allowance',t=>{
  const store=fixture(t),{client,entry}=setup(store);
  const retainer=saveRecord(store,'retainers',{name:'Care plan',clientId:client.id,monthlyAmount:900,includedHours:1,startDate:'2026-09-01'});
  entry('Fixes',90,0);
  const use=retainerUsage(store,retainer,'2026-10');
  assert.equal(use.hours,1.5);
  assert.equal(use.over,true);
  const {invoice,retainer:after}=invoiceRetainer(store,retainer.id,'2026-10');
  assert.equal(invoice.amount,900);
  assert.match(invoice.title,/October 2026/);
  assert.deepEqual(after.invoicedMonths,['2026-10']);
  assert.throws(()=>invoiceRetainer(store,retainer.id,'2026-10'),/already been invoiced/);
  assert.throws(()=>invoiceRetainer(store,retainer.id,'2026-08'),/outside this retainer/);
  assert.throws(()=>saveRecord(store,'retainers',{invoicedMonths:[]},retainer.id),/set by raising the invoice/);
  assert.throws(()=>invoiceRetainer(store,retainer.id,'2026-11','Claude'),/Only the owner/);
  saveRecord(store,'retainers',{status:'Paused'},retainer.id);
  assert.throws(()=>invoiceRetainer(store,retainer.id,'2026-11'),/active retainers/);
  assert.equal(snapshot(store).retainers.length,1);
});
