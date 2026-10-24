import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { saveRecord, deleteRecord } from '../server/domain.mjs';
import { createActions } from '../server/actions.mjs';
import { createScheduler } from '../server/scheduler.mjs';
import { createAssistant } from '../server/assistant.mjs';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-test-'));const store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,dir};}
test('linked business records persist across a second connection and protect references',t=>{
  const {store,dir}=fixture(t);const client=saveRecord(store,'clients',{name:'Test client',email:'test@example.com'});
  const project=saveRecord(store,'projects',{name:'Test project',clientId:client.id,startDate:'2026-10-01',dueDate:'2026-11-01'});
  saveRecord(store,'tasks',{title:'Deliver work',projectId:project.id});
  assert.throws(()=>deleteRecord(store,'clients',client.id),/linked records/);
  assert.throws(()=>saveRecord(store,'tasks',{title:'Bad reference',projectId:'missing'}),/no longer exists/);
  assert.throws(()=>saveRecord(store,'projects',{name:'Bad dates',startDate:'2026-12-01',dueDate:'2026-11-01'}),/end date/);
  const second=createStore(dir);assert.equal(second.list('clients')[0].name,'Test client');second.close();
});
test('AI actions queue an exact email draft for review without sending',async t=>{
  const {store}=fixture(t);const actions=createActions(store);const email=await actions.execute('save_emails',{record:{subject:'Hello',to:'test@example.com',body:'A draft'}});
  const request=await actions.execute('request_email_send',{emailId:email.id});
  assert.equal(request.status,'Pending');assert.equal(request.payload.body,'A draft');assert.equal(store.get('emails',email.id).status,'Draft');
  assert.equal((await actions.execute('request_email_send',{emailId:email.id})).id,request.id);
  await assert.rejects(()=>actions.execute('send_email',{emailId:email.id}),/Unknown/);
});
test('posts cannot claim to have been published through a record edit',t=>{
  const {store}=fixture(t);assert.throws(()=>saveRecord(store,'posts',{title:'Post',status:'Published'}),/publishing service/);
  assert.throws(()=>saveRecord(store,'posts',{title:'Post',status:'Scheduled'}),/scheduled time/);
});
test('scheduler claims once, records results, and catches up recurring jobs only once',async t=>{
  const {store}=fixture(t);let count=0;const assistant={gpt:async()=>{count++;return 'Result';},codex:async()=>{throw new Error('Not signed in');}};
  const scheduler=createScheduler(store,assistant);
  const once=saveRecord(store,'automations',{name:'One-time',prompt:'Test',nextRun:new Date(Date.now()-1000).toISOString()});
  const daily=saveRecord(store,'automations',{name:'Daily',prompt:'Test',frequency:'Daily',nextRun:'2020-01-01T00:00:00Z'});
  await Promise.all([scheduler.tick(),scheduler.tick()]);await scheduler.tick();
  assert.equal(count,2);assert.equal(store.get('automations',once.id).enabled,false);assert.ok(Date.parse(store.get('automations',daily.id).nextRun)>Date.now());
  const failed=saveRecord(store,'automations',{name:'Failure',prompt:'Test',engine:'Codex',nextRun:new Date(Date.now()-1000).toISOString()});
  await scheduler.tick();assert.equal(store.get('automations',failed.id).lastError,'Not signed in');assert.equal(store.list('runs').filter(r=>r.status==='Failed').length,1);
});
test('GPT executes validated actions and reports the result using Responses tool continuation',async t=>{
  const{store,dir}=fixture(t);const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-key';let n=0;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);n++;if(n===1)return Response.json({output:[{type:'function_call',name:'save_clients',call_id:'call_1',arguments:JSON.stringify({record:{name:'From GPT'}})}]});assert.ok(body.input.some(i=>i.type==='function_call_output'&&JSON.parse(i.output).name==='From GPT'));return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Client created.'}]}]});};
  t.after(()=>{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;});
  const assistant=createAssistant(store,createActions(store),dir,{chatgpt:{accessToken:async()=>'test-oauth-token',models:async()=>[{slug:'test-model'}]}});assert.equal(await assistant.gpt('Add a client'),'Client created.');assert.equal(store.list('clients')[0].name,'From GPT');
});
