import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,acceptProposal,proposalTotal,proposalValue,snapshot} from '../server/domain.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-proposal-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
function setup(store){
  const client=saveRecord(store,'clients',{name:'Harbour Co'});
  const service=saveRecord(store,'services',{name:'Brand website',unitPrice:4800});
  const proposal=saveRecord(store,'proposals',{title:'Harbour website',clientId:client.id,lineItems:[{serviceId:service.id,description:'Brand website',quantity:1,unitPrice:4800},{description:'Copywriting',quantity:3,unitPrice:150.5}]});
  return {client,service,proposal};
}

test('proposal totals add quantity times price in cents',t=>{
  const {proposal}=setup(fixture(t));
  assert.equal(proposalTotal(proposal),5251.5);
});

test('accepting raises one draft agreement, locks the scope and cannot repeat',t=>{
  const store=fixture(t),{proposal}=setup(store);
  assert.throws(()=>saveRecord(store,'proposals',{status:'Accepted'},proposal.id),/Use Accept proposal/);
  assert.throws(()=>acceptProposal(store,proposal.id,'Claude'),/Only the owner/);
  const {proposal:accepted,contract}=acceptProposal(store,proposal.id);
  assert.equal(accepted.status,'Accepted');
  assert.equal(accepted.contractId,contract.id);
  assert.equal(contract.value,5251.5);
  assert.equal(contract.proposalId,proposal.id);
  assert.equal(contract.status,'Draft');
  assert.throws(()=>acceptProposal(store,proposal.id),/already accepted/);
  assert.throws(()=>saveRecord(store,'proposals',{lineItems:[]},proposal.id),/locked/);
  assert.throws(()=>deleteRecord(store,'proposals',proposal.id),/cannot be deleted/);
});

test('variations only attach to accepted proposals and decisions are permanent',t=>{
  const store=fixture(t),{proposal}=setup(store);
  assert.throws(()=>saveRecord(store,'variations',{proposalId:proposal.id,title:'Extra page',amountChange:600}),/accepted proposals/);
  acceptProposal(store,proposal.id);
  const v=saveRecord(store,'variations',{proposalId:proposal.id,title:'Extra page',amountChange:600});
  assert.equal(proposalValue(store,store.get('proposals',proposal.id)),5251.5);
  assert.throws(()=>saveRecord(store,'variations',{status:'Approved'},v.id,'Claude'),/Only the owner/);
  saveRecord(store,'variations',{status:'Approved'},v.id);
  assert.equal(proposalValue(store,store.get('proposals',proposal.id)),5851.5);
  assert.throws(()=>saveRecord(store,'variations',{amountChange:1},v.id),/permanent/);
});

test('a service used in a proposal is kept; drafts need a client and lines to send',t=>{
  const store=fixture(t),{client,service}=setup(store);
  assert.throws(()=>deleteRecord(store,'services',service.id),/inactive/);
  assert.throws(()=>saveRecord(store,'proposals',{title:'Empty',clientId:client.id,status:'Sent'}),/at least one line/);
  assert.throws(()=>saveRecord(store,'proposals',{title:'No client'}),/client/i);
  assert.ok(snapshot(store).proposals.length>=1);
});

test('a signed agreement raises a draft deposit invoice once, and work waits for payment',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'}),project=saveRecord(store,'projects',{name:'Site',clientId:client.id});
  const contract=saveRecord(store,'contracts',{title:'Harbour agreement',clientId:client.id,projectId:project.id,value:5000,depositPercent:20,status:'Sent'});
  const ticket=saveRecord(store,'tasks',{title:'Build homepage',projectId:project.id});
  assert.throws(()=>saveRecord(store,'tasks',{status:'In progress'},ticket.id),/signed and its 20% deposit/);
  const signed=saveRecord(store,'contracts',{status:'Signed'},contract.id);
  const invoice=store.get('invoices',signed.depositInvoiceId);
  assert.equal(invoice.amount,1000);
  assert.equal(invoice.status,'Draft');
  assert.equal(invoice.contractId,contract.id);
  saveRecord(store,'contracts',{notes:'resaved'},contract.id);
  assert.equal(store.list('invoices').length,1);
  assert.throws(()=>saveRecord(store,'contracts',{depositPercent:50},contract.id),/already been raised/);
  assert.throws(()=>saveRecord(store,'tasks',{status:'In progress'},ticket.id),/deposit for “Harbour agreement” is paid/);
  saveRecord(store,'invoices',{status:'Issued',number:'INV-1',issuedDate:'2026-10-24',dueDate:'2026-11-07'},invoice.id);
  assert.throws(()=>saveRecord(store,'tasks',{status:'In progress'},ticket.id),/is paid/);
  saveRecord(store,'payments',{invoiceId:invoice.id,amount:400,paidDate:'2026-10-25'});
  assert.throws(()=>saveRecord(store,'tasks',{status:'In progress'},ticket.id),/is paid/);
  saveRecord(store,'payments',{invoiceId:invoice.id,amount:600,paidDate:'2026-10-26'});
  assert.equal(saveRecord(store,'tasks',{status:'In progress'},ticket.id).status,'In progress');
});

test('only the owner can waive a deposit, and a waiver releases the hold',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'}),project=saveRecord(store,'projects',{name:'Site',clientId:client.id});
  const contract=saveRecord(store,'contracts',{title:'Retainer',clientId:client.id,projectId:project.id,value:1000,depositPercent:50,status:'Signed'});
  const ticket=saveRecord(store,'tasks',{title:'Kick off',projectId:project.id});
  assert.throws(()=>saveRecord(store,'contracts',{depositWaived:true},contract.id,'Claude'),/Only the owner/);
  assert.throws(()=>saveRecord(store,'tasks',{status:'In progress'},ticket.id),/on hold/);
  saveRecord(store,'contracts',{depositWaived:true},contract.id);
  assert.equal(saveRecord(store,'tasks',{status:'In progress'},ticket.id).status,'In progress');
});

test('accepting a proposal carries its deposit percentage onto the agreement',t=>{
  const store=fixture(t),{proposal}=setup(store);
  saveRecord(store,'proposals',{depositPercent:25},proposal.id);
  assert.equal(acceptProposal(store,proposal.id).contract.depositPercent,25);
});

test('the client workspace carries proposals, variations and retainers for the timeline',async t=>{
  const {clientWorkspace}=await import('../public/operations-data.js');
  const store=fixture(t),{client,proposal}=setup(store);
  acceptProposal(store,proposal.id);
  saveRecord(store,'variations',{proposalId:proposal.id,title:'Extra page',amountChange:600});
  saveRecord(store,'retainers',{name:'Care plan',clientId:client.id,monthlyAmount:250,startDate:'2026-10-01'});
  const w=clientWorkspace(snapshot(store),client.id);
  assert.equal(w.proposals.length,1);
  assert.equal(w.variations.length,1);
  assert.equal(w.retainers.length,1);
});
