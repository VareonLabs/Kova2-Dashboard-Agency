// Services you sell, the proposals built from them, and the variations that change an accepted scope.
export const lineTotal=l=>Math.round(Number(l.quantity||0)*Number(l.unitPrice||0)*100)/100;
export const linesTotal=lines=>Math.round(lines.reduce((n,l)=>n+Math.round(lineTotal(l)*100),0))/100;
export const proposalValue=(proposal,variations)=>{
  const approved=variations.filter(v=>v.proposalId===proposal.id&&v.status==='Approved').reduce((n,v)=>n+Math.round(v.amountChange*100),0);
  return Math.round(linesTotal(proposal.lineItems||[])*100+approved)/100;
};

export function createProposalsUI(ctx){
  const {esc,icon,api,currency,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const clientName=id=>data().clients.find(c=>c.id===id)?.name||'No client';

  function servicesPanel(){
    const list=data().services||[];
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Service</th><th>Billed</th><th>Price</th><th></th></tr></thead><tbody>${list.map(s=>`<tr><td><button class="link title-cell" data-edit="services:${s.id}">${esc(s.name)}</button>${s.description?`<small>${esc(s.description)}</small>`:''}</td><td>${esc(s.billing)}</td><td>${currency(s.unitPrice)} <small>per ${esc(s.unit)}</small></td><td>${s.active?'':'<span class="badge gray">Inactive</span>'}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('file','Nothing in the catalogue yet','List what you sell, with a standard price, so proposals start from real numbers.',ctx.addButton('services','Add a service'));
    return ctx.panel('Service catalogue',`${list.length} services`,body,list.length?ctx.addButton('services','Add a service'):'');
  }

  function proposalsPanel(){
    const list=ctx.viewRecords('proposals',data().proposals||[]);
    const variations=data().variations||[];
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Proposal</th><th>Client</th><th>Value</th><th>Stage</th><th>Valid until</th></tr></thead><tbody>${list.map(p=>{const pending=variations.filter(v=>v.proposalId===p.id&&v.status==='Proposed').length;return `<tr><td><button class="link title-cell" data-edit="proposals:${p.id}">${esc(p.title)}</button>${pending?`<small>${pending} variation${pending>1?'s':''} awaiting a decision</small>`:''}</td><td>${esc(clientName(p.clientId))}</td><td>${currency(proposalValue(p,variations))}</td><td>${badge(p.status)}</td><td>${fmt(p.validUntil)}</td></tr>`;}).join('')}</tbody></table></div>`:ctx.empty('file','No proposals yet','Pick a client, add lines from your catalogue, and send it. Accepting one raises the agreement for you.',ctx.addButton('proposals','New proposal'));
    return ctx.panel('Proposals',`${list.length} proposals`,body,list.length?ctx.addButton('proposals','New proposal'):'');
  }

  function render(){
    return ctx.heading('SELL','Proposals','Quote from your catalogue, then turn an accepted proposal into an agreement.',ctx.addButton('proposals','New proposal'))+ctx.toolbar(['All','Draft','Sent','Accepted','Declined'])+proposalsPanel()+servicesPanel();
  }

  const lineRow=(l={},services)=>`<div class="line-row" data-line><select data-line-service aria-label="Service"><option value="">Custom line</option>${services.map(s=>`<option value="${esc(s.id)}" ${l.serviceId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><input data-line-description aria-label="Description" placeholder="What is being sold" value="${esc(l.description||'')}"><input data-line-quantity aria-label="Quantity" type="number" min="0.01" step="0.01" value="${esc(l.quantity??1)}"><input data-line-price aria-label="Unit price" type="number" min="0" step="0.01" value="${esc(l.unitPrice??'')}"><span class="line-total" data-line-total>${currency(lineTotal(l))}</span><button type="button" class="icon-btn" data-line-remove aria-label="Remove line">${icon('x')}</button></div>`;

  function variationsHTML(proposal){
    const list=(data().variations||[]).filter(v=>v.proposalId===proposal.id);
    const rows=list.length?list.map(v=>`<div class="project-record"><div><strong>${esc(v.title)}</strong><span class="sub">${v.amountChange<0?'−':'+'}${currency(Math.abs(v.amountChange))}${v.reason?' · '+esc(v.reason):''}</span></div><div class="row-actions">${badge(v.status)}${v.status==='Proposed'?`<button class="btn small" data-variation="${v.id}:Approved">Approve</button><button class="btn small" data-variation="${v.id}:Rejected">Reject</button>`:''}</div></div>`).join(''):'<p class="sub">No variations. The scope and price are as accepted.</p>';
    return `<h3>Variations</h3>${rows}<form id="variation-form" class="form-grid"><div class="field"><label for="v-title">Change *</label><input id="v-title" required placeholder="Extra landing page"></div><div class="field"><label for="v-amount">Price change (AUD, negative to reduce) *</label><input id="v-amount" type="number" step="0.01" required></div><div class="field full"><label for="v-reason">Reason</label><input id="v-reason"></div><div class="form-actions"><button class="btn" type="submit">Add variation</button></div></form>`;
  }

  function edit(record={}){
    const services=(data().services||[]).filter(s=>s.active||(record.lineItems||[]).some(l=>l.serviceId===s.id));
    const accepted=record.status==='Accepted';
    const contract=record.contractId?data().contracts.find(c=>c.id===record.contractId):null;
    const lines=(record.lineItems&&record.lineItems.length?record.lineItems:[{}]);
    const field=(key,label,input,full)=>`<div class="field ${full?'full':''}"><label for="p-${key}">${label}</label>${input}</div>`;
    const clientSelect=`<select id="p-clientId" required ${accepted?'disabled':''}><option value="">Choose a client</option>${data().clients.map(c=>`<option value="${esc(c.id)}" ${record.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`;
    const projectSelect=`<select id="p-projectId"><option value="">No project yet</option>${data().projects.map(p=>`<option value="${esc(p.id)}" ${record.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    const stage=`<select id="p-status"><option ${record.status==='Draft'||!record.status?'selected':''}>Draft</option><option ${record.status==='Sent'?'selected':''}>Sent</option><option ${record.status==='Declined'?'selected':''}>Declined</option><option ${record.status==='Expired'?'selected':''}>Expired</option></select>`;
    ctx.modal(record.id?`Proposal · ${record.title}`:'New proposal',`<form id="proposal-form"><div class="form-grid">${field('title','Proposal name *',`<input id="p-title" required value="${esc(record.title||'')}">`,true)}${field('clientId','Client *',clientSelect)}${field('projectId','Project',projectSelect)}${accepted?'':field('status','Stage',stage)}${field('depositPercent','Deposit required (% of value)',`<input id="p-depositPercent" type="number" min="0" max="100" step="1" value="${esc(record.depositPercent||0)}" ${accepted?'disabled':''}>`)}${field('validUntil','Valid until',`<input id="p-validUntil" type="date" value="${esc(String(record.validUntil||'').slice(0,10))}">`)}${field('notes','Scope notes and terms',`<textarea id="p-notes">${esc(record.notes||'')}</textarea>`,true)}</div><h3>Lines</h3>${accepted?'<div class="notice">Accepted proposals are locked. Add a variation to change the scope or price.</div>':''}<div id="lines">${lines.map(l=>lineRow(l,services)).join('')}</div>${accepted?'':`<button type="button" class="btn small" id="add-line">${icon('plus')}Add line</button>`}<p class="line-sum"><span>Total</span><strong id="p-total">${currency(linesTotal(lines))}</strong></p>${contract?`<div class="notice">Agreement raised: <button type="button" class="link" id="open-contract">${esc(contract.title)}</button> · ${esc(contract.status)}</div>`:''}<div class="form-error hidden" id="form-error"></div><div class="form-actions">${record.id&&!accepted?'<button type="button" class="btn danger" id="delete-proposal">Delete</button>':''}${!accepted?'<button type="button" class="btn" id="accept-proposal">Accept and raise agreement</button>':''}<button class="btn primary" type="submit">Save proposal</button></div></form>${accepted?variationsHTML(record):''}`,'drawer');
    const form=document.querySelector('#proposal-form'),box=document.querySelector('#lines');
    const read=()=>[...box.querySelectorAll('[data-line]')].map(row=>({serviceId:row.querySelector('[data-line-service]').value,description:row.querySelector('[data-line-description]').value.trim(),quantity:Number(row.querySelector('[data-line-quantity]').value||0),unitPrice:Number(row.querySelector('[data-line-price]').value||0)})).filter(l=>l.description||l.serviceId);
    const retotal=()=>{box.querySelectorAll('[data-line]').forEach(row=>{row.querySelector('[data-line-total]').textContent=currency(lineTotal({quantity:row.querySelector('[data-line-quantity]').value,unitPrice:row.querySelector('[data-line-price]').value}));});document.querySelector('#p-total').textContent=currency(linesTotal(read()));};
    const wire=()=>{
      box.querySelectorAll('[data-line]').forEach(row=>{
        if(accepted)row.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
        row.querySelector('[data-line-service]').onchange=e=>{const s=(data().services||[]).find(x=>x.id===e.target.value);if(s){row.querySelector('[data-line-description]').value=s.name;row.querySelector('[data-line-price]').value=s.unitPrice;}retotal();};
        row.querySelectorAll('input').forEach(el=>el.oninput=retotal);
        row.querySelector('[data-line-remove]').onclick=()=>{if(box.querySelectorAll('[data-line]').length>1){row.remove();retotal();}};
      });
    };
    wire();
    document.querySelector('#add-line')?.addEventListener('click',()=>{box.insertAdjacentHTML('beforeend',lineRow({},services));wire();});
    const payload=()=>({title:form.querySelector('#p-title').value,clientId:form.querySelector('#p-clientId').value,projectId:form.querySelector('#p-projectId').value,status:accepted?'Accepted':form.querySelector('#p-status').value,validUntil:form.querySelector('#p-validUntil').value,depositPercent:Number(form.querySelector('#p-depositPercent').value||0),notes:form.querySelector('#p-notes').value,lineItems:read()});
    const save=async()=>record.id?api(`/records/proposals/${record.id}`,{method:'PUT',body:JSON.stringify(payload())}):api('/records/proposals',{method:'POST',body:JSON.stringify(payload())});
    const fail=error=>{const el=document.querySelector('#form-error');el.textContent=error.message;el.classList.remove('hidden');};
    form.onsubmit=async e=>{e.preventDefault();try{await save();ctx.closeModal();await ctx.refresh();}catch(error){fail(error);}};
    document.querySelector('#delete-proposal')?.addEventListener('click',async()=>{try{await api(`/records/proposals/${record.id}`,{method:'DELETE'});ctx.closeModal();await ctx.refresh();}catch(error){fail(error);}});
    document.querySelector('#accept-proposal')?.addEventListener('click',async()=>{try{const saved=await save();const result=await api(`/proposals/${saved.id}/accept`,{method:'POST',body:'{}'});ctx.closeModal();await ctx.refresh();ctx.toast(`Accepted. Draft agreement “${result.contract.title}” raised.`);}catch(error){fail(error);}});
    document.querySelector('#open-contract')?.addEventListener('click',()=>{const c=data().contracts.find(x=>x.id===record.contractId);if(c)ctx.editor('contracts',c);});
    document.querySelector('#variation-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/records/variations',{method:'POST',body:JSON.stringify({proposalId:record.id,title:document.querySelector('#v-title').value,amountChange:document.querySelector('#v-amount').value,reason:document.querySelector('#v-reason').value})});await ctx.refresh();edit(data().proposals.find(p=>p.id===record.id));}catch(error){fail(error);}});
    document.querySelectorAll('[data-variation]').forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.variation.split(':');try{await api(`/records/variations/${id}`,{method:'PUT',body:JSON.stringify({status})});await ctx.refresh();edit(data().proposals.find(p=>p.id===record.id));}catch(error){fail(error);}});
  }

  return {render,edit};
}
