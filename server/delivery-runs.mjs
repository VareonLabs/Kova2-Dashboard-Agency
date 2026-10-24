import { z } from 'zod';
import { saveRecord } from './domain.mjs';
import { gateProblems, isSoftware, SOFTWARE_FLOW } from '../public/workflow.js';

// AI delivery runs. An assistant reads the approved scope, proposes a plan, and — only after the owner approves
// the plan — works its tickets one at a time through the same server-enforced gates as everyone else.
// Plans and runs are not generic records: assistants change them only through the scoped tools below, and only
// the owner can approve a plan (an HTTP route with no assistant equivalent).
const RUN_ACTIVE=['Planning','Awaiting approval','Running','Awaiting review','Needs attention'];
const latest=(list,key,value)=>list.filter(r=>r[key]===value).sort((a,b)=>b.number-a.number)[0];
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});

function log(store,run,actor,text){const entry={at:new Date().toISOString(),actor,text:String(text).slice(0,2000)};return store.put('deliveryRuns',{...run,log:[...(run.log||[]),entry].slice(-300),lastActivityAt:entry.at});}
function mustRun(store,runId){const run=store.get('deliveryRuns',runId);if(!run)throw new Error('Delivery run not found.');return run;}
const runTickets=(store,run)=>store.list('tasks').filter(t=>t.deliveryRunId===run.id);

export function deliveryContext(store,projectId,runId=''){
  const project=store.get('projects',projectId);if(!project)throw new Error('Project not found.');
  const tasks=store.list('tasks').filter(t=>t.projectId===projectId),evidence=store.list('ticketEvidence').filter(e=>e.projectId===projectId),key=new Map(store.list('tasks').map(t=>[t.id,t.ticketKey||t.title]));
  const prds=store.list('documents').filter(d=>d.category==='PRD'&&d.projectId===projectId).map(prd=>{const revision=latest(store.list('prdRevisions'),'prdId',prd.id);return {title:prd.title,approvedRevision:revision?{number:revision.number,approvedAt:revision.approvedAt,overview:revision.snapshot.body,requirements:revision.snapshot.requirements.filter(r=>r.status!=='Retired').map(({code,title,statement,acceptanceCriteria,priority})=>({code,title,statement,acceptanceCriteria,priority}))}:null};});
  const standard=latest(store.list('standardRevisions'),'projectId',projectId);
  const run=runId?store.get('deliveryRuns',runId):null,plan=run?.planId?store.get('deliveryPlans',run.planId):null;
  return {
    note:'Only approved PRD revisions and the approved engineering standard are agreed scope. Unapproved drafts are not.',
    project:{name:project.name,workflow:project.workflow||'Simple',brief:project.description||''},
    prds,engineeringStandard:standard?{revision:standard.number,...standard.snapshot}:null,
    approvedExceptions:store.list('standardExceptions').filter(e=>e.projectId===projectId&&e.status==='Approved'&&(!e.expiresOn||e.expiresOn>=today())).map(({title,rule,reason,expiresOn})=>({title,rule,reason,expiresOn})),
    repositories:store.list('repositories').filter(r=>r.projectId===projectId).map(r=>({name:`${r.owner}/${r.name}`,verified:!!r.verifiedAt,branch:r.verifiedBranch||r.branch||''})),
    environments:store.list('environments').filter(e=>e.projectId===projectId).map(e=>({name:e.name,kind:e.kind,url:e.url,health:e.health?.status||'Not checked',deployedCommit:e.deployment?.found?e.deployment.sha:''})),
    tickets:tasks.map(t=>{const own=evidence.filter(e=>e.taskId===t.id),next=SOFTWARE_FLOW[SOFTWARE_FLOW.indexOf(t.status)+1];return {id:t.id,key:t.ticketKey,title:t.title,type:t.type||'Task',status:t.status,deliveryRun:t.deliveryRunId===runId?'this run':t.deliveryRunId?'another run':'',parent:t.parentTaskId?key.get(t.parentTaskId):'',dependsOn:(t.dependencyIds||[]).map(id=>key.get(id)),acceptanceCriteria:t.acceptanceCriteria||'',implementationPlan:t.implementationPlan||'',evidence:own.map(e=>`${e.kind} ${e.result}: ${e.title}`).slice(-20),nextStatus:next||'',nextGate:next&&isSoftware(project)?gateProblems(t,next,{evidence,tasks:store.list('tasks')}):[]};}),
    run:run?{id:run.id,status:run.status,goal:run.goal,engine:run.engine,plan:plan?{id:plan.id,number:plan.number,status:plan.status,summary:plan.summary,items:plan.items}:null}:null
  };
}

