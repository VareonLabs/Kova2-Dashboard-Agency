// Ads and Social pages. Accounts record what each platform needs before it can be connected; figures come from CSV exports for now.
import { AD_PLATFORMS, SOCIAL_PLATFORMS } from './ads-social.js';

export function createAdsSocialUI(ctx){
  const {esc,api,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const state={stamp:0,ads:{account:'',days:28,report:null,key:''},social:{account:'',days:90,report:null,key:''}};
  const clientName=id=>data().clients.find(c=>c.id===id)?.name||'';
  const money=(v,cur='AUD')=>v===null||v===undefined?'–':new Intl.NumberFormat('en-AU',{style:'currency',currency:cur,maximumFractionDigits:2}).format(v);
  const n0=v=>v===null||v===undefined?'–':new Intl.NumberFormat('en-AU').format(v);
  const pct=v=>v===null||v===undefined?'–':v+'%';
  const kinds={ads:{collection:'adAccounts',platforms:AD_PLATFORMS,route:'ads',noun:'ad account'},social:{collection:'socialAccounts',platforms:SOCIAL_PLATFORMS,route:'social',noun:'social account'}};

  const accounts=kind=>data()[kinds[kind].collection]||[];
  const current=kind=>{const list=accounts(kind),s=state[kind];return list.find(a=>a.id===s.account)||list[0];};

  async function loadReport(kind){
    const a=current(kind),s=state[kind];
    if(!a){s.report=null;return;}
    const key=`${a.id}:${s.days}:${state.stamp}`;
    if(s.key===key&&s.report)return;
    s.key=key;
    try{s.report=await api(`/${kinds[kind].route}/${a.id}/summary?days=${s.days}`);}catch{s.report=null;}
    ctx.render();
  }

  function needsModal(kind,account){
    const set=kinds[kind].platforms[account.platform];
    ctx.modal(`Connect ${account.platform}`,`<div class="notice">This account is not connected, and VareonHQ does not pretend otherwise. Connecting needs each of the items below. Until then, import the platform's own report export to see figures here.</div><ol class="needs">${set.needs.map(([title,why,url])=>`<li><strong>${esc(title)}</strong><span>${esc(why)}</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official guide</a></li>`).join('')}</ol>`,'wide');
  }

  function accountPanel(kind){
    const list=accounts(kind),cfg=kinds[kind];
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Account</th><th>Client</th><th>Status</th><th></th></tr></thead><tbody>${list.map(a=>`<tr><td><button class="link title-cell" data-edit="${cfg.collection}:${esc(a.id)}">${esc(a.name)}</button><small>${esc([a.platform,a.accountId||a.handle].filter(Boolean).join(' · '))}</small></td><td>${esc(clientName(a.clientId))}</td><td><span class="badge ${a.status==='Connected'?'blue':a.status==='Needs attention'?'red':'gray'}">${esc(a.status)}</span></td><td class="row-actions"><button class="btn small" data-needs="${kind}:${esc(a.id)}">How to connect</button><button class="btn small" data-import="${kind}:${esc(a.id)}">Import CSV</button></td></tr>`).join('')}</tbody></table></div>`:ctx.empty(kind==='ads'?'chart':'users',kind==='ads'?'No ad accounts yet':'No social accounts yet',kind==='ads'?'Add the Google Ads or Meta Ads account for each client. You can then import its report export to see spend, clicks and return.':'Add each client’s social accounts. You can then import follower and engagement exports to see growth.',ctx.addButton(cfg.collection,'Add an account'));
    return ctx.panel(kind==='ads'?'Ad accounts':'Social accounts',`${list.length} account${list.length===1?'':'s'}`,list.length?`<div>${body}</div>`:body,list.length?ctx.addButton(cfg.collection,'Add an account'):'');
  }

  function adsPerformance(){
    const a=current('ads');if(!a)return '';
    const r=state.ads.report,cur=a.currency;
    const pills=accounts('ads').length>1?`<div class="page-tabs" role="group" aria-label="Ad account">${accounts('ads').map(x=>`<button type="button" data-pick="ads:${esc(x.id)}" class="${x.id===a.id?'active':''}">${esc(x.name)}</button>`).join('')}</div>`:'';
    const range=`<div class="page-tabs" role="group" aria-label="Date range">${[7,28,90].map(d=>`<button type="button" data-days="ads:${d}" class="${d===state.ads.days?'active':''}">Last ${d} days</button>`).join('')}</div>`;
    if(!r)return pills+range+ctx.panel('Performance','Loading…','<p class="sub panel-pad">Reading the saved figures.</p>');
    if(!r.rows)return pills+range+ctx.panel('Performance',esc(a.name),ctx.empty('chart','No figures in this range','Import the account’s report export (Google Ads: Reports → Download as CSV. Meta: Ads Manager → Reports → Export). Repeat imports update rows instead of doubling them.',`<button class="btn primary" data-import="ads:${esc(a.id)}">Import CSV</button>`));
    const t=r.totals,tile=(k,v)=>`<div><small>${k}</small><strong>${v}</strong></div>`;
    return pills+range+ctx.panel('Performance',`${esc(a.name)} · ${r.rows} rows · latest ${fmt(r.latest)}`,`<div class="start-note"><div class="deal-summary">${tile('Spend',money(t.spend,cur))}${tile('Clicks',n0(t.clicks))}${tile('Click rate',pct(t.ctr))}${tile('Cost per click',money(t.cpc,cur))}${tile('Conversions',n0(t.conversions))}${tile('Cost per conversion',money(t.cpa,cur))}${tile('Return on spend',t.roas===null?'–':t.roas+'×')}</div><div class="table-wrap"><table class="table"><thead><tr><th>Campaign</th><th>Spend</th><th>Clicks</th><th>Click rate</th><th>Conversions</th><th>Cost per conversion</th></tr></thead><tbody>${r.byCampaign.map(c=>`<tr><td>${esc(c.campaign)}</td><td>${money(c.spend,cur)}</td><td>${n0(c.clicks)}</td><td>${pct(c.ctr)}</td><td>${n0(c.conversions)}</td><td>${money(c.cpa,cur)}</td></tr>`).join('')}</tbody></table></div></div>`);
  }

  function spark(series){
    if(series.length<2)return '';
    const w=320,h=56,xs=series.map((_,i)=>i/(series.length-1)*w),ys=series.map(p=>p.followers),min=Math.min(...ys),max=Math.max(...ys),span=max-min||1;
    const pts=series.map((p,i)=>`${xs[i].toFixed(1)},${(h-4-(p.followers-min)/span*(h-8)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Followers over time"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }
  function socialPerformance(){
    const a=current('social');if(!a)return '';
    const r=state.social.report;
    const pills=accounts('social').length>1?`<div class="page-tabs" role="group" aria-label="Social account">${accounts('social').map(x=>`<button type="button" data-pick="social:${esc(x.id)}" class="${x.id===a.id?'active':''}">${esc(x.name)}</button>`).join('')}</div>`:'';
    const range=`<div class="page-tabs" role="group" aria-label="Date range">${[30,90,365].map(d=>`<button type="button" data-days="social:${d}" class="${d===state.social.days?'active':''}">${d===365?'Last year':`Last ${d} days`}</button>`).join('')}</div>`;
    if(!r)return pills+range+ctx.panel('Performance','Loading…','<p class="sub panel-pad">Reading the saved figures.</p>');
    if(!r.snapshots)return pills+range+ctx.panel('Performance',esc(a.name),ctx.empty('users','No figures in this range','Import the platform’s analytics export with a Date column and any of Followers, Posts, Reactions, Comments, Shares and Reach. Live followers and a comment inbox arrive when the account is connected.',`<button class="btn primary" data-import="social:${esc(a.id)}">Import CSV</button>`));
    const tile=(k,v)=>`<div><small>${k}</small><strong>${v}</strong></div>`;
    return pills+range+ctx.panel('Performance',`${esc(a.name)} · as of ${fmt(r.asOf)}`,`<div class="start-note"><div class="deal-summary">${tile('Followers',n0(r.followers))}${tile('Change',r.growth===null?'–':(r.growth>=0?'+':'')+n0(r.growth)+(r.growthPct!==null?` (${r.growthPct}%)`:''))}${tile('Comments',n0(r.comments))}${tile('Posts',n0(r.posts))}${tile('Engagements',n0(r.engagement))}${tile('Engagement rate',pct(r.engagementRate))}</div><div class="spark-wrap">${spark(r.series)}</div></div>`);
  }

  const render=kind=>kind==='ads'
    ?ctx.heading('MARKETING','Ads','Google Ads and Meta Ads for your clients. Figures come from report exports until the accounts can be connected.',ctx.addButton('adAccounts','Add ad account'))+accountPanel('ads')+adsPerformance()
    :ctx.heading('MARKETING','Social','Followers, comments and engagement across your clients’ accounts. Figures come from analytics exports until the accounts can be connected.',ctx.addButton('socialAccounts','Add social account'))+accountPanel('social')+socialPerformance();

  function pickFile(kind,accountId){
    const input=document.createElement('input');input.type='file';input.accept='.csv,.tsv,text/csv,text/plain';
    input.onchange=()=>ctx.perform(async()=>{
      const file=input.files[0];if(!file)return;if(file.size>4*1024*1024)throw new Error('That file is too large. Export a shorter date range.');
      const result=await api(`/${kinds[kind].route}/${accountId}/import`,{method:'POST',body:JSON.stringify({csv:await file.text()})});
      state[kind].account=accountId;state[kind].key='';state.stamp++;
      await ctx.refresh();
      ctx.toast(`Imported ${result.imported} row${result.imported===1?'':'s'}${result.skipped?`, skipped ${result.skipped}`:''}.${result.problems?.[0]?' '+result.problems[0]:''}`);
    });
    input.click();
  }

  function bind(kind){
    loadReport(kind);
    document.querySelectorAll(`[data-needs^="${kind}:"]`).forEach(b=>b.onclick=()=>needsModal(kind,accounts(kind).find(a=>a.id===b.dataset.needs.split(':')[1])));
    document.querySelectorAll(`[data-import^="${kind}:"]`).forEach(b=>b.onclick=()=>pickFile(kind,b.dataset.import.split(':')[1]));
    document.querySelectorAll(`[data-pick^="${kind}:"]`).forEach(b=>b.onclick=()=>{state[kind].account=b.dataset.pick.split(':')[1];state[kind].report=null;state[kind].key='';ctx.render();});
    document.querySelectorAll(`[data-days^="${kind}:"]`).forEach(b=>b.onclick=()=>{state[kind].days=Number(b.dataset.days.split(':')[1]);state[kind].report=null;state[kind].key='';ctx.render();});
  }

  return {ads:()=>render('ads'),social:()=>render('social'),bindAds:()=>bind('ads'),bindSocial:()=>bind('social')};
}
