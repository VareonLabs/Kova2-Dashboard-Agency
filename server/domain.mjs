import {randomUUID} from 'node:crypto';
import { z } from 'zod';
import { cleanEmailHTML } from './email-html.mjs';
import { scopeOf, diffScopes, standardOf, diffStandards } from '../public/requirements.js';
import { TRIGGERS, FIELDS, OPS, ACTIONS } from '../public/rules.js';
import { fireRules, validateRule } from './rules.mjs';
import { ALL_STATUSES, EVIDENCE_KINDS, OWNER_ONLY_PASSES, gateProblems, isSoftware, statusesFor } from '../public/workflow.js';

const text = z.string().trim().max(20000);
const name = z.string().trim().min(1).max(300);
const optional = text.optional().default('');
const money=z.coerce.number().finite().min(0).max(1e10).refine(v=>Math.abs(v*100-Math.round(v*100))<0.0001,'Use at most two decimal places');
const web=z.union([z.literal(''),z.url().refine(v=>/^https?:/.test(v))]).optional().default('');
const realDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const ref = z.string().max(100).optional().default('');
const date = z.string().refine(v => !v || !Number.isNaN(Date.parse(v)), 'Choose a valid date').optional().default('');
export const schemas = {
  onboardingTemplates:z.object({name,stepsText:z.string().trim().min(1).max(20000),notes:optional}),
  renewals:z.object({name,kind:z.enum(['Contract','Domain','Subscription','Policy','Other']).default('Other'),date:z.string().refine(realDay,'Choose a valid renewal date'),everyMonths:z.coerce.number().int().min(0).max(120).default(12),leadDays:z.coerce.number().int().min(0).max(365).default(30),amount:money.default(0),clientId:ref,projectId:ref,url:web,status:z.enum(['Active','Complete']).default('Active'),notes:optional}),
  timeEntries:z.object({title:name,projectId:z.string().min(1),clientId:ref,date:z.string().refine(realDay,'Choose a valid work date'),minutes:z.coerce.number().int().min(1).max(1440),hourlyCost:money.default(0),billable:z.boolean().default(true),notes:optional}),
  meetingNotes:z.object({title:name,clientId:ref,projectId:ref,date:z.string().refine(realDay,'Choose a valid meeting date'),transcript:z.string().max(100000).default(''),notes:optional}),
  meetings:z.object({title:name,clientId:ref,projectId:ref,startAt:z.string().datetime({offset:true}),endAt:z.string().datetime({offset:true}),kind:z.enum(['Meeting','Focus']).default('Meeting'),notes:optional}),
  forecastItems:z.object({title:name,kind:z.enum(['Income','Expense']),amount:money,date:z.string().refine(realDay,'Choose a valid date'),frequency:z.enum(['Once','Weekly','Monthly']).default('Once'),endDate:z.string().refine(v=>!v||realDay(v),'Choose a valid end date').default(''),clientId:ref,projectId:ref,notes:optional,enabled:z.boolean().default(true)}),
  reportSchedules:z.object({name,clientId:z.string().min(1),frequency:z.enum(['Weekly','Monthly']),nextRun:z.string().datetime({offset:true}),enabled:z.boolean().default(true)}),
  websites:z.object({name,url:z.url().refine(v=>/^https?:/.test(v)),clientId:ref,ga4PropertyId:z.string().regex(/^\d*$|^$/).max(30).default(''),searchConsoleSite:z.string().max(1000).refine(v=>!v||/^sc-domain:[a-z0-9.-]+$/i.test(v)||/^https?:\/\//.test(v),'Use a Search Console property URL or sc-domain property').default('')}),
  clients: z.object({ name, company: optional, email: z.union([z.literal(''), z.email()]).optional().default(''), phone: optional, status: z.enum(['Lead','Active','Past']).default('Lead'), notes: optional }),
  projects: z.object({ name, clientId: ref, status: z.enum(['Planning','Active','On hold','Complete']).default('Planning'),workflow:z.enum(['Simple','Software']).default('Simple'), startDate: date, dueDate: date, description: optional,budget:money.default(0),plannedCost:money.default(0) }),
  tasks: z.object({ type:z.enum(['Task','Epic','Feature','Story','Bug','Spike','Technical debt']).default('Task'),prdId:ref,parentTaskId:ref,dependencyIds:z.array(z.string()).max(100).default([]),acceptanceCriteria:optional,requirement:optional,title: name, projectId: ref, clientId: ref, status: z.enum(ALL_STATUSES).default('To do'),implementationPlan:optional,blockedReason:optional,cancelReason:optional, priority: z.enum(['Low','Medium','High']).default('Medium'), dueDate: date,scheduledDate:date,estimatedHours:z.coerce.number().min(0).max(2000).default(0),notes: optional,attachmentIds:z.array(z.string().max(100)).max(50).default([]),requirementIds:z.array(z.string().max(100)).max(100).default([]),plannedRevisionId:ref,standardRevisionId:ref }),
  projectStandards:z.object({projectId:z.string().min(1).max(100),baseVersion:z.string().trim().max(80).default('Agency standard 1.0'),definitionOfDone:optional,repositoryConventions:optional,reviewPolicy:optional,notes:optional}),
  standardExceptions:z.object({projectId:z.string().min(1).max(100),title:name,rule:optional,reason:z.string().trim().min(1,'Explain why this exception is needed').max(4000),expiresOn:date,status:z.enum(['Proposed','Approved','Rejected','Withdrawn']).default('Proposed')}),
  requirements:z.object({prdId:z.string().min(1).max(100),title:name,statement:optional,acceptanceCriteria:optional,priority:z.enum(['Must','Should','Could','Won’t']).default('Must'),status:z.enum(['Active','Retired']).default('Active')}),
  savedViews:z.object({name:z.string().trim().min(1,'Name this view').max(80),scope:z.enum(['tickets']).default('tickets'),projectId:ref,filter:z.object({q:z.string().max(200).default(''),type:z.string().max(40).default(''),priority:z.string().max(20).default(''),status:z.string().max(40).default(''),project:z.string().max(100).default(''),waiting:z.boolean().default(false),view:z.enum(['board','tree']).default('board')}).default({})}),
  ticketEvidence:z.object({taskId:z.string().min(1).max(100),kind:z.enum(EVIDENCE_KINDS),title:name,result:z.enum(['Passed','Failed','Info']).default('Info'),reference:z.string().trim().max(2000).optional().default(''),environment:z.string().trim().max(200).optional().default(''),details:optional,requirementIds:z.array(z.string().max(100)).max(100).default([]),sourceProvider:z.string().max(40).optional().default(''),sourceId:z.string().max(300).optional().default('')}),
  repositories:z.object({projectId:z.string().min(1).max(100),provider:z.enum(['GitHub']).default('GitHub'),owner:z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}$/,'Use the GitHub owner or organisation name'),name:z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}$/,'Use the repository name'),branch:z.string().trim().max(200).default('')}),
  ticketLinks:z.object({taskId:z.string().min(1).max(100),repositoryId:z.string().min(1).max(100),kind:z.enum(['Pull request','Branch','Commit']),ref:z.string().trim().min(1,'Add the pull request number, branch name or commit').max(200)}),
  environments:z.object({projectId:z.string().min(1).max(100),name,kind:z.enum(['Local','Preview','Staging','Production']).default('Preview'),url:web,provider:z.enum(['GitHub','Vercel','AWS','Other']).default('Other'),providerId:optional,owner:optional,repositoryId:ref,githubEnvironment:z.string().trim().max(200).optional().default(''),notes:optional}),
  releases:z.object({projectId:z.string().min(1).max(100),name,environmentId:ref,ticketIds:z.array(z.string().max(100)).max(200).default([]),commit:z.string().trim().max(40).optional().default(''),changelog:optional,migrations:optional,rollbackReference:optional,notes:optional,status:z.enum(['Draft','Approved','Released','Failed','Rolled back']).default('Draft')}),
  projectTemplates:z.object({name,description:optional,workflow:z.enum(['Simple','Software']).default('Simple'),durationDays:z.coerce.number().int().min(0).max(730).default(30),onboardingTemplateId:ref,kickoffText:z.string().max(20000).optional().default(''),createStandard:z.boolean().default(false),notes:optional}),
  automationRules:z.object({name,enabled:z.boolean().default(false),trigger:z.enum(Object.keys(TRIGGERS)),conditions:z.array(z.object({field:z.string().max(40),op:z.enum(Object.keys(OPS)),value:z.string().max(300)})).max(10).default([]),actions:z.array(z.object({type:z.enum(Object.keys(ACTIONS)),title:z.string().max(300).default(''),body:z.string().max(5000).default(''),dueInDays:z.union([z.literal(''),z.coerce.number().int().min(0).max(365)]).default(''),priority:z.enum(['','High','Medium','Low']).default('')})).max(5).default([])}),
  ticketComments:z.object({taskId:z.string().min(1).max(100),body:z.string().trim().min(1,'Write a comment first').max(10000)}),
  contracts: z.object({ title: name, clientId: ref, projectId: ref, status: z.enum(['Not sent','Draft','Sent','Awaiting signature','Signed','Declined','Expired']).default('Draft'), value: z.coerce.number().min(0).max(1e10).default(0), dueDate: date, renewalDate:date, documentUrl: z.union([z.literal(''), z.url().refine(v=>/^https?:/.test(v))]).optional().default(''), notes: optional }),
  posts: z.object({ title: name, platform: z.enum(['Instagram','LinkedIn','X']).default('LinkedIn'), format: z.enum(['Post','Carousel']).default('Post'), status: z.enum(['Idea','Draft','In review','Ready','Scheduled','Published','Failed']).default('Draft'), content: optional, slides: z.array(text).max(20).default([]), mediaUrls:z.array(z.url().refine(url=>url.startsWith('https://'))).max(20).default([]),mediaIds:z.array(z.string()).max(30).default([]),scheduledAt: date, clientId: ref,projectId:ref }),
  notes:z.object({title:name,body:optional,projectId:ref,clientId:ref,pinned:z.boolean().default(false)}),
  emails: z.object({ to: z.union([z.literal(''),z.email()]).optional().default(''), cc:z.array(z.email()).max(50).default([]),bcc:z.array(z.email()).max(50).default([]),subject: name, body: optional,bodyHtml:z.string().max(4000000).optional().default(''),attachmentIds:z.array(z.string()).max(10).default([]),prospectId:ref,importance:z.enum(['low','normal','high']).default('normal'),clientId: ref, replyToId: ref, status: z.enum(['Draft']).default('Draft') }),
  prospects:z.object({name,company:optional,email:z.union([z.literal(''),z.email()]).optional().default(''),phone:optional,website:web,source:optional,sourceUrl:web,status:z.enum(['Found','Researching','Contacted','Qualified','Proposal','Won','Lost']).default('Found'),estimatedValue:money.default(0),followUpDate:date,followUpAfterDays:z.coerce.number().int().min(1).max(90).default(7),followUpPaused:z.boolean().default(false),notes:optional,clientId:ref}),
  invoices:z.object({title:name,number:optional,clientId:ref,projectId:ref,amount:money,status:z.enum(['Draft','Issued','Void']).default('Draft'),issuedDate:date,dueDate:date,followUpDate:date,notes:optional}),
  payments:z.object({invoiceId:z.string().min(1),amount:money.refine(v=>v>0,'Payment must be positive'),paidDate:z.string().min(1).refine(v=>!Number.isNaN(Date.parse(v)),'Choose a valid payment date'),reference:optional,notes:optional}),
  expenses:z.object({title:name,clientId:ref,projectId:ref,amount:money,category:z.enum(['Labour','Software','Hosting','Contractor','Marketing','Other']).default('Other'),date:date,paid:z.boolean().default(false),notes:optional}),
  documents:z.object({title:name,category:z.enum(['PRD','Contract','Policy','Template','Procedure','Brand','Other']).default('Other'),folder:optional,clientId:ref,projectId:ref,status:z.enum(['Draft','Current','Archived']).default('Current'),version:optional,reviewDate:date,fileId:ref,url:web,body:optional}),
  resources:z.object({name,provider:z.enum(['GitHub','Vercel','AWS','Supabase','PostgreSQL','Other']),clientId:ref,projectId:ref,dashboardUrl:web,previewUrl:web,environment:z.enum(['Development','Staging','Production']).default('Production'),status:z.enum(['Unknown','Healthy','Needs attention','Paused']).default('Unknown'),monthlyCost:money.default(0),renewalDate:date,notes:optional}),
  automations: z.object({ name, prompt: name.max(20000), engine: z.enum(['GPT','Claude','Codex']).default('GPT'), frequency: z.enum(['Once','Daily','Weekly']).default('Once'), nextRun: z.string().refine(v=>!Number.isNaN(Date.parse(v)), 'Choose a run time'), enabled: z.boolean().default(true) }),
};
export function saveRecord(store, collection, input, id, actor='You',options={}) {
  const schema = schemas[collection];
  if (!schema) throw new Error('This collection cannot be edited directly');
  if (id && !options.restore && !store.get(collection,id)) throw new Error('Record not found');
  const previous = (id ? store.get(collection,id) : null)||{};
  if(collection==='emails' && id && previous.status!=='Draft')throw new Error('Only saved drafts can be edited. Reply to a received email to create a new draft.');
  const data = schema.parse({...previous, ...input});
  if(collection==='tasks'){
    const relations=[data.parentTaskId,...data.dependencyIds].filter(Boolean);
    if(data.prdId){const prd=store.get('documents',data.prdId);if(!prd||prd.category!=='PRD'||!data.projectId||prd.projectId!==data.projectId)throw new Error('Choose a PRD from this project.');}
    const visit=(key,seen=new Set())=>{if(key===id)throw new Error('Ticket links cannot form a cycle.');if(seen.has(key))return;seen.add(key);const r=store.get('tasks',key);if(!r||!data.projectId||r.projectId!==data.projectId)throw new Error('Ticket links must stay within the same project.');for(const next of [r.parentTaskId,...(r.dependencyIds||[])].filter(Boolean))visit(next,seen);};
    for(const key of relations)visit(key);
    // Requirement links and the revision a ticket was planned against. A ticket keeps its planned revision until
    // the owner explicitly re-plans it against the latest approved one, so later PRD changes never rewrite its scope.
    const latestRevision=data.prdId?store.list('prdRevisions').filter(r=>r.prdId===data.prdId).sort((a,b)=>b.number-a.number)[0]:null;
    if(!data.prdId){data.requirementIds=[];data.plannedRevisionId='';}
    else{
      data.requirementIds=[...new Set(data.requirementIds)];
      if(data.requirementIds.some(r=>store.get('requirements',r)?.prdId!==data.prdId))throw new Error('Choose requirements from the linked PRD.');
      if(data.prdId!==previous.prdId)data.plannedRevisionId=latestRevision?.id||'';
      else if(input.plannedRevisionId!==undefined&&input.plannedRevisionId!==(previous.plannedRevisionId||'')){if(input.plannedRevisionId!==(latestRevision?.id||''))throw new Error('A ticket can only be re-planned against the latest approved PRD revision.');data.plannedRevisionId=latestRevision?.id||'';}
      else data.plannedRevisionId=previous.plannedRevisionId||latestRevision?.id||'';
    }
    // The engineering standard revision a ticket follows works the same way as its planned PRD revision.
    const latestStandard=data.projectId?store.list('standardRevisions').filter(r=>r.projectId===data.projectId).sort((a,b)=>b.number-a.number)[0]:null;
    if(!data.projectId)data.standardRevisionId='';
    else if(data.projectId!==previous.projectId)data.standardRevisionId=latestStandard?.id||'';
    else if(input.standardRevisionId!==undefined&&input.standardRevisionId!==(previous.standardRevisionId||'')){if(input.standardRevisionId!==(latestStandard?.id||''))throw new Error('A ticket can only follow the latest approved engineering standard.');data.standardRevisionId=latestStandard?.id||'';}
    else data.standardRevisionId=previous.standardRevisionId||latestStandard?.id||'';
    // Workflow: software projects use gated statuses, enforced here for the dashboard, the API and every assistant.
    const project=data.projectId?store.get('projects',data.projectId):null,software=isSoftware(project);
    if(software&&data.status==='To do'&&(!id||previous.projectId!==data.projectId))data.status='Backlog';
    if(!software&&['Ready','QA / staging','Ready for release'].includes(data.status)&&id&&previous.projectId!==data.projectId)data.status=data.status==='Ready'?'To do':'In review';
    if(!statusesFor(project).includes(data.status))throw new Error(software?`${data.status} isn’t used in software projects. Use Backlog or Ready instead.`:`${data.status} is only used in projects with the software workflow.`);
    if(software&&data.status!==(previous.status||'')&&!options.undoOf&&!options.restore){
      const problems=gateProblems({...previous,...data,id:id||'',status:previous.status&&previous.projectId===data.projectId?previous.status:'Backlog'},data.status,{evidence:id?store.list('ticketEvidence').filter(e=>e.taskId===id):[],tasks:store.list('tasks')});
      if(problems.length)throw Object.assign(new Error(`Can’t move to ${data.status} yet. ${problems.join(' ')}`),{code:'workflow_gate',problems});
    }
    data.attachmentIds=[...new Set(data.attachmentIds)];if(data.attachmentIds.some(file=>!store.get('chatFiles',file)))throw new Error('An attached file no longer exists. Attach it again.');
    if(id&&previous.projectId!==data.projectId&&store.list('tasks').some(t=>t.parentTaskId===id||(t.dependencyIds||[]).includes(id)))throw new Error('Remove incoming ticket links before changing projects.');
    // Keys never change once issued. New keys are checked against every saved ticket so two tickets can never share one.
    if(previous.ticketKey)data.ticketKey=previous.ticketKey;
    else{const used=new Set(store.list('tasks').map(t=>t.ticketKey).filter(Boolean));let key;do{key='T-'+randomUUID().slice(0,8).toUpperCase();}while(used.has(key));data.ticketKey=key;}
  }
  if(collection==='documents'&&id&&store.list('tasks').some(t=>t.prdId===id)&&(data.category!=='PRD'||data.projectId!==previous.projectId))throw new Error('Unlink tickets before moving this PRD or changing its category.');
  if(collection==='documents'&&id&&previous.category==='PRD'&&(store.list('requirements').some(r=>r.prdId===id)||store.list('prdRevisions').some(r=>r.prdId===id))&&(data.category!=='PRD'||data.projectId!==previous.projectId))throw new Error('This PRD has requirements or approved revisions, so it must stay a PRD in this project.');
  if(collection==='projects'&&id&&previous.workflow!==data.workflow){
    const tickets=store.list('tasks').filter(t=>t.projectId===id);
    if(data.workflow==='Simple'&&tickets.some(t=>['Ready','QA / staging','Ready for release'].includes(t.status)))throw new Error('Move tickets out of Ready, QA / staging and Ready for release before switching back to the simple workflow.');
    if(data.workflow==='Software')for(const t of tickets.filter(t=>t.status==='To do'))store.put('tasks',{...t,status:'Backlog'},{actor});
  }
  if(collection==='ticketEvidence'){
    // Evidence is a permanent record: failed checks stay failed, and only the owner can record a passing review or release.
    if(id)throw new Error('Evidence is permanent. Record a new entry instead of changing this one.');
    const task=store.get('tasks',data.taskId);if(!task)throw new Error('This ticket no longer exists.');
    if(OWNER_ONLY_PASSES.includes(data.kind)&&data.result==='Passed'&&actor!=='You')throw new Error(`Only the owner can record a passing ${data.kind.toLowerCase()}.`);
    if(data.kind==='Check'&&data.result==='Info')throw new Error('Record whether the check passed or failed.');
    if(['Review','Acceptance','Release'].includes(data.kind)&&data.result==='Info')throw new Error(`Record whether the ${data.kind.toLowerCase()} passed or failed.`);
    if(['Change','Environment','Release'].includes(data.kind)&&!data.reference)throw new Error('Add a link or reference so the evidence can be checked.');
    data.requirementIds=[...new Set(data.requirementIds)];if(data.requirementIds.some(r=>!(task.requirementIds||[]).includes(r)))throw new Error('Evidence can only cover requirements linked to this ticket.');
    if(actor!=='GitHub'){data.sourceProvider='';data.sourceId='';}
    Object.assign(data,{sequence:store.list('ticketEvidence').filter(e=>e.taskId===task.id).length+1,recordedBy:actor,recordedAt:new Date().toISOString(),projectId:task.projectId,ticketStatus:task.status,plannedRevisionId:task.plannedRevisionId||'',standardRevisionId:task.standardRevisionId||''});
  }
  if(['repositories','environments','releases'].includes(collection)&&id&&previous.projectId!==data.projectId)throw new Error('This record cannot be moved to another project.');
  if(collection==='repositories'){
    if(store.list('repositories').some(r=>r.id!==id&&r.projectId===data.projectId&&r.owner.toLowerCase()===data.owner.toLowerCase()&&r.name.toLowerCase()===data.name.toLowerCase()))throw new Error('This repository is already linked to the project.');
    if(id&&['owner','name','branch'].some(k=>previous[k]!==data[k]))Object.assign(data,{verifiedAt:'',verifyError:'',fullName:'',defaultBranch:'',verifiedBranch:''});
  }
  if(collection==='ticketLinks'){
    const task=store.get('tasks',data.taskId),repository=store.get('repositories',data.repositoryId);
    if(!task||!repository||repository.projectId!==task.projectId)throw new Error('Choose a repository linked to this ticket’s project.');
    if(data.kind==='Pull request'&&!/^\d{1,9}$/.test(data.ref.replace(/^#/,'')))throw new Error('Use the pull request number, for example 42.');
    if(data.kind==='Pull request')data.ref=data.ref.replace(/^#/,'');
    if(data.kind==='Commit'&&!/^[0-9a-f]{7,40}$/i.test(data.ref))throw new Error('Use the commit SHA (7 to 40 hexadecimal characters).');
    if(data.kind==='Branch'&&/\s|\.\.|^-/.test(data.ref))throw new Error('That is not a valid branch name.');
    if(store.list('ticketLinks').some(l=>l.id!==id&&l.taskId===data.taskId&&l.repositoryId===data.repositoryId&&l.kind===data.kind&&l.ref===data.ref))throw new Error('This ticket already has that link.');
    if(id&&['taskId','repositoryId','kind','ref'].some(k=>previous[k]!==data[k]))data.sync=null;
    data.projectId=task.projectId;
  }
  if(collection==='environments'){
    if(data.repositoryId&&store.get('repositories',data.repositoryId)?.projectId!==data.projectId)throw new Error('Choose a repository linked to this project.');
    if(data.kind!=='Local'&&!data.url)throw new Error('Add the environment’s URL.');
    if(id&&previous.url!==data.url)data.health=null;
    if(id&&(previous.repositoryId!==data.repositoryId||previous.githubEnvironment!==data.githubEnvironment))data.deployment=null;
  }
  if(collection==='releases'){
    // A release is a record of intent and verified outcome; VareonHQ never deploys. Approval is the owner's, and
    // "Released" requires a healthy environment check (and a matching deployed commit when one is named) after approval.
    const environment=data.environmentId?store.get('environments',data.environmentId):null,owner=actor==='You'&&!options.undoOf;
    if(data.environmentId&&environment?.projectId!==data.projectId)throw new Error('Choose an environment from this project.');
    data.ticketIds=[...new Set(data.ticketIds)];if(data.ticketIds.some(t=>store.get('tasks',t)?.projectId!==data.projectId))throw new Error('A release can only include this project’s tickets.');
    if(data.commit&&!/^[0-9a-f]{7,40}$/i.test(data.commit))throw new Error('Use the commit SHA this release ships (7 to 40 hexadecimal characters).');
    data.commit=data.commit.toLowerCase();
    const was=previous.status||'',now=data.status;
    if(!id&&now!=='Draft')throw new Error('New releases start as drafts.');
    if(id&&was!=='Draft'&&['name','environmentId','ticketIds','commit','changelog','migrations','rollbackReference'].some(k=>JSON.stringify(previous[k]??'')!==JSON.stringify(data[k]??'')))throw new Error('Only draft releases can be edited. Move it back to Draft first.');
    if(id&&now!==was){
      const allowed={Draft:['Approved'],Approved:['Draft','Released','Failed'],Released:['Rolled back'],Failed:['Draft'],'Rolled back':['Draft']}[was]||[];
      if(!allowed.includes(now))throw new Error(`A release can’t go from ${was} to ${now}.`);
      if(['Approved','Draft','Rolled back'].includes(now)&&!owner)throw new Error(now==='Approved'?'Only the owner can approve a release.':`Only the owner can move a release to ${now}.`);
      if(now==='Approved'){
        if(!environment)throw new Error('Choose the environment this release targets.');
        if(!data.ticketIds.length)throw new Error('Include at least one ticket.');
        if(!data.changelog.trim())throw new Error('Write the changelog before approving.');
        if(environment.kind==='Production'&&!data.rollbackReference.trim())throw new Error('Production releases need a rollback reference.');
        Object.assign(data,{approvedBy:actor,approvedAt:new Date().toISOString()});
      }
      if(now==='Released'){
        if(environment.kind==='Production'&&!owner)throw new Error('Only the owner can mark a production release as released.');
        const health=environment.health,deployment=environment.deployment,approvedAt=Date.parse(previous.approvedAt);
        if(deployment?.found&&['failure','error'].includes(deployment.state))throw new Error('The latest deployment for this environment failed. Record the release as failed or redeploy and sync again.');
        if(!health||health.status!=='Healthy'||!(Date.parse(health.checkedAt)>=approvedAt))throw new Error('Check the environment after approval. It must respond healthy before the release can be marked released.');
        if(data.commit){if(!deployment?.found||!(Date.parse(deployment.syncedAt)>=approvedAt))throw new Error('Sync the environment’s deployment from GitHub after approval to confirm which commit is live.');if(!String(deployment.sha||'').toLowerCase().startsWith(data.commit))throw new Error(`The environment is running ${String(deployment.sha||'an unknown commit').slice(0,7)}, not this release’s commit ${data.commit.slice(0,7)}.`);if(deployment.state!=='success')throw new Error(`The deployment is ${deployment.state}, not successful.`);}
        Object.assign(data,{releasedBy:actor,releasedAt:new Date().toISOString(),verification:{health,deployment:deployment||null}});
      }
      if(['Failed','Rolled back'].includes(now)&&!data.notes.trim())throw new Error('Record what happened in the notes.');
    }
  }
  if(collection==='automationRules'){for(const c of data.conditions)if(!FIELDS[TRIGGERS[data.trigger].collection]?.[c.field])throw new Error('That condition doesn’t apply to this trigger.');validateRule(data,actor);}
  if(collection==='projectTemplates'&&data.onboardingTemplateId&&!store.get('onboardingTemplates',data.onboardingTemplateId))throw new Error('Choose an existing onboarding checklist.');
  if(collection==='projectStandards'){
    if(id&&previous.projectId!==data.projectId)throw new Error('A standard cannot be moved to another project.');
    if(!id&&store.list('projectStandards').some(s=>s.projectId===data.projectId))throw new Error('This project already has an engineering standard. Edit it instead.');
    data.lastEditedBy=actor;
  }
  if(collection==='standardExceptions'){
    // Anyone may propose; only the owner decides. Decided exceptions are frozen apart from being withdrawn.
    if(id&&previous.projectId!==data.projectId)throw new Error('An exception cannot be moved to another project.');
    const was=previous.status||'',now=data.status,owner=actor==='You'&&!options.undoOf;
    if(!id){if(now!=='Proposed'&&!owner)data.status='Proposed';data.proposedBy=actor;}
    else if(was!=='Proposed'){const changed=['title','rule','reason','expiresOn'].some(k=>String(previous[k]||'')!==String(data[k]||''));if(changed||(now!==was&&!(now==='Withdrawn'&&was==='Approved'&&owner)))throw new Error(was==='Approved'?'Approved exceptions can only be withdrawn by the owner.':'This exception has been decided and cannot be changed.');}
    else if(['Approved','Rejected'].includes(now)&&!owner)throw new Error('Only the owner can approve or reject an exception.');
    else if(now==='Withdrawn'&&!owner&&previous.proposedBy!==actor)throw new Error('Only the owner or the proposer can withdraw this exception.');
    if(now!==was&&['Approved','Rejected','Withdrawn'].includes(now)){data.decidedBy=actor;data.decidedAt=new Date().toISOString();if(now==='Approved')data.standardRevision=store.list('standardRevisions').filter(r=>r.projectId===data.projectId).sort((a,b)=>b.number-a.number)[0]?.number||0;}
  }
  if(collection==='requirements'){
    const prd=store.get('documents',data.prdId);if(!prd||prd.category!=='PRD')throw new Error('Choose an existing PRD for this requirement.');
    if(id&&previous.prdId!==data.prdId)throw new Error('A requirement cannot be moved to another PRD.');
    data.projectId=prd.projectId;data.lastEditedBy=actor;
    if(previous.code)data.code=previous.code;
    else{const key='requirementSequence:'+data.prdId,highest=Math.max(Number(store.settings()[key])||0,...store.list('requirements').filter(r=>r.prdId===data.prdId).map(r=>Number(String(r.code).replace(/\D/g,''))||0));store.setting(key,highest+1);data.code='REQ-'+String(highest+1).padStart(3,'0');}
  }
  if(collection==='ticketComments'){
    // Comments belong to one ticket for life, and only their author may reword them.
    if(!store.get('tasks',data.taskId))throw new Error('This ticket no longer exists.');
    if(id&&previous.taskId!==data.taskId)throw new Error('A comment cannot be moved to another ticket.');
    if(id&&previous.author&&previous.author!==actor&&!options.undoOf&&!options.restore)throw new Error('Only the author can edit this comment.');
    data.author=previous.author||actor;if(id)data.editedAt=new Date().toISOString();
  }
  if(collection==='documents'&&data.category==='PRD'&&!data.projectId)throw new Error('Choose a project for this PRD.');
  if(collection==='emails')data.bodyHtml=cleanEmailHTML(data.bodyHtml);
  for (const [key, parent] of [['clientId','clients'],['projectId','projects'],['prospectId','prospects']]) if (data[key] && !store.get(parent,data[key])) throw new Error(`${({clients:'Client',projects:'Project',prospects:'Prospect'})[parent]} no longer exists`);
  if(data.projectId&&data.clientId&&store.get('projects',data.projectId)?.clientId&&store.get('projects',data.projectId).clientId!==data.clientId)throw new Error('Choose the client linked to this project.');
  if(collection==='timeEntries'&&store.get('projects',data.projectId)?.clientId)data.clientId=store.get('projects',data.projectId).clientId;
  if(collection==='documents'&&data.fileId&&!store.get('chatFiles',data.fileId))throw new Error('This document file no longer exists.');
  if(collection==='payments'){const invoice=store.get('invoices',data.invoiceId);if(!invoice||invoice.status!=='Issued')throw new Error('Record payments against an issued invoice.');const paid=store.list('payments').filter(p=>p.invoiceId===data.invoiceId&&p.id!==id).reduce((n,p)=>n+Math.round(p.amount*100),0);if(paid+Math.round(data.amount*100)>Math.round(invoice.amount*100))throw new Error('Payment exceeds the invoice balance.');}
  if(collection==='invoices'){const paid=store.list('payments').filter(p=>p.invoiceId===id).reduce((n,p)=>n+Math.round(p.amount*100),0);if(paid&&(data.status!=='Issued'||Math.round(data.amount*100)<paid))throw new Error('This invoice has payments. Keep it issued and its amount at least equal to recorded payments.');}
  if(collection==='posts'&&data.mediaIds.some(id=>!store.get('media',id)))throw new Error('An attached media file no longer exists.');
  if (collection==='projects' && data.startDate && data.dueDate && Date.parse(data.dueDate)<Date.parse(data.startDate)) throw new Error('The project end date must follow its start date');
  if (collection==='posts') {
    if (['Published','Failed'].includes(data.status) && data.status !== previous.status) throw new Error('Publication status is set by the publishing service');
    if (data.status==='Scheduled' && !data.scheduledAt) throw new Error('Choose a scheduled time');
  }
  if(collection==='meetings'&&(Date.parse(data.endAt)<=Date.parse(data.startAt)||Date.parse(data.endAt)-Date.parse(data.startAt)>7*86400000))throw new Error('Choose an end time after the start, within seven days');
  if(collection==='forecastItems'&&(Number.isNaN(Date.parse(data.date))||data.endDate&&data.endDate<data.date))throw new Error('Choose a valid forecast date range');
  if(collection==='tasks')data.completedAt=data.status==='Done'?(previous.status==='Done'?previous.completedAt||'':new Date().toISOString()):'';
  if(collection==='tasks'&&options.undoOf)data.completedAt=input.completedAt||'';
  const result = store.put(collection, {...previous, ...data,...(options.restore?{createdAt:input.createdAt}:{}), ...(id ? {id} : {})},{actor,undoOf:options.undoOf});
  store.log(`${id ? 'Updated' : 'Created'} ${collection==='ticketComments'?'a ticket comment':data.name || data.title || data.subject || 'payment entry'}`,actor,result.id);
  if(!options.undoOf&&!options.restore)try{fireRules(store,collection,previous,result,actor);}catch(error){console.error('Automation rule failed:',error.message);}
  return result;
}
export function deleteRecord(store,collection,id,actor='You',options={}) {
  if (!schemas[collection]) throw new Error('This collection cannot be deleted');
  if (collection==='clients' && ['projects','contracts','tasks','emails','posts','notes','invoices','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','prospects','websites','meetings','forecastItems','reportSchedules'].some(c=>store.list(c).some(r=>r.clientId===id))) throw new Error('This client has linked records. Update or remove those links first.');
  if (collection==='projects' && ['repositories','environments','releases','projectStandards','standardExceptions','standardRevisions','tasks','contracts','posts','notes','invoices','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','meetings','forecastItems'].some(c=>store.list(c).some(r=>r.projectId===id))) throw new Error('This project has linked records. Update those links first.');
  if(collection==='invoices'&&store.list('payments').some(p=>p.invoiceId===id))throw new Error('This invoice has payments. Remove incorrect payment entries before deleting it.');
  if(store.list('tasks').some(t=>collection==='documents'?t.prdId===id:collection==='tasks'&&(t.parentTaskId===id||(t.dependencyIds||[]).includes(id))))throw new Error('Unlink referencing tickets before deleting this record.');
  if(collection==='ticketComments'){const comment=store.get('ticketComments',id);if(comment&&actor!=='You'&&comment.author!==actor)throw new Error('Only the author or the owner can delete this comment.');}
  if(collection==='ticketEvidence')throw new Error('Evidence is permanent and cannot be deleted.');
  if(collection==='projectTemplates'&&store.list('templateVersions').some(v=>v.templateId===id))throw new Error('This template has published versions that projects may rely on. Keep it.');
  if(collection==='onboardingTemplates'&&store.list('projectTemplates').some(t=>t.onboardingTemplateId===id))throw new Error('A project template uses this checklist. Change that template first.');
  if(collection==='repositories'&&(store.list('ticketLinks').some(l=>l.repositoryId===id)||store.list('environments').some(e=>e.repositoryId===id)))throw new Error('Remove ticket links and environments that use this repository first.');
  if(collection==='environments'&&store.list('releases').some(r=>r.environmentId===id))throw new Error('Releases target this environment. Keep it for their history.');
  if(collection==='releases'&&store.get('releases',id)&&store.get('releases',id).status!=='Draft')throw new Error('Only draft releases can be deleted.');
  if(collection==='tasks'&&store.list('releases').some(r=>(r.ticketIds||[]).includes(id)))throw new Error('This ticket is part of a release. Cancel it instead of deleting it.');
  if(collection==='tasks')for(const link of store.list('ticketLinks').filter(l=>l.taskId===id))store.remove('ticketLinks',link.id,{actor});
  if(collection==='tasks'&&store.list('ticketEvidence').some(e=>e.taskId===id))throw new Error('This ticket has recorded evidence. Cancel it instead of deleting it.');
  if(collection==='projectStandards'){const record=store.get('projectStandards',id);if(record&&store.list('standardRevisions').some(r=>r.projectId===record.projectId))throw new Error('This standard has approved revisions. Edit it and approve a new revision instead.');}
  if(collection==='standardExceptions'&&store.get('standardExceptions',id)?.status==='Approved')throw new Error('Withdraw an approved exception instead of deleting it.');
  if(collection==='requirements'){if(store.list('prdRevisions').some(r=>r.snapshot?.requirements?.some(q=>q.id===id)))throw new Error('This requirement is part of an approved revision. Retire it instead so the history stays intact.');if(store.list('tasks').some(t=>(t.requirementIds||[]).includes(id)))throw new Error('Unlink tickets from this requirement before deleting it.');}
  if(collection==='documents'&&(store.list('requirements').some(r=>r.prdId===id)||store.list('prdRevisions').some(r=>r.prdId===id)))throw new Error('This PRD has requirements or approved revisions. Archive it instead of deleting it.');
  if(collection==='projects')for(const view of store.list('savedViews').filter(v=>v.projectId===id))store.remove('savedViews',view.id,{actor});
  if(collection==='tasks')for(const comment of store.list('ticketComments').filter(c=>c.taskId===id))store.remove('ticketComments',comment.id,{actor});
  store.remove(collection,id,{actor,undoOf:options.undoOf}); store.log(`Deleted ${collection.slice(0,-1)}`,actor,id);
}
// Approving freezes the PRD's current scope as a new immutable revision. Owner only: assistants can draft
// requirements, but there is no assistant tool or generic record route that creates or edits a revision.
export function approvePrdRevision(store,prdId,{reason=''}={},actor='You'){
  if(actor!=='You')throw new Error('Only the owner can approve PRD revisions.');
  const prd=store.get('documents',prdId);if(!prd||prd.category!=='PRD')throw new Error('PRD not found.');
  const latest=store.list('prdRevisions').filter(r=>r.prdId===prdId).sort((a,b)=>b.number-a.number)[0];
  const scope=scopeOf(prd,store.list('requirements')),diff=diffScopes(latest?.snapshot,scope),why=String(reason||'').trim().slice(0,2000);
  if(!scope.requirements.length)throw new Error('Add at least one requirement before approving.');
  if(latest&&diff.empty)throw new Error(`Nothing has changed since revision ${latest.number}.`);
  if(latest&&!why)throw new Error('Explain why this revision changes the approved scope.');
  const revision=store.put('prdRevisions',{prdId,projectId:prd.projectId,number:(latest?.number||0)+1,reason:why||'Initial approval',approvedBy:actor,approvedAt:new Date().toISOString(),snapshot:scope,summary:{added:diff.added.length,removed:diff.removed.length,changed:diff.changed.length,bodyChanged:diff.bodyChanged}},{actor});
  store.put('documents',{...prd,version:`${revision.number}.0`,status:'Current'},{actor});
  store.log(`Approved ${prd.title} revision ${revision.number}`,actor,prdId);
  return revision;
}
export function approveStandardRevision(store,projectId,{reason=''}={},actor='You'){
  if(actor!=='You')throw new Error('Only the owner can approve the engineering standard.');
  const project=store.get('projects',projectId),draft=store.list('projectStandards').find(s=>s.projectId===projectId);if(!project||!draft)throw new Error('Create this project’s engineering standard first.');
  const latest=store.list('standardRevisions').filter(r=>r.projectId===projectId).sort((a,b)=>b.number-a.number)[0],snapshot=standardOf(draft),diff=diffStandards(latest?.snapshot,snapshot),why=String(reason||'').trim().slice(0,2000);
  if(!snapshot.definitionOfDone.trim())throw new Error('Write a definition of done before approving.');
  if(latest&&diff.empty)throw new Error(`Nothing has changed since standard revision ${latest.number}.`);
  if(latest&&!why)throw new Error('Explain why the engineering standard changes.');
  const revision=store.put('standardRevisions',{projectId,number:(latest?.number||0)+1,reason:why||'Initial approval',approvedBy:actor,approvedAt:new Date().toISOString(),snapshot,changedFields:diff.fields.map(f=>f.field)},{actor});
  store.log(`Approved ${project.name} engineering standard revision ${revision.number}`,actor,projectId);
  return revision;
}
export function snapshot(store,limit=1000) {
  return Object.fromEntries(['clients','projects','tasks','contracts','posts','emails','notes','automations','runs','approvals','messages','conversations','chatScopes','activity','codexJobs','media','prospects','invoices','payments','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','contacts','mailFolders','previews','websites','meetings','forecastItems','reportSchedules','onboardingTemplates','onboardings','renewals','timeEntries','meetingNotes','meetingProposals','timeTimers','ticketComments','savedViews','requirements','prdRevisions','projectStandards','standardRevisions','standardExceptions','ticketEvidence','repositories','ticketLinks','environments','releases','deliveryRuns','deliveryPlans','projectTemplates','templateVersions','handoffs','automationRules','automationRuns','automationAlerts'].map(c=>[c,store.list(c).slice(0,c==='activity'?100:limit)]));
}
