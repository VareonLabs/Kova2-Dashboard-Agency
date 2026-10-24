import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,approvePrdRevision} from '../server/domain.mjs';
import {createActions} from '../server/actions.mjs';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-wf-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});const p=saveRecord(s,'projects',{name:'App',workflow:'Software'});return {s,p,actions:createActions(s)};}
const ev=(s,task,kind,body={},actor)=>saveRecord(s,'ticketEvidence',{taskId:task.id,kind,title:body.title||kind,...body},undefined,actor);
const move=(s,task,status,extra={},actor)=>saveRecord(s,'tasks',{status,...extra},task.id,actor);

test('simple projects keep the original statuses and are not gated',t=>{
  const {s}=fixture(t),simple=saveRecord(s,'projects',{name:'Agency'}),task=saveRecord(s,'tasks',{title:'Call client',projectId:simple.id});
  assert.equal(task.status,'To do');assert.equal(move(s,task,'Done').status,'Done');
  assert.throws(()=>move(s,task,'Ready'),/only used in projects with the software workflow/);
});

test('a software ticket moves forward only when each gate has its evidence',t=>{
  const {s,p}=fixture(t);let task=saveRecord(s,'tasks',{title:'Checkout',projectId:p.id});
  assert.equal(task.status,'Backlog','the To do default becomes Backlog');
  assert.throws(()=>move(s,task,'Ready'),/acceptance criteria/);
  task=move(s,task,'Ready',{acceptanceCriteria:'Card payment succeeds'});
  assert.throws(()=>move(s,task,'In progress'),/implementation plan/);
  task=move(s,task,'In progress',{implementationPlan:'Stripe test mode form'});
  assert.throws(()=>move(s,task,'In review'),/reviewable change.*check result/);
  assert.throws(()=>ev(s,task,'Change'),/link or reference/);
  ev(s,task,'Change',{reference:'PR #12'});ev(s,task,'Check',{title:'Unit tests',result:'Failed'});
  assert.throws(()=>move(s,task,'In review'),/Failing checks must pass.*Unit tests/);
  ev(s,task,'Check',{title:'unit tests',result:'Passed'});
  task=move(s,task,'In review');
  assert.throws(()=>ev(s,task,'Review',{result:'Passed'},'Claude'),/Only the owner/);
  ev(s,task,'Review',{result:'Failed',details:'Rename the button'},'Claude');
  assert.throws(()=>move(s,task,'QA / staging'),/latest review requested changes/);
  ev(s,task,'Review',{result:'Passed'});
  task=move(s,task,'QA / staging');
  assert.throws(()=>move(s,task,'Ready for release'),/acceptance criteria verified/);
  ev(s,task,'Acceptance',{result:'Passed'},'Codex');
  task=move(s,task,'Ready for release');
  assert.throws(()=>move(s,task,'Done'),/your verification/);
  assert.throws(()=>ev(s,task,'Release',{result:'Passed',reference:'v1.2'},'Codex'),/Only the owner/);
  ev(s,task,'Release',{result:'Passed',reference:'Delivered build v1.2'});
  task=move(s,task,'Done');assert.ok(task.completedAt);
  assert.equal(move(s,task,'In progress').status,'In progress','moving back needs no evidence');
});

test('skipping ahead must meet every gate on the way, and Blocked/Cancelled need reasons',t=>{
  const {s,p}=fixture(t),task=saveRecord(s,'tasks',{title:'Jump',projectId:p.id,acceptanceCriteria:'x'});
  assert.throws(()=>move(s,task,'Done'),/implementation plan.*reviewable change.*review approval.*acceptance.*verification/s);
  assert.throws(()=>saveRecord(s,'tasks',{title:'Born done',projectId:p.id,status:'Done'}),/Can’t move to Done/);
  assert.throws(()=>move(s,task,'Blocked'),/why it is blocked/);
  const blocked=move(s,task,'Blocked',{blockedReason:'Waiting on client API keys'});
  assert.throws(()=>move(s,blocked,'In progress'),/implementation plan/,'leaving Blocked re-checks the gates');
  assert.throws(()=>move(s,task,'Cancelled'),/why it was cancelled/);
  assert.equal(move(s,task,'Cancelled',{cancelReason:'Client dropped feature'}).status,'Cancelled');
  assert.throws(()=>move(s,task,'To do'),/isn’t used in software projects/);
});

