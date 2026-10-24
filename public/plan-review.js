// Delivery plans waiting for the owner: where they show up, and one dialog to read the plan and decide.
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
  const count=()=>waiting().length;
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

  // The same card is shown wherever the owner is likely to look: assistant panel, chat, Reviews, Start here.
  function cards(){
    const list=waiting();
    if(!list.length)return '';
    return `<div class="attention" role="region" aria-label="Waiting for you">${list.map(({plan,run})=>`<section class="attention-card"><div><strong>Plan ready for your approval</strong><p>${esc(run.engine)} planned ${plural(plan.items.length,'ticket')} for ${esc(projectName(plan.projectId))}. Nothing is created or started until you approve.</p></div><button type="button" class="btn primary" data-plan-open="${esc(plan.id)}">Review plan</button></section>`).join('')}</div>`;
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

  // Say so once per plan per session, so a plan finishing in the background is not missed.
  function notice(){
    const fresh=waiting().filter(({plan})=>!seen.has(plan.id));
    fresh.forEach(({plan})=>seen.add(plan.id));
    if(fresh.length)ctx.toast(fresh.length===1?'A plan is ready for your approval. Look for “Review plan”.':`${fresh.length} plans are ready for your approval.`);
  }

  function bind(){document.querySelectorAll('[data-plan-open]').forEach(b=>b.onclick=()=>open(b.dataset.planOpen));}

  return {waiting,count,cards,open,notice,bind};
}
