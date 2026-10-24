import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,acceptProposal,snapshot} from '../server/domain.mjs';
import {dealStats} from '../public/deals.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-deals-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}

test('a deal needs a contact, loss needs a reason and a win needs a client',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'}),prospect=saveRecord(store,'prospects',{name:'Dana'});
  assert.throws(()=>saveRecord(store,'deals',{title:'Orphan',value:100}),/client or a prospect/);
  const deal=saveRecord(store,'deals',{title:'Website',prospectId:prospect.id,value:5000});
  assert.equal(deal.stage,'Qualified');
  assert.throws(()=>saveRecord(store,'deals',{stage:'Lost'},deal.id),/why the deal was lost/);
  assert.throws(()=>saveRecord(store,'deals',{stage:'Won'},deal.id),/Convert the prospect/);
  const lost=saveRecord(store,'deals',{stage:'Lost',lostReason:'Budget'},deal.id);
  assert.ok(lost.closedAt);
  const reopened=saveRecord(store,'deals',{stage:'Negotiation'},deal.id);
  assert.equal(reopened.closedAt,'');
  assert.equal(reopened.lostReason,'');
  assert.equal(saveRecord(store,'deals',{clientId:client.id,stage:'Won'},deal.id).stage,'Won');
});

test('sending a proposal moves its deal on, and accepting it wins the deal at the proposal value',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'}),other=saveRecord(store,'clients',{name:'Other'});
  const proposal=saveRecord(store,'proposals',{title:'Site',clientId:client.id,lineItems:[{description:'Build',quantity:1,unitPrice:4200}]});
  assert.throws(()=>saveRecord(store,'deals',{title:'Site',clientId:other.id,proposalId:proposal.id}),/different client/);
  const deal=saveRecord(store,'deals',{title:'Site',clientId:client.id,value:1,proposalId:proposal.id});
  saveRecord(store,'proposals',{status:'Sent'},proposal.id);
  assert.equal(store.get('deals',deal.id).stage,'Proposal sent');
  acceptProposal(store,proposal.id);
  const won=store.get('deals',deal.id);
  assert.equal(won.stage,'Won');
  assert.equal(won.value,4200);
  assert.ok(won.closedAt);
  assert.throws(()=>deleteRecord(store,'clients',client.id),/linked records|deals|proposals/);
  assert.equal(snapshot(store).deals.length,1);
});

test('deal stats weight open deals by stage and count wins this month',()=>{
  const now=new Date('2026-10-24T02:00:00Z');
  const stats=dealStats([
    {stage:'Qualified',value:1000},{stage:'Proposal sent',value:2000},{stage:'Negotiation',value:4000},
    {stage:'Won',value:3000,closedAt:'2026-10-10T00:00:00Z'},{stage:'Won',value:900,closedAt:'2026-09-10T00:00:00Z'},{stage:'Lost',value:500}
  ],now);
  assert.equal(stats.open,3);
  assert.equal(stats.openValue,7000);
  assert.equal(stats.weighted,200+1000+3000);
  assert.equal(stats.wonThisMonth,3000);
  assert.equal(stats.winRate,67);
  assert.equal(dealStats([],now).winRate,null);
});