export function deliveryTools(store){
  const item=z.object({ref:z.string().trim().min(1).max(40),title:z.string().trim().min(1).max(300),type:z.enum(['Epic','Feature','Story','Task','Bug','Spike','Technical debt']).default('Task'),requirementCodes:z.array(z.string().max(20)).max(30).default([]),acceptanceCriteria:z.string().trim().max(5000).default(''),implementationPlan:z.string().trim().max(10000).default(''),priority:z.enum(['High','Medium','Low']).default('Medium'),parentRef:z.string().max(40).default(''),dependsOnRefs:z.array(z.string().max(40)).max(30).default([])});
  return [
    {name:'get_delivery_context',readOnly:true,description:'Read a software project’s approved scope for delivery work: approved PRD revisions and requirements, the approved engineering standard and exceptions, repositories, environments and every ticket with its status, evidence and what its next gate still needs. Read this before planning or resuming a delivery run.',schema:z.object({projectId:z.string(),runId:z.string().optional()}),run:({projectId,runId})=>deliveryContext(store,projectId,runId)},
    {name:'propose_delivery_plan',description:'Propose the implementation plan for a delivery run: a short summary and an ordered list of tickets with local refs, parent and dependency refs, requirement codes from the approved PRD revision, acceptance criteria and an implementation plan for each. Nothing is created until the owner approves the plan. A new proposal replaces an earlier unapproved one.',schema:z.object({runId:z.string(),summary:z.string().trim().min(1).max(4000),items:z.array(item).min(1).max(50)}),run:({runId,summary,items},actor)=>proposePlan(store,runId,{summary,items},actor)},
    {name:'start_delivery_ticket',description:'Move one ticket from this run’s approved plan from Ready to In progress. Only one ticket per run can be in progress, and the normal gates apply (implementation plan, dependencies done).',schema:z.object({runId:z.string(),taskId:z.string()}),run:({runId,taskId},actor)=>startTicket(store,runId,taskId,actor)},
    {name:'submit_delivery_ticket',description:'Move this run’s in-progress ticket to In review once its change and check results are recorded with save_ticketEvidence. The run then waits for the owner’s review.',schema:z.object({runId:z.string(),taskId:z.string()}),run:({runId,taskId},actor)=>submitTicket(store,runId,taskId,actor)},
    {name:'block_delivery_ticket',description:'Mark a ticket in this run as Blocked with the reason and the decision or dependency it needs. Use this instead of guessing when scope, access or a decision is missing.',schema:z.object({runId:z.string(),taskId:z.string(),reason:z.string().trim().min(1).max(2000)}),run:({runId,taskId,reason},actor)=>blockTicket(store,runId,taskId,reason,actor)},
    {name:'report_delivery_progress',description:'Add a short progress note to the delivery run log the owner sees: what was done, what was checked and what is next or blocking.',schema:z.object({runId:z.string(),message:z.string().trim().min(1).max(2000)}),run:({runId,message},actor)=>{const run=mustRun(store,runId);log(store,run,actor,message);return {logged:true};}}
  ];
}

