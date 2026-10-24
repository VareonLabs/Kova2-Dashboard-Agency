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
  timeEntries:z.object({title:name,projectId:z.string().min(1),clientId:ref,date:z.string().refine(realDay,'Choose a valid work date'),minutes:z.coerce.number().int().min(1).max(1440),hourlyCost:money.default(0),billRate:money.default(0),invoiceId:ref,billable:z.boolean().default(true),notes:optional}),
  meetingNotes:z.object({title:name,clientId:ref,projectId:ref,date:z.string().refine(realDay,'Choose a valid meeting date'),transcript:z.string().max(100000).default(''),notes:optional}),
  meetings:z.object({title:name,clientId:ref,projectId:ref,startAt:z.string().datetime({offset:true}),endAt:z.string().datetime({offset:true}),kind:z.enum(['Meeting','Focus']).default('Meeting'),notes:optional}),
  forecastItems:z.object({title:name,kind:z.enum(['Income','Expense']),amount:money,date:z.string().refine(realDay,'Choose a valid date'),frequency:z.enum(['Once','Weekly','Monthly']).default('Once'),endDate:z.string().refine(v=>!v||realDay(v),'Choose a valid end date').default(''),clientId:ref,projectId:ref,notes:optional,enabled:z.boolean().default(true)}),
  reportSchedules:z.object({name,clientId:z.string().min(1),frequency:z.enum(['Weekly','Monthly']),nextRun:z.string().datetime({offset:true}),enabled:z.boolean().default(true)}),
  websites:z.object({name,url:z.url().refine(v=>/^https?:/.test(v)),clientId:ref,ga4PropertyId:z.string().regex(/^\d*$|^$/).max(30).default(''),searchConsoleSite:z.string().max(1000).refine(v=>!v||/^sc-domain:[a-z0-9.-]+$/i.test(v)||/^https?:\/\//.test(v),'Use a Search Console property URL or sc-domain property').default('')}),
  clients: z.object({ name, company: optional, email: z.union([z.literal(''), z.email()]).optional().default(''), phone: optional, status: z.enum(['Lead','Active','Past']).default('Lead'), notes: optional }),
  projects: z.object({ name, clientId: ref, status: z.enum(['Planning','Active','On hold','Complete']).default('Planning'),workflow:z.enum(['Simple','Software']).default('Simple'), startDate: date, dueDate: date, description: optional,budget:money.default(0),plannedCost:money.default(0) }),
  retainers:z.object({name,clientId:z.string().min(1,'Choose a client').max(100),monthlyAmount:money,includedHours:z.coerce.number().min(0).max(1000).default(0),startDate:z.string().refine(realDay,'Choose a valid start date'),endDate:z.string().refine(v=>!v||realDay(v),'Choose a valid end date').default(''),status:z.enum(['Active','Paused','Ended']).default('Active'),invoicedMonths:z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(240).default([]),notes:optional}),
  people:z.object({name,kind:z.enum(['Owner','Employee','Contractor']).default('Employee'),email:z.union([z.literal(''),z.email()]).optional().default(''),weeklyHours:z.coerce.number().min(0).max(168).default(38),hourlyCost:money.default(0),skills:z.string().trim().max(300).optional().default(''),status:z.enum(['Active','Inactive']).default('Active'),notes:optional}),
  clientAssets:z.object({name,kind:z.enum(['Domain','Hosting','Repository','Email','Social account','Analytics','Design file','Other']).default('Other'),clientId:z.string().min(1,'Choose a client').max(100),projectId:ref,owner:z.enum(['Client','Agency','Third party']).default('Client'),status:z.enum(['Agency-held','Handed over','Not applicable']).default('Agency-held'),handoverDate:z.string().refine(v=>!v||realDay(v),'Choose a valid handover date').default(''),accessNote:z.string().trim().max(500).optional().default('').refine(v=>!/(?<![A-Za-z0-9])(pass(word|code)?|pwd|secret|token|api[_ -]?key)\s*[:=]/i.test(v),'Record where the login is kept (for example the password manager entry), never the password itself.'),renewalDate:date,notes:optional}),
  supportRequests:z.object({title:name,clientId:z.string().min(1,'Choose a client').max(100),projectId:ref,priority:z.enum(['Low','Normal','Urgent']).default('Normal'),status:z.enum(['New','In progress','Waiting on client','Resolved']).default('New'),channel:z.enum(['Email','Phone','Message','Other']).default('Email'),reportedOn:date,dueBy:date,resolvedAt:z.string().max(40).optional().default(''),assigneeId:ref,notes:optional}),
  services:z.object({name,description:optional,billing:z.enum(['One-off','Monthly']).default('One-off'),unit:z.string().trim().max(40).default('project'),unitPrice:money.default(0),active:z.boolean().default(true)}),
  proposals:z.object({title:name,clientId:z.string().min(1,'Choose a client').max(100),projectId:ref,status:z.enum(['Draft','Sent','Accepted','Declined','Expired']).default('Draft'),validUntil:date,lineItems:z.array(z.object({serviceId:ref,description:z.string().trim().min(1,'Describe each line').max(500),quantity:z.coerce.number().min(0.01).max(100000).default(1),unitPrice:money})).max(60).default([]),notes:optional,contractId:ref,depositPercent:z.coerce.number().min(0).max(100).default(0),acceptedAt:z.string().max(40).optional().default('')}),
  variations:z.object({proposalId:z.string().min(1).max(100),title:name,amountChange:z.coerce.number().finite().min(-1e9).max(1e9).refine(v=>Math.abs(v*100-Math.round(v*100))<0.0001,'Use at most two decimal places'),reason:optional,status:z.enum(['Proposed','Approved','Rejected']).default('Proposed')}),
  designs:z.object({projectId:z.string().min(1).max(100),title:name,figmaUrl:z.url().refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='www.figma.com'&&/^\/(?:design|file)\/[A-Za-z0-9]+(?:\/|$)/.test(u.pathname);}catch{return false;}},'Use a Figma design file URL'),notes:optional}),
  tasks: z.object({ assigneeId:ref,type:z.enum(['Task','Epic','Feature','Story','Bug','Spike','Technical debt']).default('Task'),prdId:ref,parentTaskId:ref,dependencyIds:z.array(z.string()).max(100).default([]),acceptanceCriteria:optional,requirement:optional,title: name, projectId: ref, clientId: ref, status: z.enum(ALL_STATUSES).default('To do'),implementationPlan:optional,blockedReason:optional,cancelReason:optional, priority: z.enum(['Low','Medium','High']).default('Medium'), dueDate: date,scheduledDate:date,estimatedHours:z.coerce.number().min(0).max(2000).default(0),notes: optional,attachmentIds:z.array(z.string().max(100)).max(50).default([]),requirementIds:z.array(z.string().max(100)).max(100).default([]),plannedRevisionId:ref,standardRevisionId:ref }),
  projectStandards:z.object({projectId:z.string().min(1).max(100),baseVersion:z.string().trim().max(80).default('Agency standard 1.0'),definitionOfDone:optional,repositoryConventions:optional,reviewPolicy:optional,notes:optional}),
  standardExceptions:z.object({projectId:z.string().min(1).max(100),title:name,rule:optional,reason:z.string().trim().min(1,'Explain why this exception is needed').max(4000),expiresOn:date,status:z.enum(['Proposed','Approved','Rejected','Withdrawn']).default('Proposed')}),
  requirements:z.object({prdId:z.string().min(1).max(100),title:name,statement:optional,acceptanceCriteria:optional,priority:z.enum(['Must','Should','Could','Won’t']).default('Must'),status:z.enum(['Active','Retired']).default('Active')}),
  savedViews:z.object({name:z.string().trim().min(1,'Name this view').max(80),scope:z.enum(['tickets']).default('tickets'),projectId:ref,filter:z.object({q:z.string().max(200).default(''),type:z.string().max(40).default(''),priority:z.string().max(20).default(''),status:z.string().max(40).default(''),project:z.string().max(100).default(''),waiting:z.boolean().default(false),view:z.enum(['board','tree']).default('board')}).default({})}),
  listViews:z.object({name:z.string().trim().min(1,'Name this view').max(80),scope:z.enum(['clients','projects','contracts','posts','prospects','notes','invoices','documents','media','resources','meetingNotes','renewals','onboardings','reportSchedules','forecastItems','profitabilityProjects']),query:z.string().trim().max(200).default(''),status:z.string().trim().max(40).default(''),category:z.enum(['','PRD','Contract','Policy','Template','Procedure','Brand','Other']).default(''),condition:z.enum(['','notContacted7Days','overdue']).default('')}).superRefine((value,ctx)=>{if(value.condition==='notContacted7Days'&&value.scope!=='prospects'||value.condition==='overdue'&&value.scope!=='invoices')ctx.addIssue({code:'custom',message:'This filter does not apply to that list.'});if(value.category&&value.scope!=='documents')ctx.addIssue({code:'custom',message:'Categories are available for documents only.'});}),
  ticketEvidence:z.object({taskId:z.string().min(1).max(100),kind:z.enum(EVIDENCE_KINDS),title:name,result:z.enum(['Passed','Failed','Info']).default('Info'),reference:z.string().trim().max(2000).optional().default(''),environment:z.string().trim().max(200).optional().default(''),details:optional,requirementIds:z.array(z.string().max(100)).max(100).default([]),sourceProvider:z.string().max(40).optional().default(''),sourceId:z.string().max(300).optional().default('')}),
  repositories:z.object({projectId:z.string().min(1).max(100),provider:z.enum(['GitHub']).default('GitHub'),owner:z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}$/,'Use the GitHub owner or organisation name'),name:z.string().trim().regex(/^[A-Za-z0-9_.-]{1,100}$/,'Use the repository name'),branch:z.string().trim().max(200).default('')}),
  ticketLinks:z.object({taskId:z.string().min(1).max(100),repositoryId:z.string().min(1).max(100),kind:z.enum(['Pull request','Branch','Commit']),ref:z.string().trim().min(1,'Add the pull request number, branch name or commit').max(200)}),
  environments:z.object({projectId:z.string().min(1).max(100),name,kind:z.enum(['Local','Preview','Staging','Production']).default('Preview'),url:web,provider:z.enum(['GitHub','Vercel','AWS','Other']).default('Other'),providerId:optional,owner:optional,repositoryId:ref,githubEnvironment:z.string().trim().max(200).optional().default(''),notes:optional}),
  releases:z.object({projectId:z.string().min(1).max(100),name,environmentId:ref,ticketIds:z.array(z.string().max(100)).max(200).default([]),commit:z.string().trim().max(40).optional().default(''),changelog:optional,migrations:optional,rollbackReference:optional,notes:optional,status:z.enum(['Draft','Approved','Released','Failed','Rolled back']).default('Draft')}),
  projectTemplates:z.object({name,description:optional,workflow:z.enum(['Simple','Software']).default('Simple'),durationDays:z.coerce.number().int().min(0).max(730).default(30),onboardingTemplateId:ref,kickoffText:z.string().max(20000).optional().default(''),createStandard:z.boolean().default(false),notes:optional}),
  automationRules:z.object({name,enabled:z.boolean().default(false),trigger:z.enum(Object.keys(TRIGGERS)),conditions:z.array(z.object({field:z.string().max(40),op:z.enum(Object.keys(OPS)),value:z.string().max(300)})).max(10).default([]),actions:z.array(z.object({type:z.enum(Object.keys(ACTIONS)),title:z.string().max(300).default(''),body:z.string().max(5000).default(''),dueInDays:z.union([z.literal(''),z.coerce.number().int().min(0).max(365)]).default(''),priority:z.enum(['','High','Medium','Low']).default('')})).max(5).default([])}),
  ticketComments:z.object({taskId:z.string().min(1).max(100),body:z.string().trim().min(1,'Write a comment first').max(10000)}),
  contracts: z.object({ title: name, clientId: ref, projectId: ref, proposalId: ref, depositPercent:z.coerce.number().min(0).max(100).default(0), depositInvoiceId: ref, depositWaived:z.boolean().default(false), status: z.enum(['Not sent','Draft','Sent','Awaiting signature','Signed','Declined','Expired']).default('Draft'), value: z.coerce.number().min(0).max(1e10).default(0), dueDate: date, renewalDate:date, documentUrl: z.union([z.literal(''), z.url().refine(v=>/^https?:/.test(v))]).optional().default(''), notes: optional }),
  posts: z.object({ title: name, platform: z.enum(['Instagram','LinkedIn','X']).default('LinkedIn'), format: z.enum(['Post','Carousel']).default('Post'), status: z.enum(['Idea','Draft','In review','Ready','Scheduled','Published','Failed']).default('Draft'), content: optional, slides: z.array(text).max(20).default([]), mediaUrls:z.array(z.url().refine(url=>url.startsWith('https://'))).max(20).default([]),mediaIds:z.array(z.string()).max(30).default([]),scheduledAt: date, clientId: ref,projectId:ref }),
  notes:z.object({title:name,body:optional,projectId:ref,clientId:ref,pinned:z.boolean().default(false)}),
  emails: z.object({ to: z.union([z.literal(''),z.email()]).optional().default(''), cc:z.array(z.email()).max(50).default([]),bcc:z.array(z.email()).max(50).default([]),subject: name, body: optional,bodyHtml:z.string().max(4000000).optional().default(''),attachmentIds:z.array(z.string()).max(10).default([]),prospectId:ref,importance:z.enum(['low','normal','high']).default('normal'),clientId: ref, replyToId: ref, status: z.enum(['Draft']).default('Draft') }),
  prospects:z.object({name,company:optional,email:z.union([z.literal(''),z.email()]).optional().default(''),phone:optional,website:web,source:optional,sourceUrl:web,status:z.enum(['Found','Researching','Contacted','Qualified','Proposal','Won','Lost']).default('Found'),estimatedValue:money.default(0),followUpDate:date,followUpAfterDays:z.coerce.number().int().min(1).max(90).default(7),followUpPaused:z.boolean().default(false),notes:optional,clientId:ref}),
  invoices:z.object({title:name,number:optional,contractId:ref,retainerId:ref,clientId:ref,projectId:ref,amount:money,status:z.enum(['Draft','Issued','Void']).default('Draft'),issuedDate:date,dueDate:date,followUpDate:date,notes:optional}),
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
  if(collection==='contracts'){
    if(data.depositPercent>0&&!data.clientId)throw new Error('Choose a client before asking for a deposit.');
    if(data.depositPercent>0&&!(data.value>0))throw new Error('Set the agreement value before asking for a deposit.');
    if(previous.id&&previous.depositInvoiceId&&data.depositPercent!==previous.depositPercent)throw new Error('The deposit invoice has already been raised. Change that invoice instead.');
    if(Boolean(previous.depositWaived)!==data.depositWaived&&actor!=='You')throw new Error('Only the owner can waive a deposit.');
    if(previous.id&&previous.depositInvoiceId&&data.depositInvoiceId!==previous.depositInvoiceId)throw new Error('The deposit invoice link is permanent.');
  }
  if(collection==='tasks'&&data.assigneeId){const who=store.get('people',data.assigneeId);if(!who)throw new Error('Choose an existing person to assign this to.');if(who.status!=='Active'&&previous.assigneeId!==data.assigneeId)throw new Error(`${who.name} is inactive. Reactivate them or choose someone else.`);}
  if(collection==='tasks'&&STARTED.includes(data.status)&&!STARTED.includes(previous.status||'Backlog')){
    const hold=depositHold(store,data.projectId);
    if(hold)throw new Error(hold);
  }
  if(collection==='retainers'){
    if(!store.get('clients',data.clientId))throw new Error('Choose an existing client for this retainer.');
    if(data.endDate&&data.endDate<data.startDate)throw new Error('The retainer end date must follow its start date.');
    if(previous.id&&JSON.stringify(previous.invoicedMonths)!==JSON.stringify(data.invoicedMonths))throw new Error('Invoiced months are set by raising the invoice.');
  }
  if(collection==='timeEntries'&&previous.invoiceId&&(previous.minutes!==data.minutes||previous.billRate!==data.billRate||previous.billable!==data.billable||previous.invoiceId!==data.invoiceId))throw new Error('This time is on an invoice. Void or delete that invoice to release it first.');
  if(collection==='clientAssets'){
    if(!store.get('clients',data.clientId))throw new Error('Choose an existing client for this asset.');
    if(data.projectId&&store.get('projects',data.projectId)?.clientId!==data.clientId)throw new Error('That project belongs to a different client.');
    if(data.status==='Handed over'&&!data.handoverDate)data.handoverDate=brisbaneDay();
    if(data.status!=='Handed over')data.handoverDate='';
  }
  if(collection==='supportRequests'){
    if(!store.get('clients',data.clientId))throw new Error('Choose an existing client for this request.');
    if(data.assigneeId&&!store.get('people',data.assigneeId))throw new Error('Choose an existing person to assign this to.');
    if(!data.reportedOn)data.reportedOn=brisbaneDay();
    if(!data.dueBy)data.dueBy=addDaysISO(data.reportedOn,SLA_DAYS[data.priority]);
    if(data.status==='Resolved')data.resolvedAt=previous.status==='Resolved'?previous.resolvedAt||new Date().toISOString():new Date().toISOString();
    else data.resolvedAt='';
  }
  if(collection==='proposals'){
    if(!store.get('clients',data.clientId))throw new Error('Choose an existing client for this proposal.');
    if(previous.status==='Accepted'&&actor!=='You')throw new Error('Only the owner can change an accepted proposal.');
    if(previous.status==='Accepted'&&(JSON.stringify(previous.lineItems)!==JSON.stringify(data.lineItems)||previous.clientId!==data.clientId))throw new Error('An accepted proposal is locked. Add a variation to change the scope or price.');
    if(data.status==='Accepted'&&previous.status!=='Accepted')throw new Error('Use Accept proposal so the agreement is created with it.');
    if(data.status==='Sent'&&!data.lineItems.length)throw new Error('Add at least one line before sending.');
    if(data.lineItems.some(l=>l.serviceId&&!store.get('services',l.serviceId)))throw new Error('A line refers to a service that no longer exists.');
  }
  if(collection==='variations'){
    const proposal=store.get('proposals',data.proposalId);
    if(!proposal)throw new Error('Choose an existing proposal.');
    if(proposal.status!=='Accepted')throw new Error('Variations apply to accepted proposals. Edit the proposal while it is a draft.');
    if(data.status!=='Proposed'&&previous.status!==data.status&&actor!=='You')throw new Error('Only the owner can approve or reject a variation.');
    if(previous.status&&previous.status!=='Proposed'&&(previous.amountChange!==data.amountChange||previous.status!==data.status))throw new Error('A decided variation is permanent. Add a new variation to reverse it.');
  }
  if(collection==='designs'){
    if(!store.get('projects',data.projectId))throw new Error('Choose an existing project for this design.');
    if(id&&previous.projectId!==data.projectId)throw new Error('An existing design cannot move to another project.');
  }
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
  if(collection==='invoices'&&result.status==='Void'&&previous.status!=='Void')releaseTime(store,result.id,actor);
  if(collection==='contracts'&&result.status==='Signed'&&previous.status!=='Signed'&&result.depositPercent>0&&!result.depositInvoiceId){
    const amount=Math.round(result.value*result.depositPercent)/100;
    const invoice=store.put('invoices',{title:`Deposit · ${result.title}`,number:'',clientId:result.clientId,projectId:result.projectId||'',amount,status:'Draft',issuedDate:'',dueDate:'',followUpDate:'',notes:`${result.depositPercent}% deposit on signed agreement ${result.title}. Issue it to start the clock.`,contractId:result.id},{actor});
    store.put('contracts',{...result,depositInvoiceId:invoice.id},{actor});
    store.log(`Raised deposit invoice for ${result.title}`,actor,result.id);
    return store.get('contracts',result.id);
  }
  store.log(`${id ? 'Updated' : 'Created'} ${collection==='ticketComments'?'a ticket comment':data.name || data.title || data.subject || 'payment entry'}`,actor,result.id);
  if(!options.undoOf&&!options.restore)try{fireRules(store,collection,previous,result,actor);}catch(error){console.error('Automation rule failed:',error.message);}
  return result;
}
export function deleteRecord(store,collection,id,actor='You',options={}) {
  if (!schemas[collection]) throw new Error('This collection cannot be deleted');
  if (collection==='clients' && ['projects','contracts','retainers','tasks','emails','posts','notes','invoices','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','prospects','websites','meetings','forecastItems','reportSchedules'].some(c=>store.list(c).some(r=>r.clientId===id))) throw new Error('This client has linked records. Update or remove those links first.');
  if (collection==='projects' && ['designs','repositories','environments','releases','projectStandards','standardExceptions','standardRevisions','tasks','contracts','posts','notes','invoices','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','meetings','forecastItems'].some(c=>store.list(c).some(r=>r.projectId===id))) throw new Error('This project has linked records. Update those links first.');
  if(collection==='people'&&store.list('tasks').some(t=>t.assigneeId===id))throw new Error('This person has tickets assigned. Reassign them, or mark the person inactive.');
  if(collection==='timeEntries'&&store.get('timeEntries',id)?.invoiceId)throw new Error('This time is on an invoice. Void or delete that invoice to release it first.');
  if(collection==='services'&&store.list('proposals').some(p=>(p.lineItems||[]).some(l=>l.serviceId===id)))throw new Error('This service is used in a proposal. Mark it inactive instead.');
  if(collection==='proposals'){const p=store.get('proposals',id);if(p?.status==='Accepted')throw new Error('Accepted proposals are part of the project history and cannot be deleted.');}
  if(collection==='clients'&&(store.list('clientAssets').some(a=>a.clientId===id)||store.list('supportRequests').some(r=>r.clientId===id)))throw new Error('This client has assets or support requests. Update or remove those first.');
  if(collection==='clients'&&store.list('proposals').some(p=>p.clientId===id))throw new Error('This client has proposals. Update or remove those first.');
  if(collection==='designs'&&store.list('designRevisions').some(r=>r.designId===id))throw new Error('This design has approved revisions. Keep it for the project history.');
  if(collection==='invoices'&&store.list('payments').some(p=>p.invoiceId===id))throw new Error('This invoice has payments. Remove incorrect payment entries before deleting it.');
  if(collection==='invoices')releaseTime(store,id,actor);
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
// Approval freezes the design reference and notes in local history. The linked Figma file itself remains editable.
export function approveDesignRevision(store,designId,{reason=''}={},actor='You'){
  if(actor!=='You')throw new Error('Only the owner can approve a design reference.');
  const design=store.get('designs',designId);
  if(!design)throw new Error('Design not found.');
  const latest=store.list('designRevisions').filter(r=>r.designId===designId).sort((a,b)=>b.number-a.number)[0];
  const reference={title:design.title,figmaUrl:design.figmaUrl,notes:design.notes};
  if(latest&&JSON.stringify(latest.reference)===JSON.stringify(reference))throw new Error('Nothing has changed since the last approval.');
  const why=String(reason||'').trim().slice(0,2000);
  if(latest&&!why)throw new Error('Explain why the design reference changed.');
  const revision=store.put('designRevisions',{designId,projectId:design.projectId,number:(latest?.number||0)+1,reason:why||'Initial approval',approvedBy:actor,approvedAt:new Date().toISOString(),reference},{actor});
  store.log(`Approved design reference ${design.title} revision ${revision.number}`,actor,designId);
  return revision;
}
const STARTED=['In progress','In review','QA / staging','Ready for release','Done'];
// A deposit is cleared once its invoice has been issued and paid in full, or the owner waives it.
export function depositState(store,contract){
  if(!(contract.depositPercent>0)||contract.depositWaived)return {required:false,cleared:true};
  const invoice=contract.depositInvoiceId?store.get('invoices',contract.depositInvoiceId):null;
  const paid=invoice?store.list('payments').filter(p=>p.invoiceId===invoice.id).reduce((n,p)=>n+Math.round(p.amount*100),0):0;
  const cleared=Boolean(invoice&&invoice.status==='Issued'&&paid>=Math.round(invoice.amount*100));
  return {required:true,cleared,invoice,paid:paid/100};
}
// Returns the reason work cannot start on a project yet, or '' when nothing is holding it.
export function depositHold(store,projectId){
  if(!projectId)return '';
  for(const contract of store.list('contracts').filter(c=>c.projectId===projectId&&!['Declined','Expired'].includes(c.status))){
    const state=depositState(store,contract);
    if(state.cleared)continue;
    if(contract.status!=='Signed')return `Work is on hold until “${contract.title}” is signed and its ${contract.depositPercent}% deposit is paid. The owner can waive the deposit on the agreement.`;
    return `Work is on hold until the ${contract.depositPercent}% deposit for “${contract.title}” is paid. The owner can waive it on the agreement.`;
  }
  return '';
}
const SLA_DAYS={Urgent:1,Normal:3,Low:7};
const brisbaneDay=(d=new Date())=>d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
const addDaysISO=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const brisbaneMonth=(d=new Date())=>d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7);
const monthLabel=m=>new Date(m+'-01T00:00:00Z').toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'UTC'});
const timeValue=e=>Math.round(e.minutes*Math.round(e.billRate*100)/60);
function releaseTime(store,invoiceId,actor){for(const e of store.list('timeEntries').filter(e=>e.invoiceId===invoiceId))store.put('timeEntries',{...e,invoiceId:''},{actor});}
const clientProjects=(store,clientId)=>new Set(store.list('projects').filter(p=>p.clientId===clientId).map(p=>p.id));
const entryClient=(store,e)=>e.clientId||store.get('projects',e.projectId)?.clientId||'';
// Billable time that is not yet on an invoice. Entries with no billing rate are listed separately so they are not silently skipped.
export function unbilledTime(store,clientId=''){
  const rows=store.list('timeEntries').filter(e=>e.billable&&!e.invoiceId&&(!clientId||entryClient(store,e)===clientId));
  return {ready:rows.filter(e=>e.billRate>0),noRate:rows.filter(e=>!(e.billRate>0)),value:rows.filter(e=>e.billRate>0).reduce((n,e)=>n+timeValue(e),0)/100};
}
export function invoiceUnbilledTime(store,clientId,actor='You'){
  if(actor!=='You')throw new Error('Only the owner can raise an invoice.');
  if(!store.get('clients',clientId))throw new Error('Client not found.');
  const {ready}=unbilledTime(store,clientId);
  if(!ready.length)throw new Error('There is no billable time with a billing rate to invoice for this client.');
  const amount=ready.reduce((n,e)=>n+timeValue(e),0)/100;
  const hours=Math.round(ready.reduce((n,e)=>n+e.minutes,0)/6)/10;
  const invoice=store.put('invoices',{title:`Time · ${store.get('clients',clientId).name} · ${ready.length} entr${ready.length>1?'ies':'y'}`,number:'',clientId,projectId:'',amount,status:'Draft',issuedDate:'',dueDate:'',followUpDate:'',notes:`${hours} billable hours from ${ready.map(e=>e.date).sort()[0]} to ${ready.map(e=>e.date).sort().pop()}.`},{actor});
  for(const e of ready)store.put('timeEntries',{...e,invoiceId:invoice.id},{actor});
  store.log(`Raised draft invoice for ${ready.length} time entries`,actor,invoice.id);
  return invoice;
}
export function retainerUsage(store,retainer,month=brisbaneMonth()){
  const projects=clientProjects(store,retainer.clientId);
  const minutes=store.list('timeEntries').filter(e=>e.billable&&e.date?.startsWith(month)&&(e.clientId===retainer.clientId||projects.has(e.projectId))).reduce((n,e)=>n+e.minutes,0);
  return {month,hours:Math.round(minutes/6)/10,included:retainer.includedHours,over:retainer.includedHours>0&&minutes/60>retainer.includedHours};
}
export function invoiceRetainer(store,retainerId,month='',actor='You'){
  if(actor!=='You')throw new Error('Only the owner can raise an invoice.');
  const retainer=store.get('retainers',retainerId);
  if(!retainer)throw new Error('Retainer not found.');
  if(retainer.status!=='Active')throw new Error('Only active retainers can be invoiced.');
  month=month||brisbaneMonth();
  if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Choose a valid month.');
  if(month<retainer.startDate.slice(0,7)||retainer.endDate&&month>retainer.endDate.slice(0,7))throw new Error('That month is outside this retainer.');
  if(retainer.invoicedMonths.includes(month))throw new Error(`${monthLabel(month)} has already been invoiced for this retainer.`);
  const use=retainerUsage(store,retainer,month);
  const invoice=store.put('invoices',{title:`Retainer · ${retainer.name} · ${monthLabel(month)}`,number:'',clientId:retainer.clientId,projectId:'',amount:retainer.monthlyAmount,status:'Draft',issuedDate:'',dueDate:'',followUpDate:'',notes:`${monthLabel(month)} retainer. ${use.hours} hours logged${use.included?` of ${use.included} included`:''}.`,retainerId},{actor});
  const saved=store.put('retainers',{...retainer,invoicedMonths:[...retainer.invoicedMonths,month].sort()},{actor});
  store.log(`Raised draft retainer invoice for ${monthLabel(month)}`,actor,retainerId);
  return {invoice,retainer:saved};
}
export const proposalTotal=(proposal)=>Math.round((proposal.lineItems||[]).reduce((n,l)=>n+Math.round(l.quantity*l.unitPrice*100),0))/100;
export function proposalValue(store,proposal){
  const approved=store.list('variations').filter(v=>v.proposalId===proposal.id&&v.status==='Approved').reduce((n,v)=>n+Math.round(v.amountChange*100),0);
  return Math.round(proposalTotal(proposal)*100+approved)/100;
}
// Accepting freezes the scope and raises one draft agreement carrying the proposal's value, so the sale and the paperwork share an ID trail.
export function acceptProposal(store,proposalId,actor='You'){
  if(actor!=='You')throw new Error('Only the owner can accept a proposal.');
  const proposal=store.get('proposals',proposalId);
  if(!proposal)throw new Error('Proposal not found.');
  if(proposal.status==='Accepted')throw new Error('This proposal is already accepted.');
  if(['Declined','Expired'].includes(proposal.status))throw new Error('Reopen this proposal as a draft before accepting it.');
  if(!proposal.lineItems.length)throw new Error('Add at least one line before accepting.');
  const contract=store.put('contracts',{title:proposal.title,clientId:proposal.clientId,projectId:proposal.projectId||'',status:'Draft',value:proposalTotal(proposal),depositPercent:proposal.depositPercent||0,dueDate:'',renewalDate:'',documentUrl:'',notes:`Raised from accepted proposal ${proposal.title}.`,proposalId},{actor});
  const accepted=store.put('proposals',{...proposal,status:'Accepted',acceptedAt:new Date().toISOString(),contractId:contract.id},{actor});
  store.log(`Accepted proposal ${proposal.title}`,actor,proposalId);
  return {proposal:accepted,contract};
}
export function snapshot(store,limit=1000) {
  return Object.fromEntries(['clients','projects','designs','designRevisions','services','proposals','variations','retainers','people','clientAssets','supportRequests','tasks','contracts','posts','emails','notes','automations','runs','approvals','messages','conversations','chatScopes','activity','codexJobs','media','prospects','prospectTouches','invoices','payments','expenses','resources','documents','renewals','timeEntries','meetingNotes','onboardings','contacts','mailFolders','previews','websites','meetings','forecastItems','reportSchedules','onboardingTemplates','onboardings','renewals','timeEntries','meetingNotes','meetingProposals','timeTimers','ticketComments','savedViews','listViews','requirements','prdRevisions','projectStandards','standardRevisions','standardExceptions','ticketEvidence','repositories','ticketLinks','environments','releases','deliveryRuns','deliveryPlans','projectTemplates','templateVersions','handoffs','automationRules','automationRuns','automationAlerts'].map(c=>[c,store.list(c).slice(0,c==='activity'?100:limit)]));
}
