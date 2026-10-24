import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord} from '../server/domain.mjs';
function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-tickets-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});const p=saveRecord(s,'projects',{name:'Software'}),q=saveRecord(s,'projects',{name:'Other'});return {s,p,q};}
test('PRD-linked tickets persist type, criteria and stable server-issued identifiers',t=>{const {s,p}=fixture(t),prd=saveRecord(s,'documents',{title:'Requirements',category:'PRD',projectId:p.id,version:'1.0',body:'REQ-001: Search'}),ticket=saveRecord(s,'tasks',{title:'Build search',type:'Story',projectId:p.id,prdId:prd.id,requirement:'REQ-001',acceptanceCriteria:'Find matching records'});assert.match(ticket.ticketKey,/^T-/);const updated=saveRecord(s,'tasks',{status:'In progress',ticketKey:'spoof'},ticket.id);assert.equal(updated.ticketKey,ticket.ticketKey);assert.equal(updated.acceptanceCriteria,'Find matching records');assert.equal(updated.prdId,prd.id);});
test('rejects cross-project PRDs, dangling references, cyclic parents and dependencies',t=>{const {s,p,q}=fixture(t),prd=saveRecord(s,'documents',{title:'Requirements',category:'PRD',projectId:q.id});assert.throws(()=>saveRecord(s,'tasks',{title:'Wrong',projectId:p.id,prdId:prd.id}),/PRD/);const a=saveRecord(s,'tasks',{title:'Parent',projectId:p.id}),b=saveRecord(s,'tasks',{title:'Child',projectId:p.id,parentTaskId:a.id});assert.throws(()=>saveRecord(s,'tasks',{dependencyIds:[b.id]},a.id),/cycle/);assert.throws(()=>saveRecord(s,'tasks',{dependencyIds:['missing']},b.id),/same project/);assert.throws(()=>saveRecord(s,'tasks',{projectId:q.id},a.id),/incoming/);assert.throws(()=>deleteRecord(s,'tasks',a.id),/Unlink/);});
test('linked PRDs cannot be deleted or moved and legacy tasks remain editable',t=>{const {s,p,q}=fixture(t),prd=saveRecord(s,'documents',{title:'Requirements',category:'PRD',projectId:p.id}),ticket=saveRecord(s,'tasks',{title:'Work',projectId:p.id,prdId:prd.id});assert.throws(()=>deleteRecord(s,'documents',prd.id),/Unlink/);assert.throws(()=>saveRecord(s,'documents',{projectId:q.id},prd.id),/Unlink/);saveRecord(s,'tasks',{prdId:''},ticket.id);deleteRecord(s,'documents',prd.id);const legacy=s.put('tasks',{title:'Old task',status:'To do'});assert.equal(saveRecord(s,'tasks',{status:'Done'},legacy.id).type,'Task');});

test('ticket keys are unique, never reused and cannot be overwritten by a save',t=>{
  const {s,p}=fixture(t),keys=new Set();
  for(let i=0;i<200;i++)keys.add(saveRecord(s,'tasks',{title:'Ticket '+i,projectId:p.id}).ticketKey);
  assert.equal(keys.size,200);
  const first=s.list('tasks').at(-1),renamed=saveRecord(s,'tasks',{title:'Renamed',ticketKey:'T-FORGED00'},first.id);
  assert.equal(renamed.ticketKey,first.ticketKey);
  deleteRecord(s,'tasks',first.id);
  const next=saveRecord(s,'tasks',{title:'After delete',projectId:p.id});
  assert.notEqual(next.ticketKey,first.ticketKey);
});

test('ticket comments keep their author and ticket, and are removed with the ticket',t=>{
  const {s,p}=fixture(t),ticket=saveRecord(s,'tasks',{title:'Work',projectId:p.id}),other=saveRecord(s,'tasks',{title:'Other',projectId:p.id});
  const mine=saveRecord(s,'ticketComments',{taskId:ticket.id,body:'Owner note',author:'Claude'});
  assert.equal(mine.author,'You');
  const ai=saveRecord(s,'ticketComments',{taskId:ticket.id,body:'Assistant note'},undefined,'Claude');assert.equal(ai.author,'Claude');
  assert.throws(()=>saveRecord(s,'ticketComments',{body:'Rewritten'},mine.id,'Claude'),/Only the author/);
  assert.throws(()=>saveRecord(s,'ticketComments',{taskId:other.id},mine.id),/cannot be moved/);
  assert.throws(()=>saveRecord(s,'ticketComments',{taskId:'missing',body:'x'}),/no longer exists/);
  assert.throws(()=>saveRecord(s,'ticketComments',{taskId:ticket.id,body:'   '}),/Write a comment/);
  assert.throws(()=>deleteRecord(s,'ticketComments',mine.id,'Claude'),/Only the author or the owner/);
  const edited=saveRecord(s,'ticketComments',{body:'Owner note, revised'},mine.id);assert.ok(edited.editedAt);assert.equal(edited.author,'You');
  deleteRecord(s,'ticketComments',ai.id);
  deleteRecord(s,'tasks',ticket.id);
  assert.equal(s.list('ticketComments').filter(c=>c.taskId===ticket.id).length,0);
});

test('ticket attachments must reference stored files and are de-duplicated',t=>{
  const {s,p}=fixture(t),file=s.put('chatFiles',{id:'11111111-1111-4111-8111-111111111111',name:'brief.pdf',size:10,kind:'pdf'});
  assert.throws(()=>saveRecord(s,'tasks',{title:'Work',projectId:p.id,attachmentIds:['22222222-2222-4222-8222-222222222222']}),/no longer exists/);
  const ticket=saveRecord(s,'tasks',{title:'Work',projectId:p.id,attachmentIds:[file.id,file.id]});
  assert.deepEqual(ticket.attachmentIds,[file.id]);
  assert.deepEqual(saveRecord(s,'tasks',{title:'Renamed'},ticket.id).attachmentIds,[file.id]);
});

test('saved views validate their scope and are removed with their project',t=>{
  const {s,p}=fixture(t);
  const view=saveRecord(s,'savedViews',{name:'High bugs',projectId:p.id,filter:{type:'Bug',priority:'High',view:'tree'}});
  assert.equal(view.filter.type,'Bug');assert.equal(view.filter.waiting,false);assert.equal(view.filter.view,'tree');
  assert.throws(()=>saveRecord(s,'savedViews',{name:' ',projectId:p.id}),/Name this view/);
  assert.throws(()=>saveRecord(s,'savedViews',{name:'Ghost',projectId:'missing'}),/no longer exists/);
  assert.throws(()=>saveRecord(s,'savedViews',{name:'Bad',filter:{view:'grid'}}));
  saveRecord(s,'savedViews',{name:'All work',projectId:''});
  deleteRecord(s,'projects',p.id);
  assert.deepEqual(s.list('savedViews').map(v=>v.name),['All work']);
});