export function proposePlan(store,runId,{summary,items},actor){
  const run=mustRun(store,runId);if(!['Planning','Awaiting approval','Needs attention'].includes(run.status)||run.planId&&store.get('deliveryPlans',run.planId)?.status==='Approved')throw new Error('This run already has an approved plan. Work its tickets instead of proposing a new one.');
  const refs=new Set();for(const i of items){if(refs.has(i.ref))throw new Error(`Plan refs must be unique (${i.ref}).`);refs.add(i.ref);}
  const codes=new Map(store.list('documents').filter(d=>d.category==='PRD'&&d.projectId===run.projectId).flatMap(prd=>{const revision=latest(store.list('prdRevisions'),'prdId',prd.id);return (revision?.snapshot.requirements||[]).filter(r=>r.status!=='Retired').map(r=>[r.code+'@'+prd.id,{...r,prdId:prd.id}]);}));
  const byCode=code=>[...codes.entries()].filter(([k])=>k.split('@')[0]===code).map(([,v])=>v);
  for(const i of items){
    for(const r of [i.parentRef,...i.dependsOnRefs].filter(Boolean))if(!refs.has(r))throw new Error(`${i.ref} refers to ${r}, which is not in this plan.`);
    for(const c of i.requirementCodes)if(!byCode(c).length)throw new Error(`${c} is not an active requirement in an approved PRD revision for this project.`);
    if(new Set(i.requirementCodes.flatMap(c=>byCode(c).map(r=>r.prdId))).size>1)throw new Error(`${i.ref} links requirements from more than one PRD; split it into separate tickets.`);
  }
  const visit=(ref,trail=new Set())=>{if(trail.has(ref))throw new Error(`The plan has a dependency cycle through ${ref}.`);trail.add(ref);const i=items.find(x=>x.ref===ref);for(const next of [i.parentRef,...i.dependsOnRefs].filter(Boolean))visit(next,new Set(trail));};
  for(const i of items)visit(i.ref);
  for(const old of store.list('deliveryPlans').filter(p=>p.runId===runId&&p.status==='Proposed'))store.put('deliveryPlans',{...old,status:'Superseded'});
  const number=store.list('deliveryPlans').filter(p=>p.runId===runId).length+1;
  const plan=store.put('deliveryPlans',{runId,projectId:run.projectId,number,status:'Proposed',summary,items,proposedBy:actor,proposedAt:new Date().toISOString(),createdTickets:{}});
  log(store,{...run,planId:plan.id,status:'Awaiting approval'},actor,`Proposed plan ${number}: ${items.length} tickets. Waiting for the owner’s approval.`);
  return {planId:plan.id,number,status:'Proposed',message:'Plan saved. Stop here: the owner must approve it in the project’s Delivery tab before any ticket is created.'};
}

// Owner only. Creates the plan's tickets in dependency order. Safe to repeat after an interruption: each plan item
// remembers the ticket it created, so nothing is duplicated.
export function approvePlan(store,runId,planId,actor='You'){
  if(actor!=='You')throw new Error('Only the owner can approve a delivery plan.');
  const run=mustRun(store,runId);let plan=store.get('deliveryPlans',planId);
  if(!plan||plan.runId!==runId)throw new Error('Plan not found.');
  if(!['Proposed','Approved'].includes(plan.status))throw new Error(`This plan is ${plan.status.toLowerCase()} and cannot be approved.`);
  if(run.status==='Cancelled')throw new Error('This run was cancelled.');
  plan=store.put('deliveryPlans',{...plan,status:'Approved',approvedBy:actor,approvedAt:plan.approvedAt||new Date().toISOString()});
  const created={...(plan.createdTickets||{})},requirement=code=>store.list('requirements').find(r=>r.projectId===run.projectId&&r.code===code&&r.status!=='Retired'),order=[],seen=new Set();
  const place=ref=>{if(seen.has(ref))return;seen.add(ref);const i=plan.items.find(x=>x.ref===ref);for(const r of [i.parentRef,...i.dependsOnRefs].filter(Boolean))place(r);order.push(i);};
  for(const i of plan.items)place(i.ref);
  for(const i of order){
    if(created[i.ref]&&store.get('tasks',created[i.ref]))continue;
    const reqs=i.requirementCodes.map(requirement).filter(Boolean);
    const task=saveRecord(store,'tasks',{title:i.title,type:i.type,priority:i.priority,projectId:run.projectId,prdId:reqs[0]?.prdId||'',requirementIds:reqs.map(r=>r.id),acceptanceCriteria:i.acceptanceCriteria,implementationPlan:i.implementationPlan,parentTaskId:i.parentRef?created[i.parentRef]:'',dependencyIds:i.dependsOnRefs.map(r=>created[r]).filter(Boolean),status:'Backlog'},undefined,actor);
    store.put('tasks',{...store.get('tasks',task.id),deliveryRunId:runId,planItemRef:i.ref});
    try{saveRecord(store,'tasks',{status:'Ready'},task.id,actor);}catch{}
    created[i.ref]=task.id;store.put('deliveryPlans',{...store.get('deliveryPlans',plan.id),createdTickets:created});
  }
  log(store,{...mustRun(store,runId),status:'Running'},actor,`Approved plan ${plan.number}; ${Object.keys(created).length} tickets are on the board.`);
  return {planId:plan.id,tickets:Object.values(created)};
}

