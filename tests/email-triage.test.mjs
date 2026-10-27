import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord} from '../server/domain.mjs';
import {fireRules} from '../server/rules.mjs';
import {createEmailTriage} from '../server/email-triage.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-email-triage-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}

test('enabled inbox workflow drafts one reply and never sends it',async t=>{
  const store=fixture(t);
  saveRecord(store,'automationRules',{name:'Assess new mail',trigger:'email.received',enabled:true,actions:[{type:'triageEmail'}]});
  const received=store.put('emails',{status:'Received',from:'ana@example.com',subject:'New website',body:'Can you tell me the next steps?'});
  fireRules(store,'emails',null,received,'Outlook');
  const worker=createEmailTriage(store,{gpt:async()=>JSON.stringify({category:'Enquiry',summary:'Asks about next steps for a website.',reply:'Hi Ana, thanks for getting in touch. Could you share a little more about the site you have in mind?'})});
  await worker.tick();await worker.tick();
  const triage=store.list('emailTriages')[0],draft=store.get('emails',triage.draftId);
  assert.equal(triage.status,'Complete');assert.equal(draft.status,'Draft');assert.equal(draft.to,'ana@example.com');assert.equal(draft.replyToId,received.id);
  assert.equal(store.list('emails').filter(e=>e.status==='Draft').length,1);
  assert.equal(store.list('approvals').length,0,'draft has not been requested for sending');
});

test('ambiguous or automated mail produces an assessment without a reply',async t=>{
  const store=fixture(t),rule=saveRecord(store,'automationRules',{name:'Assess new mail',trigger:'email.received',enabled:true,actions:[{type:'triageEmail'}]});
  const received=store.put('emails',{status:'Received',from:'no-reply@example.com',subject:'Notice',body:'Automatic notice'});
  fireRules(store,'emails',null,received,'Outlook');
  const worker=createEmailTriage(store,{gpt:async()=>JSON.stringify({category:'Automatic',summary:'A system notice.',reply:'I will reply'})});
  await worker.tick();
  assert.equal(store.list('emailTriages')[0].status,'Complete');assert.equal(store.list('emailTriages')[0].draftId,'');
  assert.equal(store.list('emails').length,1);
  assert.equal(rule.enabled,true);
});

test('a failed assessment stays visible without producing a draft or retrying silently',async t=>{
  const store=fixture(t);
  saveRecord(store,'automationRules',{name:'Assess new mail',trigger:'email.received',enabled:true,actions:[{type:'triageEmail'}]});
  const received=store.put('emails',{status:'Received',from:'ana@example.com',subject:'Question',body:'Hello'});
  fireRules(store,'emails',null,received,'Outlook');
  let calls=0;
  const worker=createEmailTriage(store,{gpt:async()=>{calls++;throw new Error('Sign in to ChatGPT again.');}});
  await worker.tick();await worker.tick();
  assert.equal(calls,1);
  assert.equal(store.list('emailTriages')[0].status,'Failed');
  assert.match(store.list('emailTriages')[0].error,/Sign in/);
  assert.equal(store.list('emails').length,1);
});

test('email follow-up stays pending until owner edits and approves it',async t=>{
  const store=fixture(t),{createReviews}=await import('../server/reviews.mjs'),reviews=createReviews(store);
  saveRecord(store,'automationRules',{name:'Assess new mail',trigger:'email.received',enabled:true,actions:[{type:'triageEmail'}]});
  const received=store.put('emails',{status:'Received',from:'ana@example.com',subject:'Project check-in',body:'Please follow up on the project tomorrow.'});
  fireRules(store,'emails',null,received,'Outlook');
  await createEmailTriage(store,{gpt:async()=>JSON.stringify({category:'Client request',summary:'Asks for a project follow-up.',reply:'',nextAction:{kind:'reminder',title:'Follow up with Ana',details:'Ask about the project.',dueDate:'2026-10-26'}})},reviews).tick();
  const triage=store.list('emailTriages')[0],approval=store.get('approvals',triage.actionReviewId);
  assert.equal(approval.status,'Pending');assert.equal(store.list('tasks').length,0);
  reviews.revise(approval.id,{title:'Check in with Ana',notes:'Ask what she needs next.'});
  const result=await reviews.resolve(approval.id,{approve:true});
  assert.equal(result.status,'Approved');assert.equal(store.list('tasks')[0].title,'Check in with Ana');
});

test('declining an email follow-up does not create a task',async t=>{
  const store=fixture(t),{createReviews}=await import('../server/reviews.mjs'),reviews=createReviews(store);
  saveRecord(store,'automationRules',{name:'Assess new mail',trigger:'email.received',enabled:true,actions:[{type:'triageEmail'}]});
  const received=store.put('emails',{status:'Received',from:'ana@example.com',subject:'Follow-up',body:'Please call me.'});
  fireRules(store,'emails',null,received,'Outlook');
  await createEmailTriage(store,{gpt:async()=>JSON.stringify({category:'Request',summary:'Asks for a call.',reply:'',nextAction:{kind:'task',title:'Call Ana',details:'Discuss request.'}})},reviews).tick();
  await reviews.resolve(store.list('emailTriages')[0].actionReviewId,{approve:false});
  assert.equal(store.list('tasks').length,0);
});
