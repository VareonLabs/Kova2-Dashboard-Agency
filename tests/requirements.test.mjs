import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,approvePrdRevision} from '../server/domain.mjs';
import {createActions} from '../server/actions.mjs';
import {impactedTickets,diffScopes} from '../public/requirements.js';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-req-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});const p=saveRecord(s,'projects',{name:'Software'}),prd=saveRecord(s,'documents',{title:'Checkout PRD',category:'PRD',projectId:p.id,body:'Goals'});return {s,p,prd};}
const req=(s,prd,body,actor)=>saveRecord(s,'requirements',{prdId:prd.id,...body},undefined,actor);

test('requirements get stable per-PRD codes that are never reused',t=>{
  const {s,prd}=fixture(t),a=req(s,prd,{title:'Pay by card'}),b=req(s,prd,{title:'Apply coupon'});
  assert.equal(a.code,'REQ-001');assert.equal(b.code,'REQ-002');assert.equal(a.projectId,prd.projectId);
  deleteRecord(s,'requirements',b.id);assert.equal(req(s,prd,{title:'Gift cards'}).code,'REQ-003');
  assert.equal(saveRecord(s,'requirements',{title:'Pay by card or wallet',code:'REQ-999'},a.id).code,'REQ-001');
  const other=saveRecord(s,'documents',{title:'Other PRD',category:'PRD',projectId:prd.projectId});
  assert.throws(()=>saveRecord(s,'requirements',{prdId:other.id},a.id),/cannot be moved/);
  assert.equal(req(s,other,{title:'First'}).code,'REQ-001');
});

test('approval freezes scope, needs a reason for amendments and is owner-only',t=>{
  const {s,prd}=fixture(t);
  assert.throws(()=>approvePrdRevision(s,prd.id),/at least one requirement/);
  const a=req(s,prd,{title:'Pay by card',acceptanceCriteria:'Visa and Mastercard'});
  assert.throws(()=>approvePrdRevision(s,prd.id,{},'Claude'),/Only the owner/);
  const r1=approvePrdRevision(s,prd.id);assert.equal(r1.number,1);assert.equal(s.get('documents',prd.id).version,'1.0');
  assert.throws(()=>approvePrdRevision(s,prd.id,{reason:'again'}),/Nothing has changed/);
  saveRecord(s,'requirements',{acceptanceCriteria:'Visa, Mastercard and Amex'},a.id,'Claude');
  assert.equal(s.get('requirements',a.id).lastEditedBy,'Claude');
  assert.equal(r1.snapshot.requirements[0].acceptanceCriteria,'Visa and Mastercard');
  assert.equal(s.get('prdRevisions',r1.id).snapshot.requirements[0].acceptanceCriteria,'Visa and Mastercard');
  assert.throws(()=>approvePrdRevision(s,prd.id,{reason:'  '}),/Explain why/);
  const r2=approvePrdRevision(s,prd.id,{reason:'Client added Amex'});assert.equal(r2.number,2);assert.equal(r2.summary.changed,1);
  assert.throws(()=>saveRecord(s,'prdRevisions',{number:9}),/cannot be edited directly/);
  assert.throws(()=>deleteRecord(s,'prdRevisions',r1.id),/cannot be deleted/);
  assert.throws(()=>deleteRecord(s,'requirements',a.id),/Retire it instead/);
  assert.throws(()=>deleteRecord(s,'documents',prd.id),/Archive it instead/);
  assert.throws(()=>saveRecord(s,'documents',{category:'Other'},prd.id),/must stay a PRD/);
  assert.ok(!createActions(s).descriptors().some(d=>/revision|approve/i.test(d.name)),'no assistant tool approves revisions');
});

test('tickets keep their planned revision and are flagged when linked requirements change',t=>{
  const {s,p,prd}=fixture(t),a=req(s,prd,{title:'Pay by card'}),b=req(s,prd,{title:'Apply coupon'}),r1=approvePrdRevision(s,prd.id);
  const ticket=saveRecord(s,'tasks',{title:'Card form',projectId:p.id,prdId:prd.id,requirementIds:[a.id]}),other=saveRecord(s,'tasks',{title:'Coupon box',projectId:p.id,prdId:prd.id,requirementIds:[b.id]});
  assert.equal(ticket.plannedRevisionId,r1.id);
  assert.throws(()=>saveRecord(s,'tasks',{title:'Bad',projectId:p.id,prdId:prd.id,requirementIds:['missing']}),/linked PRD/);
  saveRecord(s,'requirements',{statement:'Cards and wallets'},a.id);const r2=approvePrdRevision(s,prd.id,{reason:'Wallets in scope'});
  assert.equal(saveRecord(s,'tasks',{title:'Card form v2'},ticket.id).plannedRevisionId,r1.id,'a normal edit does not re-plan');
  const impact=impactedTickets(s.list('tasks'),prd.id,s.list('prdRevisions'),r2);
  assert.deepEqual(impact.map(i=>i.task.title),['Card form v2']);assert.deepEqual(impact[0].affected,[a.id]);
  assert.throws(()=>saveRecord(s,'tasks',{plannedRevisionId:'made-up'},ticket.id),/latest approved/);
  assert.equal(saveRecord(s,'tasks',{plannedRevisionId:r2.id},ticket.id).plannedRevisionId,r2.id);
  assert.equal(impactedTickets(s.list('tasks'),prd.id,s.list('prdRevisions'),r2).length,0);
  assert.equal(saveRecord(s,'tasks',{prdId:'',requirementIds:[a.id]},other.id).requirementIds.length,0);
  assert.doesNotThrow(()=>deleteRecord(s,'requirements',saveRecord(s,'requirements',{prdId:prd.id,title:'Draft only'}).id),'never-approved drafts can be deleted');
});

test('retiring a requirement shows as a change, and drafts never alter the approved revision',()=>{
  const before={body:'A',requirements:[{id:'1',code:'REQ-001',title:'X',statement:'',acceptanceCriteria:'',priority:'Must',status:'Active'}]};
  const after={body:'A',requirements:[{...before.requirements[0],status:'Retired'},{id:'2',code:'REQ-002',title:'Y',statement:'',acceptanceCriteria:'',priority:'Should',status:'Active'}]};
  const d=diffScopes(before,after);assert.equal(d.added.length,1);assert.equal(d.changed[0].fields[0].field,'status');assert.equal(d.empty,false);
  assert.equal(diffScopes(before,before).empty,true);
});
