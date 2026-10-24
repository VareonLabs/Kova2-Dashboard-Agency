import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,acceptProposal} from '../server/domain.mjs';
import {scanRules,dryRun} from '../server/rules.mjs';
import {describeRule,statusField} from '../public/rules.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-flow-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const notes=store=>store.list('notes');

test('deals and contacts use their own stage fields',()=>{
  assert.equal(statusField('deals'),'stage');
  assert.equal(statusField('clientContacts'),'marketingConsent');
  assert.equal(statusField('tasks'),'status');
});

test('a deal-stage rule fires when a deal is moved, and respects its condition',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  saveRecord(store,'automationRules',{name:'Celebrate wins',enabled:true,trigger:'deal.stage',conditions:[{field:'toStatus',op:'is',value:'Won'}],actions:[{type:'addNote',title:'Won {title} for {client}'}]});
  const deal=saveRecord(store,'deals',{title:'Website',clientId:client.id,value:100});
  saveRecord(store,'deals',{stage:'Negotiation'},deal.id);
  assert.equal(notes(store).length,0);
  saveRecord(store,'deals',{stage:'Won'},deal.id);
  assert.equal(notes(store).length,1);
  assert.equal(notes(store)[0].title,'Won Website for Harbour Co');
  assert.match(describeRule(store.list('automationRules')[0]),/a deal changes stage, if new stage is “Won”/);
});

test('accepting a proposal sets off the deal and proposal rules',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  saveRecord(store,'automationRules',{name:'Deal won',enabled:true,trigger:'deal.stage',conditions:[{field:'toStatus',op:'is',value:'Won'}],actions:[{type:'addNote',title:'Deal won'}]});
  saveRecord(store,'automationRules',{name:'Proposal accepted',enabled:true,trigger:'proposal.status',conditions:[{field:'toStatus',op:'is',value:'Accepted'}],actions:[{type:'addNote',title:'Proposal accepted'}]});
  const proposal=saveRecord(store,'proposals',{title:'Site',clientId:client.id,lineItems:[{description:'Build',quantity:1,unitPrice:500}]});
  saveRecord(store,'deals',{title:'Site',clientId:client.id,proposalId:proposal.id});
  acceptProposal(store,proposal.id);
  assert.deepEqual(notes(store).map(n=>n.title).sort(),['Deal won','Proposal accepted']);
});

test('a rule can log a support request for the client, mapping priority',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  assert.throws(()=>saveRecord(store,'automationRules',{name:'Bad',trigger:'deal.created',actions:[{type:'createSupportRequest',title:''}]}),/support request is/);
  saveRecord(store,'automationRules',{name:'Onboard',enabled:true,trigger:'deal.created',actions:[{type:'createSupportRequest',title:'Welcome {client}',priority:'High'}]});
  saveRecord(store,'deals',{title:'D',clientId:client.id});
  const [request]=store.list('supportRequests');
  assert.equal(request.title,'Welcome Harbour Co');
  assert.equal(request.priority,'Urgent');
  assert.equal(request.clientId,client.id);
  const prospect=saveRecord(store,'prospects',{name:'Dana'});
  saveRecord(store,'deals',{title:'No client yet',prospectId:prospect.id});
  assert.equal(store.list('supportRequests').length,1);
  assert.match(store.list('automationRuns').at(0).results.join(' '),/Skipped support request: no client/);
});

test('overdue support requests fire once, and waiting-on-client ones do not',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  saveRecord(store,'automationRules',{name:'Escalate',enabled:true,trigger:'support.overdue',actions:[{type:'flag',body:'{title} is overdue'}]});
  saveRecord(store,'supportRequests',{title:'Late',clientId:client.id,priority:'Urgent',reportedOn:'2026-10-01'});
  saveRecord(store,'supportRequests',{title:'Paused',clientId:client.id,priority:'Urgent',reportedOn:'2026-10-01',status:'Waiting on client'});
  saveRecord(store,'supportRequests',{title:'Fresh',clientId:client.id,priority:'Low',reportedOn:'2026-10-23'});
  const now=new Date('2026-10-24T02:00:00Z');
  assert.equal(scanRules(store,now),1);
  assert.equal(scanRules(store,now),0);
  assert.equal(store.list('automationAlerts')[0].message,'Late is overdue');
  const rule=store.list('automationRules')[0];
  assert.equal(dryRun(store,rule.id,now).total,1);
});

test('a consent change can be watched',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  saveRecord(store,'automationRules',{name:'Opt-out',enabled:true,trigger:'consent.changed',conditions:[{field:'toStatus',op:'is',value:'Opted out'}],actions:[{type:'flag',body:'{title} opted out'}]});
  const contact=saveRecord(store,'clientContacts',{name:'Ana',clientId:client.id,marketingConsent:'Opted in',consentSource:'Form'});
  assert.equal(store.list('automationAlerts').length,0);
  saveRecord(store,'clientContacts',{marketingConsent:'Opted out'},contact.id);
  assert.equal(store.list('automationAlerts').length,1);
});
