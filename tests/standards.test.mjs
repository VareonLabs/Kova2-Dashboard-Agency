import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,approveStandardRevision} from '../server/domain.mjs';
import {createActions} from '../server/actions.mjs';
import {agencyStandard} from '../public/requirements.js';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-std-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});return {s,p:saveRecord(s,'projects',{name:'Store'})};}

test('one standard per project, owner-approved revisions that freeze its content',t=>{
  const {s,p}=fixture(t),draft=saveRecord(s,'projectStandards',{projectId:p.id,...agencyStandard});
  assert.throws(()=>saveRecord(s,'projectStandards',{projectId:p.id}),/already has/);
  assert.throws(()=>approveStandardRevision(s,p.id,{},'Codex'),/Only the owner/);
  const r1=approveStandardRevision(s,p.id);assert.equal(r1.number,1);
  assert.throws(()=>approveStandardRevision(s,p.id,{reason:'x'}),/Nothing has changed/);
  saveRecord(s,'projectStandards',{definitionOfDone:agencyStandard.definitionOfDone+'\nLighthouse score recorded'},draft.id,'Claude');
  assert.equal(s.get('projectStandards',draft.id).lastEditedBy,'Claude');
  assert.equal(s.get('standardRevisions',r1.id).snapshot.definitionOfDone,agencyStandard.definitionOfDone);
  assert.throws(()=>approveStandardRevision(s,p.id,{reason:' '}),/Explain why/);
  const r2=approveStandardRevision(s,p.id,{reason:'Client wants performance evidence'});assert.deepEqual(r2.changedFields,['definitionOfDone']);
  assert.throws(()=>deleteRecord(s,'projectStandards',draft.id),/approved revisions/);
  assert.throws(()=>saveRecord(s,'standardRevisions',{number:9}),/cannot be edited directly/);
  assert.throws(()=>deleteRecord(s,'projects',p.id),/linked records/);
  assert.ok(!createActions(s).descriptors().some(d=>/standardRevisions|approve/i.test(d.name)));
});

test('a standard needs a definition of done before its first approval',t=>{
  const {s,p}=fixture(t);saveRecord(s,'projectStandards',{projectId:p.id});
  assert.throws(()=>approveStandardRevision(s,p.id),/definition of done/);
});

test('assistants can only propose exceptions; the owner decides and decisions are frozen',t=>{
  const {s,p}=fixture(t);saveRecord(s,'projectStandards',{projectId:p.id,...agencyStandard});approveStandardRevision(s,p.id);
  const proposed=saveRecord(s,'standardExceptions',{projectId:p.id,title:'Skip staging',reason:'Static brochure site',status:'Approved'},undefined,'Claude');
  assert.equal(proposed.status,'Proposed');assert.equal(proposed.proposedBy,'Claude');
  assert.throws(()=>saveRecord(s,'standardExceptions',{status:'Approved'},proposed.id,'Claude'),/Only the owner/);
  assert.throws(()=>saveRecord(s,'standardExceptions',{projectId:p.id,title:'No reason',reason:''}),/Explain why/);
  const approved=saveRecord(s,'standardExceptions',{status:'Approved'},proposed.id);
  assert.equal(approved.decidedBy,'You');assert.equal(approved.standardRevision,1);
  assert.throws(()=>saveRecord(s,'standardExceptions',{reason:'Changed my mind'},approved.id),/only be withdrawn/);
  assert.throws(()=>saveRecord(s,'standardExceptions',{status:'Withdrawn'},approved.id,'Claude'),/only be withdrawn/);
  assert.throws(()=>deleteRecord(s,'standardExceptions',approved.id),/Withdraw/);
  assert.equal(saveRecord(s,'standardExceptions',{status:'Withdrawn'},approved.id).status,'Withdrawn');
  assert.throws(()=>saveRecord(s,'standardExceptions',{status:'Approved'},approved.id),/decided/);
  const own=saveRecord(s,'standardExceptions',{projectId:p.id,title:'Manual QA only',reason:'No CI yet'},undefined,'Codex');
  assert.throws(()=>saveRecord(s,'standardExceptions',{status:'Withdrawn'},own.id,'Claude'),/owner or the proposer/);
  assert.equal(saveRecord(s,'standardExceptions',{status:'Withdrawn'},own.id,'Codex').status,'Withdrawn');
});

test('tickets follow the standard revision they were planned under until re-planned',t=>{
  const {s,p}=fixture(t),draft=saveRecord(s,'projectStandards',{projectId:p.id,...agencyStandard});
  const early=saveRecord(s,'tasks',{title:'Before any standard',projectId:p.id});assert.equal(early.standardRevisionId,'');
  const r1=approveStandardRevision(s,p.id);
  assert.equal(saveRecord(s,'tasks',{title:'Picks up r1'},early.id).standardRevisionId,r1.id);
  const ticket=saveRecord(s,'tasks',{title:'Build',projectId:p.id});assert.equal(ticket.standardRevisionId,r1.id);
  saveRecord(s,'projectStandards',{notes:'Changed'},draft.id);const r2=approveStandardRevision(s,p.id,{reason:'Notes'});
  assert.equal(saveRecord(s,'tasks',{title:'Build v2'},ticket.id).standardRevisionId,r1.id);
  assert.throws(()=>saveRecord(s,'tasks',{standardRevisionId:r1.id+'x'},ticket.id),/latest approved engineering standard/);
  assert.equal(saveRecord(s,'tasks',{standardRevisionId:r2.id},ticket.id).standardRevisionId,r2.id);
});