function ownTicket(store,run,taskId){const task=store.get('tasks',taskId);if(!task||task.deliveryRunId!==run.id)throw new Error('That ticket is not part of this delivery run’s approved plan.');return task;}
export function startTicket(store,runId,taskId,actor){
  const run=mustRun(store,runId);if(run.status!=='Running')throw new Error(run.status==='Awaiting review'?'The run is waiting for the owner’s review. Do not start another ticket.':`The run is ${run.status.toLowerCase()}; tickets can only be started while it is running.`);
  const task=ownTicket(store,run,taskId);if(task.status==='In progress')return {taskId,status:task.status,message:'Already in progress.'};
  const other=runTickets(store,run).find(t=>t.status==='In progress'&&t.id!==taskId);if(other)throw new Error(`Finish or block ${other.ticketKey||other.title} first; a run works one ticket at a time.`);
  if(task.status!=='Ready')throw new Error(`Only Ready tickets can be started; this one is ${task.status}.`);
  const saved=saveRecord(store,'tasks',{status:'In progress'},taskId,actor);log(store,run,actor,`Started ${saved.ticketKey} ${saved.title}.`);return {taskId,status:saved.status};
}
export function submitTicket(store,runId,taskId,actor){
  const run=mustRun(store,runId),task=ownTicket(store,run,taskId);if(task.status==='In review')return {taskId,status:task.status};
  const saved=saveRecord(store,'tasks',{status:'In review'},taskId,actor);log(store,{...run,status:'Awaiting review'},actor,`Submitted ${saved.ticketKey} ${saved.title} for review. Waiting for the owner.`);
  return {taskId,status:saved.status,message:'Submitted. Stop and wait: the owner reviews it and records the approval before anything moves on.'};
}
export function blockTicket(store,runId,taskId,reason,actor){
  const run=mustRun(store,runId);ownTicket(store,run,taskId);const saved=saveRecord(store,'tasks',{status:'Blocked',blockedReason:reason},taskId,actor);
  log(store,{...run,status:'Needs attention'},actor,`Blocked ${saved.ticketKey}: ${reason}`);return {taskId,status:saved.status};
}

const runPrompt=(run,resume)=>`You are running VareonHQ delivery run ${run.id} for project ${run.projectId}. Goal from the owner: ${run.goal}
Work only through the dashboard tools and the agency engineering standard. Start by calling get_delivery_context with projectId ${run.projectId} and runId ${run.id}.
${resume?'This is a resumed run. Read the context first and continue from the recorded state; never repeat work, evidence or actions that are already recorded.':''}
If the run has no approved plan: propose one with propose_delivery_plan, using only requirement codes from approved PRD revisions, then stop and tell the owner in plain words that the plan is ready: a “Plan ready for your approval” card with a Review plan button now appears in the assistant panel, on Chat and on Reviews. Do not create tickets yourself.
If the plan is approved: take the next Ready ticket whose dependencies are done, start it with start_delivery_ticket, do the work with your coding tools in your own workspace (use write_preview_file and open_code_preview for anything visual), then record real evidence with save_ticketEvidence: a Change entry pointing at what you produced, and a Check entry for every check you actually ran with its true result. Write an Acceptance entry only for criteria you actually verified. Then call submit_delivery_ticket and stop: the owner reviews before anything moves on.
Never record a passing review or release, never claim a deployment, and never mark anything done. If scope, access or a decision is missing, call block_delivery_ticket with the reason instead of guessing. Report progress with report_delivery_progress.`;

