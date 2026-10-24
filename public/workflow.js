// Ticket workflow shared by the server (enforcement) and the browser (checklists).
// Simple projects keep the original agency task statuses. Software projects use gated statuses:
// a ticket only moves forward when the evidence each step needs has been recorded.
export const SIMPLE_STATUSES=['Backlog','To do','In progress','In review','Blocked','Done','Cancelled'];
export const SOFTWARE_FLOW=['Backlog','Ready','In progress','In review','QA / staging','Ready for release','Done'];
export const SOFTWARE_STATUSES=[...SOFTWARE_FLOW,'Blocked','Cancelled'];
export const ALL_STATUSES=['Backlog','To do','Ready','In progress','In review','QA / staging','Ready for release','Blocked','Done','Cancelled'];
export const CLOSED_STATUSES=['Done','Cancelled'];
export const EVIDENCE_KINDS=['Change','Check','Review','Acceptance','Environment','Release','Documentation'];
export const OWNER_ONLY_PASSES=['Review','Release'];
export const evidenceHelp={Change:'A reviewable change: pull request, commit, diff or delivered file.',Check:'A test, build, lint or other check and its actual result.',Review:'A person’s review outcome. Only the owner can record an approval.',Acceptance:'Acceptance criteria checked, ideally per linked requirement.',Environment:'Where it was verified: preview, staging or production URL.',Release:'The verified release or accepted deliverable. Only the owner can record it.',Documentation:'Docs, release notes or known limitations updated.'};

export const isSoftware=project=>project?.workflow==='Software';
export const statusesFor=project=>isSoftware(project)?SOFTWARE_STATUSES:SIMPLE_STATUSES;
export const isClosed=task=>CLOSED_STATUSES.includes(task?.status);

// Evidence order comes from the per-ticket sequence the server assigns; timestamps can tie.
export const inOrder=list=>[...list].sort((a,b)=>(a.sequence||0)-(b.sequence||0)||Date.parse(a.recordedAt||a.createdAt)-Date.parse(b.recordedAt||b.createdAt));
// Latest result per check name, so a later pass supersedes an earlier failure of the same check.
export function checkState(evidence){
  const latest=new Map();for(const e of inOrder(evidence.filter(e=>e.kind==='Check')))latest.set(String(e.title||'').trim().toLowerCase(),e);
  const checks=[...latest.values()];return {checks,failing:checks.filter(e=>e.result==='Failed'),passing:checks.filter(e=>e.result==='Passed')};
}
const passed=(evidence,kind,ownerOnly=false)=>evidence.filter(e=>e.kind===kind&&e.result==='Passed'&&(!ownerOnly||e.recordedBy==='You'));

// What a ticket still needs before it can enter `target`. Forward moves must satisfy every gate on the way.
// Moving back needs nothing. A Blocked or Cancelled ticket re-enters the flow from the start, so every gate up to
// its target applies again. Blocked and Cancelled themselves need a written reason.
export function gateProblems(task,target,{evidence=[],tasks=[]}={}){
  const problems=[];
  if(target==='Blocked'){if(!String(task.blockedReason||'').trim())problems.push('Say why it is blocked and what decision or dependency it needs.');return problems;}
  if(target==='Cancelled'){if(!String(task.cancelReason||'').trim())problems.push('Record why it was cancelled and the effect on scope.');return problems;}
  const to=SOFTWARE_FLOW.indexOf(target);if(to<0)return [`${target} is not a software workflow status.`];
  const paused=['Blocked','Cancelled'].includes(task.status),start=paused?0:Math.max(SOFTWARE_FLOW.indexOf(task.status),0);
  if(!paused&&to<=start)return problems;
  const need=step=>{const index=SOFTWARE_FLOW.indexOf(step);return index>start&&index<=to;};
  const own=evidence.filter(e=>e.taskId===task.id),checks=checkState(own);
  if(need('Ready')){
    if(!String(task.acceptanceCriteria||'').trim())problems.push('Ready needs acceptance criteria.');
    if(['Epic','Feature','Story'].includes(task.type||'Task')&&!(task.requirementIds||[]).length)problems.push(`Ready needs a linked PRD requirement for a ${task.type}.`);
  }
  if(need('In progress')){
    if(!String(task.implementationPlan||'').trim())problems.push('In progress needs an implementation plan.');
    const open=(task.dependencyIds||[]).map(id=>tasks.find(t=>t.id===id)).filter(t=>!t||t.status!=='Done');
    if(open.length)problems.push(`In progress needs its dependencies done first: ${open.map(t=>t?.ticketKey||t?.title||'a missing ticket').join(', ')}.`);
  }
  if(need('In review')){
    if(!own.some(e=>e.kind==='Change'))problems.push('In review needs a reviewable change recorded (pull request, commit, diff or file).');
    if(!checks.checks.length)problems.push('In review needs at least one check result recorded.');
  }
  if(need('QA / staging')){
    const latestReview=inOrder(own.filter(e=>e.kind==='Review')).at(-1);
    if(!latestReview||latestReview.result!=='Passed'||latestReview.recordedBy!=='You')problems.push(latestReview?.result==='Failed'?'QA / staging needs your review approval; the latest review requested changes.':'QA / staging needs your review approval recorded.');
  }
  if(need('Ready for release')){
    const accepted=passed(own,'Acceptance'),covered=new Set(accepted.flatMap(e=>e.requirementIds||[])),missing=(task.requirementIds||[]).filter(id=>!covered.has(id));
    if(!accepted.length)problems.push('Ready for release needs acceptance criteria verified and recorded.');
    else if(missing.length)problems.push(`Ready for release needs acceptance evidence for every linked requirement (${missing.length} not covered).`);
  }
  if(need('Done')&&!passed(own,'Release',true).length)problems.push('Done needs your verification of the release or delivered work recorded.');
  if(to>=SOFTWARE_FLOW.indexOf('In review')&&checks.failing.length)problems.push(`Failing checks must pass before moving forward: ${checks.failing.map(e=>e.title).join(', ')}.`);
  return problems;
}