test('stories need a linked requirement and unfinished dependencies hold work back',t=>{
  const {s,p}=fixture(t),prd=saveRecord(s,'documents',{title:'PRD',category:'PRD',projectId:p.id}),req=saveRecord(s,'requirements',{prdId:prd.id,title:'Pay'});approvePrdRevision(s,prd.id);
  const dep=saveRecord(s,'tasks',{title:'API',projectId:p.id});
  const story=saveRecord(s,'tasks',{title:'Form',type:'Story',projectId:p.id,acceptanceCriteria:'Works',implementationPlan:'Plan',dependencyIds:[dep.id]});
  assert.throws(()=>move(s,story,'Ready'),/linked PRD requirement/);
  const linked=move(s,story,'Ready',{prdId:prd.id,requirementIds:[req.id]});
  assert.throws(()=>move(s,linked,'In progress'),/dependencies done first/);
  ev(s,linked,'Acceptance',{result:'Passed',requirementIds:[req.id]});
  assert.throws(()=>ev(s,dep,'Acceptance',{result:'Passed',requirementIds:[req.id]}),/linked to this ticket/);
});

test('evidence is permanent, keeps the revisions in force, and protects its ticket',t=>{
  const {s,p}=fixture(t),task=saveRecord(s,'tasks',{title:'Keep',projectId:p.id}),e=ev(s,task,'Check',{title:'Lint',result:'Failed'},'Codex');
  assert.equal(e.recordedBy,'Codex');assert.equal(e.ticketStatus,'Backlog');assert.ok(e.recordedAt);
  assert.throws(()=>saveRecord(s,'ticketEvidence',{result:'Passed'},e.id),/permanent/);
  assert.throws(()=>deleteRecord(s,'ticketEvidence',e.id),/cannot be deleted/);
  assert.throws(()=>deleteRecord(s,'tasks',task.id),/Cancel it instead/);
  assert.throws(()=>ev(s,task,'Check',{title:'No result'}),/passed or failed/);
});

test('assistant tools and card moves hit the same gates',async t=>{
  const {s,p,actions}=fixture(t),task=saveRecord(s,'tasks',{title:'AI work',projectId:p.id});
  await assert.rejects(actions.execute('move_card',{collection:'tasks',id:task.id,status:'Done'},'Claude'),/Can’t move to Done/);
  await assert.rejects(actions.execute('save_tasks',{id:task.id,record:{status:'In review'}},'GPT'),/Can’t move to In review/);
  await assert.rejects(actions.execute('save_ticketEvidence',{record:{taskId:task.id,kind:'Release',title:'Shipped',result:'Passed',reference:'prod'}},'Claude'),/Only the owner/);
  const ok=await actions.execute('save_ticketEvidence',{record:{taskId:task.id,kind:'Check',title:'Build',result:'Passed'}},'Claude');assert.equal(ok.recordedBy,'Claude');
});

test('switching a project between workflows migrates safely',t=>{
  const {s}=fixture(t),proj=saveRecord(s,'projects',{name:'Was simple'}),todo=saveRecord(s,'tasks',{title:'Open',projectId:proj.id}),done=saveRecord(s,'tasks',{title:'Old done',projectId:proj.id,status:'Done'});
  saveRecord(s,'projects',{workflow:'Software'},proj.id);
  assert.equal(s.get('tasks',todo.id).status,'Backlog');assert.equal(s.get('tasks',done.id).status,'Done','history is kept');
  saveRecord(s,'tasks',{acceptanceCriteria:'x',status:'Ready'},todo.id);
  assert.throws(()=>saveRecord(s,'projects',{workflow:'Simple'},proj.id),/Move tickets out of Ready/);
});
