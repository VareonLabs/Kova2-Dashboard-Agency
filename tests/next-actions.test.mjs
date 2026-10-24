import test from 'node:test';
import assert from 'node:assert/strict';
import {nextActions,todaySummary} from '../public/operations-data.js';

test('Today explains what is waiting on the owner, most urgent first',()=>{
  const projects=[{id:'p',name:'Shop',workflow:'Software'},{id:'q',name:'Admin'}];
  const data={projects,
    deliveryRuns:[{id:'r',projectId:'p',engine:'Claude',status:'Awaiting approval'}],
    deliveryPlans:[{id:'pl',runId:'r',projectId:'p',status:'Proposed',proposedBy:'Claude',items:[{},{}]}],
    tasks:[{id:'a',projectId:'p',ticketKey:'T-1',title:'Form',status:'In review'},{id:'b',projectId:'p',ticketKey:'T-2',title:'QA',status:'Blocked',blockedReason:'Need card test keys'},{id:'c',projectId:'q',title:'Old chore',status:'To do',dueDate:'2020-01-01'},{id:'d',projectId:'p',ticketKey:'T-3',title:'Done one',status:'Done'}],
    ticketEvidence:[{taskId:'a',kind:'Check',title:'Lint',result:'Failed',sequence:1},{taskId:'a',kind:'Review',result:'Passed',recordedBy:'Claude',sequence:2}],
    releases:[{id:'rel',projectId:'p',name:'1.0',status:'Approved',approvedAt:'2026-10-20T00:00:00Z'}],
    standardExceptions:[{projectId:'p',status:'Proposed',title:'Skip staging',proposedBy:'Codex',reason:'Static site'}]};
  const items=nextActions(data,new Date('2026-10-23T00:00:00Z')),titles=items.map(i=>i.title);
  assert.equal(items[0].urgency,1);
  assert.ok(titles.includes('Approve or revise the delivery plan for Shop'));
  assert.ok(titles.includes('Review T-1 Form'),'an assistant’s review never counts as the owner’s');
  assert.ok(titles.some(t=>/Fix failing check on T-1/.test(t)));
  assert.equal(items.find(i=>/Unblock/.test(i.title)).why,'Need card test keys');
  assert.ok(titles.includes('Verify release 1.0 for Shop'));
  assert.ok(titles.some(t=>/exception “Skip staging”/.test(t)));
  assert.ok(titles.includes('1 overdue task'));
  assert.ok(!titles.some(t=>/Done one/.test(t)));
  assert.deepEqual(items.find(i=>/delivery plan/.test(i.title)).target,{project:'p',tab:'delivery'});
  assert.ok(Array.isArray(todaySummary(data).nextActions));
});

test('Today offers template updates for projects built from older versions',()=>{
  const items=nextActions({projects:[{id:'p',name:'Lee Legal project',templateId:'t',templateVersion:1}],templateVersions:[{templateId:'t',number:2,reason:'Add analytics',snapshot:{name:'Website build'}}]});
  assert.equal(items[0].title,'Template update available for Lee Legal project');assert.deepEqual(items[0].target,{project:'p',tab:'overview'});
});
