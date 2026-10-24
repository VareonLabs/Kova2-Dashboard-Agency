import { saveRecord } from './domain.mjs';
import { financeSummary } from './finance.mjs';
import { plusDays } from './planning.mjs';
import { brisbaneDay, recordDay } from '../public/operations-data.js';
import { TRIGGERS, ACTIONS, fillTemplate, describeRule, statusField } from '../public/rules.js';

// Rule engine. Runs after every successful save (dashboard, API and assistants alike) and on the scheduler tick for
// time-based triggers. Each firing has a key, so a retried save or restart never repeats an action. Changes made by
// a rule never trigger other rules, which rules out loops.
const ACTOR='Automation';
const SUPPORT_PRIORITY={High:'Urgent',Medium:'Normal',Low:'Low'};
const open=t=>!['Done','Cancelled'].includes(t.status);

function context(store,collection,record,previous){
  const task=collection==='tasks'?record:collection==='ticketEvidence'?store.get('tasks',record.taskId):null;
  const projectId=collection==='projects'?record.id:record.projectId||task?.projectId||'',project=projectId?store.get('projects',projectId):null;
  const clientId=record.clientId||project?.clientId||'',client=clientId?store.get('clients',clientId):null;
  return {task,projectId,clientId,vars:{title:record.title||record.name||'',name:record.name||record.title||'',key:task?.ticketKey||'',status:record[statusField(collection)]||'',project:project?.name||'',client:client?.name||'',company:record.company||''},fields:{...record,toStatus:record[statusField(collection)]||'',fromStatus:previous?.[statusField(collection)]||''}};
}
function matches(rule,fields){
  const t=TRIGGERS[rule.trigger];for(const [k,v] of Object.entries(t.implicit||{}))if(fields[k]!==v)return false;
  return (rule.conditions||[]).every(c=>{const actual=fields[c.field],text=String(actual??'').toLowerCase(),want=String(c.value??'').toLowerCase();
    if(c.op==='is')return text===want;if(c.op==='isNot')return text!==want;if(c.op==='contains')return text.includes(want);if(c.op==='greater')return Number(actual)>Number(c.value);return false;});
}
function plan(rule,collection,ctx){
  return rule.actions.map(a=>{const text=v=>fillTemplate(v,ctx.vars).slice(0,300);
    if(a.type==='createTask')return {type:a.type,summary:`Create task “${text(a.title)}”${a.dueInDays!==''&&a.dueInDays!==undefined?` due ${plusDays(brisbaneDay(),Number(a.dueInDays))}`:''}`};
    if(a.type==='addNote')return {type:a.type,summary:`Add note “${text(a.title)}”`};
    if(a.type==='createSupportRequest')return {type:a.type,summary:ctx.clientId?`Log support request “${text(a.title)}”`:'Skipped: no client'};
    if(a.type==='setPriority')return {type:a.type,summary:ctx.task?`Set ${ctx.vars.key||ctx.vars.title} to ${a.priority} priority`:'Skipped: not a task'};
    if(a.type==='comment')return {type:a.type,summary:ctx.task?`Comment on ${ctx.vars.key||ctx.task.title}`:'Skipped: no ticket'};
    return {type:a.type,summary:`Flag on Today: “${fillTemplate(a.body,ctx.vars).slice(0,200)}”`};
  });
}
function execute(store,rule,collection,record,ctx){
  const results=[],text=(v,n=300)=>fillTemplate(v,ctx.vars).slice(0,n),by=`${ACTOR}: ${rule.name}`;
  for(const a of rule.actions){
    if(a.type==='createTask'){const t=saveRecord(store,'tasks',{title:text(a.title)||'Follow up',projectId:ctx.projectId,clientId:ctx.clientId,priority:a.priority||'Medium',dueDate:a.dueInDays!==''&&a.dueInDays!==undefined?plusDays(brisbaneDay(),Number(a.dueInDays)):'',notes:`Created by the rule “${rule.name}”.`},undefined,by);results.push(`Created task ${t.ticketKey||t.title}`);}
    else if(a.type==='addNote'){const n=saveRecord(store,'notes',{title:text(a.title)||rule.name,body:text(a.body,5000),projectId:ctx.projectId,clientId:ctx.clientId},undefined,by);results.push(`Added note ${n.title}`);}
    else if(a.type==='createSupportRequest'){if(!ctx.clientId){results.push('Skipped support request: no client');continue;}const r=saveRecord(store,'supportRequests',{title:text(a.title)||rule.name,clientId:ctx.clientId,projectId:ctx.projectId,priority:SUPPORT_PRIORITY[a.priority]||'Normal',channel:'Other',notes:`Raised by rule “${rule.name}”.`},undefined,by);results.push(`Logged support request ${r.title}`);}
    else if(a.type==='setPriority'){if(!ctx.task){results.push('Skipped priority: not a task');continue;}saveRecord(store,'tasks',{priority:a.priority},ctx.task.id,by);results.push(`Set priority to ${a.priority}`);}
    else if(a.type==='comment'){if(!ctx.task){results.push('Skipped comment: no ticket');continue;}saveRecord(store,'ticketComments',{taskId:ctx.task.id,body:text(a.body,5000)||rule.name},undefined,by);results.push('Commented on the ticket');}
    else if(a.type==='flag'){store.put('automationAlerts',{ruleId:rule.id,ruleName:rule.name,message:text(a.body,500)||rule.name,collection,recordId:collection==='ticketEvidence'?ctx.task?.id:record.id,recordCollection:collection==='ticketEvidence'?'tasks':collection,projectId:ctx.projectId,dismissed:false});results.push('Flagged on Today');}
  }
  return results;
}
function fire(store,rule,collection,record,previous,key){
  if(store.list('automationRuns').some(r=>r.key===key))return null;
  const ctx=context(store,collection,record,previous),at=new Date().toISOString(),base={ruleId:rule.id,ruleName:rule.name,trigger:rule.trigger,recordCollection:collection,recordId:record.id,recordTitle:record.title||record.name||record.number||'',key,at};
  try{const results=execute(store,rule,collection,record,ctx);return store.put('automationRuns',{...base,status:'Done',results});}
  catch(error){return store.put('automationRuns',{...base,status:'Failed',error:error.message.slice(0,500),results:[]});}
}

