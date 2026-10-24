// Delivery plans waiting for the owner: where they show up, and one dialog to read the plan and decide.
import { agencyStandard } from './requirements.js';

const ACTIVE=run=>run&&!['Cancelled','Complete'].includes(run.status);

export function createPlanReview(ctx){
  const {esc,api}=ctx;
  const data=()=>ctx.getData();
  const seen=new Set();
  const projectName=id=>data().projects.find(p=>p.id===id)?.name||'a project';

  function waiting(){
    const runs=data().deliveryRuns||[];
    return (data().deliveryPlans||[]).filter(p=>p.status==='Proposed').map(plan=>({plan,run:runs.find(r=>r.id===plan.runId)})).filter(x=>ACTIVE(x.run));
  }
  // A run the assistant stopped because the project has no approved engineering standard. Only the owner can approve one.
  const hasStandard=projectId=>(data().standardRevisions||[]).some(r=>r.projectId===projectId);
  const needStandard=()=>(data().deliveryRuns||[]).filter(r=>r.status==='Needs attention'&&/engineering standard/i.test(`${r.error||''} ${r.log?.at(-3)?.text||''} ${r.log?.at(-2)?.text||''}`+(data().tasks||[]).filter(t=>t.deliveryRunId===r.id).map(t=>t.blockedReason||'').join(' ')));
  // Tickets the assistant has finished and submitted. Only the owner can record the review that lets them move on.
  const reviewReady=()=>(data().deliveryRuns||[]).filter(r=>r.status==='Awaiting review').flatMap(run=>(data().tasks||[]).filter(t=>t.deliveryRunId===run.id&&t.status==='In review').map(task=>({run,task})));
  const count=()=>waiting().length+needStandard().length+reviewReady().length;
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

  // The same card is shown wherever the owner is likely to look: assistant panel, chat, Reviews, Start here.
  function cards(){
    const list=waiting(),stuck=needStandard(),review=reviewReady();
    if(!list.length&&!stuck.length&&!review.length)return '';
    const reviewCards=review.map(({task})=>{const n=(data().ticketEvidence||[]).filter(e=>e.taskId===task.id).length;return `<section class="attention-card"><div><strong>Ready for your review</strong><p>${esc(task.ticketKey?task.ticketKey+' · ':'')}${esc(task.title)} was built by the assistant, with ${n} piece${n===1?'':'s'} of evidence. Nothing moves on until you review it.</p></div><button type="button" class="btn primary" data-review-ticket="${esc(task.id)}">Open ticket</button></section>`;}).join('');
    const standardCards=stuck.map(run=>hasStandard(run.projectId)?`<section class="attention-card"><div><strong>Engineering standard approved</strong><p>${esc(projectName(run.projectId))} can carry on. The assistant stopped before it was approved. Continuing puts its blocked ticket back to Ready and uses your plan allowance.</p></div><button type="button" class="btn primary" data-standard-continue="${esc(run.id)}">Continue building</button></section>`:`<section class="attention-card"><div><strong>The assistant needs an engineering standard</strong><p>It stopped on ${esc(projectName(run.projectId))} because the project has no approved standard to work to. Approving one is your decision.</p></div><button type="button" class="btn primary" data-standard-open="${esc(run.id)}">Review standard</button></section>`).join('');
    return `<div class="attention" role="region" aria-label="Waiting for you">${reviewCards}${standardCards}${list.map(({plan,run})=>`<section class="attention-card"><div><strong>Plan ready for your approval</strong><p>${esc(run.engine)} planned ${plural(plan.items.length,'ticket')} for ${esc(projectName(plan.projectId))}. Nothing is created or started until you approve.</p></div><button type="button" class="btn primary" data-plan-open="${esc(plan.id)}">Review plan</button></section>`).join('')}</div>`;
  }

  function open(planId){
    const plan=(data().deliveryPlans||[]).find(p=>p.id===planId),run=plan&&(data().deliveryRuns||[]).find(r=>r.id===plan.runId);
    if(!plan||!run||plan.status!=='Proposed'){ctx.toast('That plan has already been decided.');return;}
    const noStandard=!(data().standardRevisions||[]).some(r=>r.projectId===plan.projectId);
    const items=plan.items.map(it=>`<article class="plan-item"><div class="plan-item-head"><strong>${esc(it.title)}</strong><span class="row-sub">${esc(it.type||'Task')} · ${esc(it.priority||'Medium')} priority</span></div>${(it.requirementCodes||[]).length?`<div class="plan-codes">${it.requirementCodes.map(c=>`<span class="badge">${esc(c)}</span>`).join('')}</div>`:''}<p class="plan-criteria"><small>It is done when</small>${esc(it.acceptanceCriteria||'No criteria written.')}</p>${it.implementationPlan?`<details><summary>How it will be done</summary><p>${esc(it.implementationPlan)}</p></details>`:''}</article>`).join('');
    ctx.modal(`Plan for ${projectName(plan.projectId)}`,`<div class="plan-review"><p class="sub">${esc(plan.summary||'')}</p>${noStandard?'<div class="notice">This project has no approved engineering standard. The assistant said one is needed before it builds anything. You can approve the plan now and set the standard before building.</div>':''}<h3>${plural(plan.items.length,'ticket')} it would create</h3>${items}<div class="notice">Approving creates these tickets on the project board. Choosing <strong>Approve and start building</strong> also starts the assistant on them, which uses your plan allowance. It works one ticket at a time and stops for your review before anything moves on.</div><div class="form-error hidden" id="pr-error"></div><div class="plan-changes hidden" id="pr-changes"><label for="pr-reason">What should change?</label><textarea id="pr-reason" placeholder="e.g. Split this into two tickets, and add a check for phone widths."></textarea><div class="form-actions"><button type="button" class="btn primary" id="pr-send">Send back and re-plan</button></div></div><div class="form-actions" id="pr-actions"><button type="button" class="btn" id="pr-ask">Ask for changes</button><button type="button" class="btn" id="pr-approve">Approve only</button><button type="button" class="btn primary" id="pr-start">Approve and start building</button></div></div>`,'wide');
    const fail=e=>{const el=document.querySelector('#pr-error');el.textContent=e.message;el.classList.remove('hidden');};
    const busy=state=>document.querySelectorAll('#pr-actions button,#pr-send').forEach(b=>b.disabled=state);
    const go=async(fn,message)=>{busy(true);try{await fn();ctx.closeModal();await ctx.refresh();ctx.toast(message);}catch(e){fail(e);busy(false);}};
    const approve=()=>api(`/delivery-runs/${run.id}/plans/${plan.id}/approve`,{method:'POST',body:'{}'});
    const resume=()=>api(`/delivery-runs/${run.id}/resume`,{method:'POST',body:'{}'});
    document.querySelector('#pr-approve').onclick=()=>go(approve,'Plan approved. Its tickets are on the board.');
    document.querySelector('#pr-start').onclick=()=>go(async()=>{await approve();await resume();},'Approved. The assistant has started on the first ticket.');
    document.querySelector('#pr-ask').onclick=()=>{document.querySelector('#pr-changes').classList.remove('hidden');document.querySelector('#pr-actions').classList.add('hidden');document.querySelector('#pr-reason').focus();};
    document.querySelector('#pr-send').onclick=()=>{const reason=document.querySelector('#pr-reason').value.trim();if(!reason)return fail(new Error('Say what should change.'));go(async()=>{await api(`/delivery-runs/${run.id}/plans/${plan.id}/reject`,{method:'POST',body:JSON.stringify({reason})});await resume();},'Sent back. The assistant is working on a new plan.');};
  }

  // Put the run's blocked tickets back to Ready and let the assistant carry on.
  async function carryOn(run){
    for(const t of (data().tasks||[]).filter(t=>t.deliveryRunId===run.id&&t.status==='Blocked'))await api(`/records/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({status:'Ready',blockedReason:''})});
    await api(`/delivery-runs/${run.id}/resume`,{method:'POST',body:'{}'});
  }
  const lines=text=>String(text||'').split('\n').filter(Boolean).map(l=>`<li>${esc(l)}</li>`).join('');
  function openStandard(runId){
    const run=(data().deliveryRuns||[]).find(r=>r.id===runId);if(!run)return;
    const std=agencyStandard;
    ctx.modal(`Engineering standard for ${projectName(run.projectId)}`,`<div class="plan-review"><p class="sub">This is the standard the assistant works to: what counts as done, how code is handled, and who reviews it. It starts from <strong>${esc(std.baseVersion)}</strong>. Approving it records this exact wording against the project, and any later change needs a reason.</p><h3>Definition of done</h3><ul class="std-list">${lines(std.definitionOfDone)}</ul><h3>Repository conventions</h3><ul class="std-list">${lines(std.repositoryConventions)}</ul><h3>Review and approval policy</h3><ul class="std-list">${lines(std.reviewPolicy)}</ul><div class="notice">Choosing <strong>Approve and continue building</strong> also puts the blocked ticket back to Ready and resumes the assistant, which uses your plan allowance. You can edit the standard later from the project's Delivery tab.</div><div class="form-error hidden" id="sd-error"></div><div class="form-actions" id="sd-actions"><button type="button" class="btn" id="sd-approve">Approve only</button><button type="button" class="btn primary" id="sd-go">Approve and continue building</button></div></div>`,'wide');
    const fail=e=>{const el=document.querySelector('#sd-error');el.textContent=e.message;el.classList.remove('hidden');};
    const approve=async()=>{
      if(hasStandard(run.projectId))return;
      if(!(data().projectStandards||[]).some(s=>s.projectId===run.projectId))await api('/records/projectStandards',{method:'POST',body:JSON.stringify({projectId:run.projectId,...std})});
      await api(`/projects/${run.projectId}/standard/revisions`,{method:'POST',body:'{}'});
    };
    const go=async(fn,message)=>{document.querySelectorAll('#sd-actions button').forEach(b=>b.disabled=true);try{await fn();ctx.closeModal();await ctx.refresh();ctx.toast(message);}catch(e){fail(e);document.querySelectorAll('#sd-actions button').forEach(b=>b.disabled=false);}};
    document.querySelector('#sd-approve').onclick=()=>go(approve,'Standard approved.');
    document.querySelector('#sd-go').onclick=()=>go(async()=>{await approve();await carryOn(run);},'Standard approved. The assistant is carrying on.');
  }

  // Say so once per plan per session, so a plan finishing in the background is not missed.
  function notice(){
    const fresh=waiting().filter(({plan})=>!seen.has(plan.id));
    fresh.forEach(({plan})=>seen.add(plan.id));
    const ready=reviewReady().filter(x=>!seen.has('rev:'+x.task.id));
    ready.forEach(x=>seen.add('rev:'+x.task.id));
    const stuck=needStandard().filter(r=>!seen.has('std:'+r.id));
    stuck.forEach(r=>seen.add('std:'+r.id));
    if(fresh.length)ctx.toast(fresh.length===1?'A plan is ready for your approval. Look for “Review plan”.':`${fresh.length} plans are ready for your approval.`);
    else if(ready.length)ctx.toast('A ticket is ready for your review. Look for “Open ticket”.');
    else if(stuck.length)ctx.toast('The assistant is waiting for you to approve an engineering standard. Look for “Review standard”.');
  }

  function bind(){document.querySelectorAll('[data-plan-open]').forEach(b=>b.onclick=()=>open(b.dataset.planOpen));document.querySelectorAll('[data-standard-open]').forEach(b=>b.onclick=()=>openStandard(b.dataset.standardOpen));document.querySelectorAll('[data-review-ticket]').forEach(b=>b.onclick=()=>{const t=(data().tasks||[]).find(x=>x.id===b.dataset.reviewTicket);if(t)ctx.editor('tasks',t);});document.querySelectorAll('[data-standard-continue]').forEach(b=>b.onclick=()=>{const run=(data().deliveryRuns||[]).find(r=>r.id===b.dataset.standardContinue);b.disabled=true;ctx.perform(async()=>{await carryOn(run);await ctx.refresh();ctx.toast('The assistant is carrying on.');});});}

  return {waiting,count,cards,open,notice,bind};
}
