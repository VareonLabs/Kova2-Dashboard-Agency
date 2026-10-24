// Shared read models: the screens and assistant use the same saved records.
export function brisbaneDay(value=new Date()) {
  if(!value || Number.isNaN(Date.parse(value)))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export const recordDay=value=>!value?'':/^\d{4}-\d{2}-\d{2}$/.test(value)?value:brisbaneDay(value);
const list=(data,key)=>data[key]||[];
const activeMail=m=>!m.deletedAt&&!['Deleted','Trashed'].includes(m.status);
const emailAddresses=value=>(Array.isArray(value)?value:[value]).flatMap(v=>String(v||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[]);
export function clientWorkspace(data,id) {
  const client=list(data,'clients').find(c=>c.id===id);if(!client)throw new Error('Client not found');
  const projects=list(data,'projects').filter(p=>p.clientId===id),projectIds=new Set(projects.map(p=>p.id));
  const linked=r=>r.clientId===id||!!r.projectId&&projectIds.has(r.projectId);
  const result={client,projects};
  for(const key of ['tasks','contracts','posts','notes','invoices','expenses','resources','websites','prospects','documents','meetingNotes','proposals','retainers'])result[key]=list(data,key).filter(linked);
  const address=client.email?.trim().toLowerCase();
  result.emails=list(data,'emails').filter(m=>activeMail(m)&&(linked(m)||!m.clientId&&address&&emailAddresses([m.from,m.to,...(m.cc||[]),...(m.bcc||[])]).includes(address))).map(m=>({...m,matchedBy:m.clientId===id?'Linked':m.projectId&&projectIds.has(m.projectId)?'Project':'Email address'}));
  const proposalIds=new Set(result.proposals.map(p=>p.id));result.variations=list(data,'variations').filter(v=>proposalIds.has(v.proposalId));
  const invoiceIds=new Set(result.invoices.map(i=>i.id));result.payments=list(data,'payments').filter(p=>invoiceIds.has(p.invoiceId));
  const mediaIds=new Set(result.posts.flatMap(p=>p.mediaIds||[]));
  result.files=list(data,'media').filter(m=>linked(m)||mediaIds.has(m.id)).map(m=>({...m,fileType:'media'}));
  const attachmentIds=new Set(result.emails.flatMap(m=>m.attachmentIds||[]));
  result.files.push(...list(data,'attachments').filter(a=>attachmentIds.has(a.id)).map(a=>({...a,fileType:'email'})));
  const seen=new Set(result.files.map(f=>f.id));
  for(const message of list(data,'messages').filter(m=>projectIds.has(m.projectId)))for(const file of message.attachments||[])if(!seen.has(file.id)){seen.add(file.id);result.files.push({...file,fileType:'chat'});}
  const entityIds=new Set([id,...Object.values(result).filter(Array.isArray).flat().map(r=>r.id)]);
  result.approvals=list(data,'approvals').filter(a=>entityIds.has(a.entityId)||a.payload?.record&&linked(a.payload.record));
  result.activity=list(data,'activity').filter(a=>entityIds.has(a.entityId)).slice(0,50);
  return result;
}
// Decisions and fixes that are waiting on the owner, each with the reason and where to act. Shared with the assistant.
export function nextActions(data,now=new Date()) {
  const day=brisbaneDay(now),projects=new Map(list(data,'projects').map(p=>[p.id,p])),name=id=>projects.get(id)?.name||'a project',items=[];
  const evidence=list(data,'ticketEvidence'),byTask=id=>evidence.filter(e=>e.taskId===id).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  const add=(urgency,title,why,target)=>items.push({urgency,title,why,target});
  for(const plan of list(data,'deliveryPlans').filter(p=>p.status==='Proposed')){const run=list(data,'deliveryRuns').find(r=>r.id===plan.runId);if(run&&!['Cancelled','Complete'].includes(run.status))add(1,`Approve or revise the delivery plan for ${name(plan.projectId)}`,`${plan.proposedBy} proposed ${plan.items.length} ticket${plan.items.length===1?'':'s'}. Nothing is created or started until you approve.`,{project:plan.projectId,tab:'delivery'});}
  for(const run of list(data,'deliveryRuns').filter(r=>r.status==='Needs attention'))add(1,`${run.engine} delivery run needs attention`,run.error||run.log?.at(-1)?.text||'The run stopped and is waiting for you.',{project:run.projectId,tab:'delivery'});
  for(const t of list(data,'tasks').filter(t=>projects.get(t.projectId)?.workflow==='Software')){
    const own=byTask(t.id),review=own.filter(e=>e.kind==='Review').at(-1),checks=new Map();for(const e of own.filter(e=>e.kind==='Check'))checks.set(String(e.title).trim().toLowerCase(),e);
    const failing=[...checks.values()].filter(e=>e.result==='Failed'),key=t.ticketKey?t.ticketKey+' ':'';
    if(t.status==='In review'&&!(review?.result==='Passed'&&review.recordedBy==='You'))add(1,`Review ${key}${t.title}`,`Submitted for review with ${own.length} evidence entr${own.length===1?'y':'ies'}. Your approval is what lets it move to QA.`,{edit:['tasks',t.id]});
    if(t.status==='Ready for release'&&!own.some(e=>e.kind==='Release'&&e.result==='Passed'&&e.recordedBy==='You'))add(2,`Sign off the release of ${key}${t.title}`,'Acceptance is verified. It needs your release or delivery sign-off before Done.',{edit:['tasks',t.id]});
    if(failing.length&&!['Done','Cancelled'].includes(t.status))add(2,`Fix failing check${failing.length>1?'s':''} on ${key}${t.title}`,`${failing.map(e=>e.title).join(', ')} failed. It cannot move forward until a later run passes.`,{edit:['tasks',t.id]});
    if(t.status==='Blocked')add(2,`Unblock ${key}${t.title}`,t.blockedReason||'Blocked without a recorded reason.',{edit:['tasks',t.id]});
  }
  for(const r of list(data,'releases').filter(r=>r.status==='Approved'))add(2,`Verify release ${r.name} for ${name(r.projectId)}`,`Approved ${brisbaneDay(r.approvedAt)}. Check the environment, then mark it released or failed.`,{project:r.projectId,tab:'delivery'});
  for(const e of list(data,'standardExceptions').filter(e=>e.status==='Proposed'))add(3,`Decide on the exception “${e.title}”`,`${e.proposedBy||'Someone'} proposed relaxing ${e.rule||'the engineering standard'} for ${name(e.projectId)}: ${e.reason}`,{project:e.projectId,tab:'delivery'});
  const prds=list(data,'documents').filter(d=>d.category==='PRD');for(const prd of prds){const proposed=list(data,'requirements').filter(r=>r.prdId===prd.id&&r.lastEditedBy&&r.lastEditedBy!=='You'),latest=list(data,'prdRevisions').filter(v=>v.prdId===prd.id).sort((a,b)=>b.number-a.number)[0];const pending=proposed.filter(r=>!latest||Date.parse(r.updatedAt)>Date.parse(latest.approvedAt));if(pending.length)add(3,`Review requirement changes in ${prd.title}`,`${[...new Set(pending.map(r=>r.lastEditedBy))].join(' and ')} edited ${pending.length} requirement${pending.length===1?'':'s'} since the last approved revision.`,{project:prd.projectId,tab:'plan'});}
  for(const p of list(data,'projects').filter(p=>p.templateId&&p.status!=='Complete')){const latest=list(data,'templateVersions').filter(v=>v.templateId===p.templateId).sort((a,b)=>b.number-a.number)[0];if(latest&&latest.number>(p.templateVersion||0))add(3,`Template update available for ${p.name}`,`${latest.snapshot?.name||'Its template'} is now version ${latest.number} (${latest.reason}). Review what it would add; existing tickets are not changed.`,{project:p.id,tab:'overview'});}
  for(const a of list(data,'automationAlerts').filter(a=>!a.dismissed))add(2,a.message,`Flagged by your rule “${a.ruleName}”.`,{...(a.recordId&&a.recordCollection&&!['projects'].includes(a.recordCollection)?{edit:[a.recordCollection,a.recordId]}:a.projectId?{project:a.projectId,tab:'overview'}:{page:'automations'}),alert:a.id});
  const overdue=list(data,'tasks').filter(t=>!['Done','Cancelled'].includes(t.status)&&recordDay(t.dueDate)&&recordDay(t.dueDate)<day);if(overdue.length)add(3,`${overdue.length} overdue task${overdue.length===1?'':'s'}`,`The oldest was due ${recordDay(overdue.map(t=>t.dueDate).sort()[0])}. Reschedule or finish them so Today stays honest.`,{page:'todo'});
  return items.sort((a,b)=>a.urgency-b.urgency);
}
export function todaySummary(data,now=new Date()) {
  const day=brisbaneDay(now),soon=brisbaneDay(new Date(new Date(day+'T00:00:00+10:00').getTime()+7*86400000));
  const due=(value,end=day)=>{const d=recordDay(value);return !!d&&d<=end;};
  const tasks=list(data,'tasks').filter(t=>!['Done','Cancelled'].includes(t.status));
  const taskOrder=(a,b)=>(recordDay(a.dueDate)||'9999').localeCompare(recordDay(b.dueDate)||'9999')||({High:0,Medium:1,Low:2}[a.priority]??1)-({High:0,Medium:1,Low:2}[b.priority]??1);
  const deadlines=[...list(data,'projects').filter(p=>p.status!=='Complete'&&due(p.dueDate,soon)).map(p=>({...p,collection:'projects',title:p.name})),...list(data,'contracts').filter(c=>!['Signed','Declined','Expired'].includes(c.status)&&due(c.dueDate,soon)).map(c=>({...c,collection:'contracts'}))].sort(taskOrder);
  const invoices=(data.finance?.invoices||[]).filter(i=>i.outstanding>0&&i.state!=='Void'&&i.state!=='Draft'&&(due(i.dueDate)||due(i.followUpDate)));
  const inbox=list(data,'mailFolders').find(f=>f.isInbox||f.name?.toLowerCase()==='inbox');
  const unread=list(data,'emails').filter(m=>activeMail(m)&&m.status==='Received'&&!m.isRead&&(!inbox||m.folderId===inbox.id)).sort((a,b)=>(a.importance==='high'?-1:0)-(b.importance==='high'?-1:0)||Date.parse(b.receivedAt||b.createdAt)-Date.parse(a.receivedAt||a.createdAt));
  const todayTasks=tasks.filter(t=>due(t.dueDate)).sort(taskOrder),suggested=tasks.filter(t=>!t.dueDate&&t.priority==='High').slice(0,5);
  return {day,timezone:'Australia/Brisbane',nextActions:nextActions(data,now),tasks:todayTasks,suggested,deadlines,invoices,unread,approvals:list(data,'approvals').filter(a=>['Pending','Running'].includes(a.status)),posts:list(data,'posts').filter(p=>p.status==='Scheduled'&&due(p.scheduledAt,soon)).sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt)),prospects:data.followUps?data.followUps.items.filter(r=>r.state==='Due').map(r=>({...r.prospect,followUpDate:r.dueDate,followUpReason:r.reason})):list(data,'prospects').filter(p=>!['Won','Lost'].includes(p.status)&&due(p.followUpDate)).sort((a,b)=>recordDay(a.followUpDate).localeCompare(recordDay(b.followUpDate))),overdueTasks:todayTasks.filter(t=>recordDay(t.dueDate)<day).length};
}
