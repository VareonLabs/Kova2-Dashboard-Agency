// Deals: money you might win, by stage, linked to a client or prospect and to the proposal that closes it.
export const DEAL_STAGES=['Qualified','Proposal sent','Negotiation','Won','Lost'];
export const STAGE_CHANCE={Qualified:0.2,'Proposal sent':0.5,Negotiation:0.75,Won:1,Lost:0};
export const isOpen=deal=>!['Won','Lost'].includes(deal.stage);
const cents=n=>Math.round(Number(n||0)*100);

export function dealStats(deals,now=new Date()){
  const month=now.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7);
  const open=deals.filter(isOpen),won=deals.filter(d=>d.stage==='Won'),lost=deals.filter(d=>d.stage==='Lost');
  const sum=list=>list.reduce((n,d)=>n+cents(d.value),0);
  return {
    open:open.length,
    openValue:sum(open)/100,
    weighted:Math.round(open.reduce((n,d)=>n+cents(d.value)*STAGE_CHANCE[d.stage],0))/100,
    wonThisMonth:sum(won.filter(d=>String(d.closedAt).slice(0,7)===month))/100,
    winRate:won.length+lost.length?Math.round(won.length/(won.length+lost.length)*100):null
  };
}

export function createDealsUI(ctx){
  const {esc,icon,api,currency,fmt}=ctx;
  let view='board';
  const data=()=>ctx.getData();
  const who=d=>data().clients.find(c=>c.id===d.clientId)?.name||data().prospects.find(p=>p.id===d.prospectId)?.name||'No contact';

  function card(d){
    const proposal=d.proposalId?data().proposals.find(p=>p.id===d.proposalId):null;
    return `<article class="kanban-card"><div style="display:flex;align-items:center;justify-content:space-between"><span class="row-sub" style="margin:0">${esc(who(d))}</span><button class="icon-btn" data-edit="deals:${esc(d.id)}" aria-label="Edit ${esc(d.title)}">${icon('more')}</button></div><button class="link" data-edit="deals:${esc(d.id)}"><h3>${esc(d.title)}</h3></button><div class="kanban-meta">${currency(d.value)}${d.expectedClose?' · close '+fmt(d.expectedClose):''}</div>${proposal?`<div class="kanban-meta">Proposal: ${esc(proposal.status)}</div>`:''}${d.stage==='Lost'&&d.lostReason?`<div class="card-snippet">${esc(d.lostReason)}</div>`:''}<div class="card-bottom"><select class="stage-select" data-deal-stage="${esc(d.id)}" aria-label="Move ${esc(d.title)} to">${DEAL_STAGES.map(s=>`<option ${s===d.stage?'selected':''}>${s}</option>`).join('')}</select></div></article>`;
  }

  function render(){
    const list=ctx.viewRecords('deals',data().deals||[]),stats=dealStats(data().deals||[]);
    const summary=`<div class="deal-summary">${[['Open deals',stats.open],['Open value',currency(stats.openValue)],['Weighted forecast',currency(stats.weighted)],['Won this month',currency(stats.wonThisMonth)],['Win rate',stats.winRate===null?'–':stats.winRate+'%']].map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div>`;
    const board=`<div class="kanban opportunity-board" aria-label="Opportunities board">${DEAL_STAGES.map(stage=>{const cards=list.filter(d=>d.stage===stage),value=cards.reduce((n,d)=>n+Number(d.value||0),0);return `<section class="kanban-column" aria-label="${esc(stage)} column"><header class="column-heading"><span class="column-dot"></span><span class="opportunity-stage-name">${esc(stage)}<small>${esc(currency(value))}</small></span><span class="column-count">${cards.length}</span></header><div class="kanban-items">${cards.map(card).join('')}${!cards.length?'<div class="column-empty">No opportunities at this stage.</div>':''}</div></section>`;}).join('')}</div>`;
    const rows=`<div class="table-wrap opportunity-list"><table class="table"><thead><tr><th>Opportunity</th><th>Contact</th><th>Stage</th><th>Value</th><th>Expected close</th><th>Proposal</th></tr></thead><tbody>${list.map(d=>{const proposal=d.proposalId?data().proposals.find(p=>p.id===d.proposalId):null;return `<tr><td><button class="link" data-edit="deals:${esc(d.id)}">${esc(d.title)}</button></td><td>${esc(who(d))}</td><td>${esc(d.stage)}</td><td>${esc(currency(d.value))}</td><td>${d.expectedClose?esc(fmt(d.expectedClose)):'—'}</td><td>${proposal?esc(proposal.status):'—'}</td></tr>`;}).join('')||'<tr><td colspan="6">No opportunities match this view.</td></tr>'}</tbody></table></div>`;
    const switcher=`<div class="opportunity-view-switch" role="group" aria-label="Opportunity display"><button type="button" data-deals-view="board" aria-pressed="${view==='board'}">Board</button><button type="button" data-deals-view="list" aria-pressed="${view==='list'}">List</button></div>`;
    return ctx.heading('SELL','Opportunities','Track each potential sale from qualification to a decision.',ctx.addButton('deals','New opportunity'))+ctx.toolbar(['All'])+summary+switcher+(view==='list'?rows:board);
  }

  function bind(){
    document.querySelectorAll('[data-deals-view]').forEach(el=>el.onclick=()=>{view=el.dataset.dealsView;ctx.refresh();});
    document.querySelectorAll('[data-deal-stage]').forEach(el=>el.onchange=()=>ctx.perform(async()=>{
      const deal=data().deals.find(d=>d.id===el.dataset.dealStage);
      if(el.value==='Lost'&&!deal.lostReason){await ctx.refresh();ctx.edit('deals',{...deal,stage:'Lost'});return;}
      try{await api(`/records/deals/${deal.id}`,{method:'PUT',body:JSON.stringify({stage:el.value})});}finally{await ctx.refresh();}
    }));
  }

  return {render,bind};
}