export function createDeliveryRuns(store,assistant){
  const kick=(run,resume)=>{
    const engine=run.engine,conversationId=run.conversationId;
    store.put('deliveryRuns',{...run,lastKickAt:new Date().toISOString(),error:''});
    Promise.resolve().then(()=>assistant.chat(runPrompt(run,resume),engine,{projectId:run.projectId,conversationId,uiContext:{deliveryRunId:run.id}}))
      .then(()=>{const current=store.get('deliveryRuns',run.id);if(current)log(store,current,engine,'The assistant finished this turn.');})
      .catch(error=>{const current=store.get('deliveryRuns',run.id);if(current&&current.status!=='Cancelled')log(store,{...current,status:'Needs attention',error:error.message},engine,'Stopped: '+error.message);});
  };
  const idle=()=>!store.get('assistantState','current')?.busy;
  return {
    start({projectId,engine,goal}){
      const project=store.get('projects',projectId);if(!project)throw new Error('Project not found.');if(!isSoftware(project))throw new Error('Delivery runs need a project using the software workflow.');
      if(!['GPT','Claude','Codex'].includes(engine))throw new Error('Choose GPT, Claude or Codex.');
      const text=String(goal||'').trim();if(!text||text.length>4000)throw new Error('Describe what this run should deliver.');
      if(store.list('deliveryRuns').some(r=>r.projectId===projectId&&RUN_ACTIVE.includes(r.status)))throw new Error('This project already has an active delivery run. Finish, resume or cancel it first.');
      if(!idle())throw new Error('The assistant is busy with another request. Try again when it finishes.');
      const conversation=assistant.conversations.create(engine,projectId,'Delivery: '+text.slice(0,50));
      const settings=store.settings(),model=engine==='GPT'?settings.gptModel:engine==='Claude'?settings.claudeModel:settings.codexModel;
      let run=store.put('deliveryRuns',{projectId,engine,model:model||'default',goal:text,status:'Planning',conversationId:conversation.id,createdBy:'You',log:[]});
      run=log(store,run,'You',`Started a ${engine} delivery run.`);kick(run,false);return run;
    },
    resume(runId){const run=mustRun(store,runId);if(['Complete','Cancelled'].includes(run.status))throw new Error(`This run is ${run.status.toLowerCase()}.`);if(!idle())throw new Error('The assistant is busy with another request. Try again when it finishes.');const plan=run.planId&&store.get('deliveryPlans',run.planId);const next=run.status==='Needs attention'?(plan?.status==='Approved'?'Running':'Planning'):run.status==='Awaiting review'?'Running':run.status;const updated=log(store,{...run,status:next,error:''},'You','Resumed the run.');kick(updated,true);return updated;},
    approve(runId,planId){return approvePlan(store,runId,planId,'You');},
    reject(runId,planId,reason){const run=mustRun(store,runId),plan=store.get('deliveryPlans',planId);if(!plan||plan.runId!==runId||plan.status!=='Proposed')throw new Error('Only a proposed plan can be rejected.');const why=String(reason||'').trim();if(!why)throw new Error('Say what should change in the plan.');store.put('deliveryPlans',{...plan,status:'Rejected',rejectedReason:why,decidedAt:new Date().toISOString()});return log(store,{...run,status:'Planning'},'You',`Rejected plan ${plan.number}: ${why}`);},
    cancel(runId){const run=mustRun(store,runId);if(['Complete','Cancelled'].includes(run.status))return run;const state=store.get('assistantState','current');if(state?.busy&&state.conversationId===run.conversationId)assistant.cancel();return log(store,{...run,status:'Cancelled'},'You','Cancelled the run. Tickets and evidence are kept.');},
    complete(runId){const run=mustRun(store,runId),open=runTickets(store,run).filter(t=>!['Done','Cancelled'].includes(t.status));if(open.length)throw new Error(`${open.length} of this run’s tickets are still open.`);return log(store,{...run,status:'Complete'},'You','Marked the run complete.');}
  };
}
