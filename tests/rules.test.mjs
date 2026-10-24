import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord} from '../server/domain.mjs';
import {scanRules,dryRun} from '../server/rules.mjs';
import {describeRule} from '../public/rules.js';
import {createActions} from '../server/actions.mjs';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-rules-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});const c=saveRecord(s,'clients',{name:'Lee Legal'}),p=saveRecord(s,'projects',{name:'Site',clientId:c.id});return {s,c,p};}
const blockedRule={name:'Escalate blocked',enabled:true,trigger:'task.status',conditions:[{field:'toStatus',op:'is',value:'Blocked'}],actions:[{type:'createTask',title:'Unblock {title} for {client}',dueInDays:1,priority:'High'},{type:'flag',body:'{title} is blocked'}]};

test('rules read as plain language',()=>{
  assert.equal(describeRule(blockedRule),'When a task or ticket changes status, if new status is “Blocked”, then create a task “Unblock {title} for {client}” due in 1 day, then flag it for me on today: “{title} is blocked”.');
});

test('a status rule fires once with filled templates and never chains into other rules',t=>{
  const {s,c,p}=fixture(t);saveRecord(s,'automationRules',blockedRule);
  saveRecord(s,'automationRules',{name:'Any new task',enabled:true,trigger:'task.created',actions:[{type:'addNote',title:'New task {title}'}]});
  const task=saveRecord(s,'tasks',{title:'Homepage',projectId:p.id,clientId:c.id});
  assert.equal(s.list('notes').length,1,'creating a task fired the create rule');
  saveRecord(s,'tasks',{status:'Blocked'},task.id);
  const created=s.list('tasks').find(x=>x.title==='Unblock Homepage for Lee Legal');
  assert.ok(created);assert.equal(created.priority,'High');assert.equal(created.projectId,p.id);
  assert.equal(s.list('notes').length,1,'a task created by a rule does not trigger other rules');
  assert.equal(s.list('automationAlerts').length,1);assert.equal(s.list('automationRuns').filter(r=>r.status==='Done').length,2);
  saveRecord(s,'tasks',{notes:'still blocked'},task.id);assert.equal(s.list('tasks').filter(x=>x.title.startsWith('Unblock')).length,1,'other edits do not re-fire');
});

test('conditions filter, and disabled rules do nothing',t=>{
  const {s,p}=fixture(t);saveRecord(s,'automationRules',{...blockedRule,conditions:[{field:'toStatus',op:'is',value:'Blocked'},{field:'priority',op:'is',value:'High'}]});
  saveRecord(s,'automationRules',{...blockedRule,name:'Off',enabled:false});
  const low=saveRecord(s,'tasks',{title:'Low one',projectId:p.id,priority:'Low'});saveRecord(s,'tasks',{status:'Blocked'},low.id);
  assert.equal(s.list('tasks').length,1);
});

test('overdue rules fire once per due date from the scheduler',t=>{
  const {s,p}=fixture(t);saveRecord(s,'automationRules',{name:'Chase overdue',enabled:true,trigger:'task.overdue',actions:[{type:'comment',body:'This is overdue'}]});
  saveRecord(s,'tasks',{title:'Late',projectId:p.id,dueDate:'2026-01-01'});
  assert.equal(scanRules(s),1);assert.equal(scanRules(s),0,'the next tick does not repeat it');
  assert.equal(s.list('ticketComments').length,1);assert.equal(s.list('ticketComments')[0].author,'Automation: Chase overdue');
});

test('assistants can draft rules but cannot switch them on',async t=>{
  const {s}=fixture(t),actions=createActions(s);
  const rule=await actions.execute('save_automationRules',{record:{...blockedRule,enabled:true}},'Claude');assert.equal(rule.enabled,false);
  const on=saveRecord(s,'automationRules',{enabled:true},rule.id);assert.equal(on.enabled,true);
  assert.equal((await actions.execute('save_automationRules',{id:rule.id,record:{name:'Renamed'}},'GPT')).enabled,false,'an assistant edit switches it off for review');
  assert.throws(()=>saveRecord(s,'automationRules',{name:'Bad',trigger:'invoice.overdue',actions:[{type:'setPriority',priority:'High'}]}),/only works with tasks/);
  assert.throws(()=>saveRecord(s,'automationRules',{name:'Bad',trigger:'task.status',conditions:[{field:'amount',op:'is',value:'1'}],actions:[{type:'flag',body:'x'}]}),/doesn’t apply/);
  assert.throws(()=>saveRecord(s,'automationRules',{name:'Empty',trigger:'task.created'}),/at least one action/);
});

test('a dry run shows what would happen without writing anything',t=>{
  const {s,p}=fixture(t);saveRecord(s,'tasks',{title:'Late',projectId:p.id,dueDate:'2026-01-01'});
  const rule=saveRecord(s,'automationRules',{name:'Chase',enabled:false,trigger:'task.overdue',actions:[{type:'createTask',title:'Chase {title}',dueInDays:0}]});
  const before=s.list('tasks').length,result=dryRun(s,rule.id);
  assert.equal(result.total,1);assert.match(result.examples[0].actions[0],/Create task “Chase Late”/);assert.equal(s.list('tasks').length,before);assert.equal(s.list('automationRuns').length,0);
});