export function fireRules(store,collection,previous,record,actor){
  if(String(actor).startsWith(ACTOR))return;
  const created=!previous?.id,sf=statusField(collection),changed=!created&&previous[sf]!==record[sf];
  for(const rule of store.list('automationRules').filter(r=>r.enabled)){
    const t=TRIGGERS[rule.trigger];if(!t||t.collection!==collection)continue;
    if(t.event==='create'&&!created||t.event==='status'&&!changed||t.event==='overdue')continue;
    const ctx=context(store,collection,record,previous);if(!matches(rule,ctx.fields))continue;
    fire(store,rule,collection,record,previous,`${rule.id}:${record.id}:${t.event}:${record[sf]||''}:${record.updatedAt}`);
  }
}

function overdueRecords(store,collection,now){
  const today=brisbaneDay(now);
  if(collection==='tasks')return store.list('tasks').filter(t=>open(t)&&recordDay(t.dueDate)&&recordDay(t.dueDate)<today).map(t=>({record:t,stamp:recordDay(t.dueDate)}));
  if(collection==='supportRequests')return store.list('supportRequests').filter(r=>r.status!=='Resolved'&&r.status!=='Waiting on client'&&r.dueBy&&r.dueBy<today).map(r=>({record:r,stamp:r.dueBy}));
  return financeSummary(store,{now}).invoices.filter(i=>i.state==='Overdue').map(i=>({record:i,stamp:recordDay(i.dueDate)}));
}
export function scanRules(store,now=new Date()){
  let fired=0;
  for(const rule of store.list('automationRules').filter(r=>r.enabled&&TRIGGERS[r.trigger]?.event==='overdue')){
    const collection=TRIGGERS[rule.trigger].collection;
    for(const {record,stamp} of overdueRecords(store,collection,now)){const ctx=context(store,collection,record,null);if(matches(rule,ctx.fields)&&fire(store,rule,collection,record,null,`${rule.id}:${record.id}:overdue:${stamp}`))fired++;}
  }
  return fired;
}

// What the rule would do if its trigger happened now, without writing anything.
export function dryRun(store,ruleId,now=new Date()){
  const rule=store.get('automationRules',ruleId);if(!rule)throw new Error('Rule not found.');
  const t=TRIGGERS[rule.trigger],candidates=t.event==='overdue'?overdueRecords(store,t.collection,now).map(x=>x.record):store.list(t.collection);
  const hits=candidates.map(record=>({record,ctx:context(store,t.collection,record,t.event==='status'?{[statusField(t.collection)]:''}:null)})).filter(x=>matches(rule,x.ctx.fields));
  return {rule:describeRule(rule),event:t.event,total:hits.length,examples:hits.slice(0,20).map(({record,ctx})=>({title:record.title||record.name||record.number||record.id,actions:plan(rule,t.collection,ctx).map(a=>a.summary)})),note:t.event==='overdue'?'These records are overdue now. When the rule is on, each is handled once.':'These existing records already match. The rule only acts when the trigger happens from now on; it never runs on past changes.'};
}

export function validateRule(data,actor){
  const t=TRIGGERS[data.trigger];if(!t)throw new Error('Choose what starts the rule.');
  if(!data.actions.length)throw new Error('Add at least one action.');
  for(const a of data.actions){const spec=ACTIONS[a.type];if(!spec)throw new Error('Choose a valid action.');if(spec.only&&!spec.only.includes(t.collection))throw new Error(`“${spec.label}” only works with tasks and tickets.`);if(a.type==='createTask'&&!String(a.title||'').trim())throw new Error('Give the new task a title.');if(a.type==='createSupportRequest'&&!String(a.title||'').trim())throw new Error('Say what the support request is.');if(a.type==='setPriority'&&!['High','Medium','Low'].includes(a.priority))throw new Error('Choose a priority.');}
  // Assistants can draft rules, but only the owner can switch one on.
  if(actor!=='You')data.enabled=false;
  data.lastEditedBy=actor;
}
