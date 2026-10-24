import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord} from '../server/domain.mjs';
import {publishTemplate,winProspect,templateUpdate,applyTemplateUpdate,parseKickoff} from '../server/templates.mjs';
import {createActions} from '../server/actions.mjs';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-tpl-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});
  const checklist=saveRecord(s,'onboardingTemplates',{name:'Web onboarding',stepsText:'Signed agreement | 0\nDeposit invoice | 2'});
  const template=saveRecord(s,'projectTemplates',{name:'Website build',workflow:'Software',durationDays:42,onboardingTemplateId:checklist.id,createStandard:true,kickoffText:'Epic: Launch website | 0 | Site is live\nStory: Homepage | 7 | Hero and contact form\nKickoff call | 1'});
  const prospect=saveRecord(s,'prospects',{name:'Dana Lee',company:'Lee Legal',email:'dana@lee.example',status:'Proposal'});return {s,checklist,template,prospect};}

test('kickoff lines parse type, offset and criteria, and reject bad lines',()=>{
  assert.deepEqual(parseKickoff('Story: Homepage | 7 | Works')[0],{key:'homepage',type:'Story',title:'Homepage',offset:7,acceptanceCriteria:'Works'});
  assert.equal(parseKickoff('Plain task')[0].type,'Task');
  assert.throws(()=>parseKickoff('Bad | soon'),/days after start/);
});

test('versions are owner-published, immutable and need a reason after the first',t=>{
  const {s,template}=fixture(t);
  assert.throws(()=>publishTemplate(s,template.id,{},'Claude'),/Only the owner/);
  const v1=publishTemplate(s,template.id);assert.equal(v1.number,1);assert.equal(v1.snapshot.kickoff.length,3);assert.equal(v1.snapshot.onboarding.steps.length,2);
  assert.throws(()=>publishTemplate(s,template.id,{reason:'x'}),/Nothing has changed/);
  saveRecord(s,'projectTemplates',{kickoffText:'Epic: Launch website | 0 | Site is live\nStory: Homepage | 7 | Hero and contact form\nKickoff call | 1\nTask: Analytics set up | 10'},template.id,'Claude');
  assert.throws(()=>publishTemplate(s,template.id),/Say what changed/);
  assert.equal(publishTemplate(s,template.id,{reason:'Add analytics'}).number,2);
  assert.throws(()=>saveRecord(s,'templateVersions',{number:9}),/cannot be edited directly/);
  assert.throws(()=>deleteRecord(s,'projectTemplates',template.id),/published versions/);
  assert.ok(!createActions(s).descriptors().some(d=>/publish|win_prospect|handoff/i.test(d.name)));
});

test('a won prospect becomes a client, project, onboarding, kickoff tickets and a draft standard in one step',t=>{
  const {s,template,prospect}=fixture(t),v1=publishTemplate(s,template.id);
  assert.throws(()=>winProspect(s,prospect.id,{versionId:v1.id},'GPT'),/Only the owner/);
  const result=winProspect(s,prospect.id,{versionId:v1.id,startDate:'2026-11-02'});
  const client=s.get('clients',result.clientId),project=s.get('projects',result.projectId),tasks=s.list('tasks').filter(x=>x.projectId===project.id);
  assert.equal(client.name,'Lee Legal');assert.equal(s.get('prospects',prospect.id).status,'Won');assert.equal(s.get('prospects',prospect.id).clientId,client.id);
  assert.equal(project.workflow,'Software');assert.equal(project.dueDate,'2026-12-14');assert.equal(project.templateVersion,1);
  assert.equal(tasks.length,5);assert.ok(tasks.every(x=>x.status==='Backlog'));assert.equal(tasks.find(x=>x.title==='Homepage').dueDate,'2026-11-09');
  assert.equal(s.list('onboardings')[0].taskIds.length,2);assert.equal(s.list('projectStandards').filter(x=>x.projectId===project.id).length,1);
  assert.equal(s.list('standardRevisions').length,0,'the standard is a draft for the owner to approve');
  assert.throws(()=>winProspect(s,prospect.id,{versionId:v1.id}),/already been set up/);
});

test('an interrupted hand-off resumes without duplicating anything',t=>{
  const {s,template,prospect}=fixture(t),v1=publishTemplate(s,template.id);
  const client=saveRecord(s,'clients',{name:'Lee Legal'});s.put('handoffs',{prospectId:prospect.id,status:'In progress',steps:{clientId:client.id},templateVersionId:v1.id});
  const result=winProspect(s,prospect.id,{versionId:v1.id});assert.equal(result.clientId,client.id);assert.equal(s.list('clients').length,1);
  assert.equal(s.list('tasks').length,5);
});

test('newer template versions can be reviewed and applied without touching existing work',t=>{
  const {s,template,prospect}=fixture(t),v1=publishTemplate(s,template.id),{projectId}=winProspect(s,prospect.id,{versionId:v1.id,startDate:'2026-11-02'});
  assert.equal(templateUpdate(s,projectId),null);
  const homepage=s.list('tasks').find(x=>x.title==='Homepage');saveRecord(s,'tasks',{notes:'Client wants video hero'},homepage.id);
  saveRecord(s,'projectTemplates',{kickoffText:'Epic: Launch website | 0 | Site is live\nStory: Homepage | 5 | Hero, video and contact form\nTask: Analytics set up | 10'},template.id);
  const v2=publishTemplate(s,template.id,{reason:'Analytics, drop kickoff call'}),update=templateUpdate(s,projectId);
  assert.deepEqual(update.addKickoff.map(i=>i.title),['Analytics set up']);assert.deepEqual(update.removed,['Kickoff call']);assert.deepEqual(update.changed,['Homepage']);
  assert.throws(()=>applyTemplateUpdate(s,projectId,v2.id,'Codex'),/Only the owner/);
  assert.equal(applyTemplateUpdate(s,projectId,v2.id).added,1);
  const tasks=s.list('tasks').filter(x=>x.projectId===projectId);
  assert.ok(tasks.some(x=>x.title==='Kickoff call'),'removed template items are never deleted from projects');
  assert.equal(s.get('tasks',homepage.id).notes,'Client wants video hero','existing tickets are not rewritten');
  assert.equal(s.get('projects',projectId).templateVersion,2);assert.equal(templateUpdate(s,projectId),null);
  assert.throws(()=>applyTemplateUpdate(s,projectId,v2.id),/no longer current/);
});
