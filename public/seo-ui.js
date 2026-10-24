// SEO and AEO in one place: what to fix, how the site reads to search engines and AI assistants, and a log of AI answer checks.
import { answerStats } from './seo.js';

export function createSeoUI(ctx){
  const {esc,api,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  let selected=(()=>{try{return localStorage.getItem('vareon-website')||'';}catch{return '';}})(),running=false;
  const sites=()=>data().websites||[];
  const site=()=>sites().find(s=>s.id===selected)||sites()[0];
  const audits=id=>(data().analytics?.audits||[]).filter(a=>a.websiteId===id);
  const delta=(now,before)=>before===undefined||now===undefined?'':now===before?'no change':`${now>before?'up':'down'} ${Math.abs(now-before)} since the last audit`;

  function tile(label,value,before,note){
    return `<section class="panel analytics-score"><span>${esc(label)}</span><div class="analytics-score-value">${value===undefined?'–':value}<small>/100</small></div><div class="analytics-score-note">${esc(value===undefined?'Run an audit to see this.':delta(value,before)||note)}</div></section>`;
  }

  function fixList(audit){
    const all=[...audit.checks,...(audit.signals?.checks||[])].filter(c=>!c.passed).sort((a,b)=>b.weight-a.weight);
    const groups={seo:'SEO',aeo:'Answer readiness',ai:'AI and crawlers'};
    const note=audit.signals?'':'<div class="notice">This audit pre-dates the AI and crawler checks. Run a new audit to include them.</div>';
    if(!all.length)return note+ctx.empty('check','Nothing to fix','Every check passed on the last audit.');
    return note+`<div class="table-wrap"><table class="table"><thead><tr><th>What to fix</th><th>Area</th><th>What we saw</th></tr></thead><tbody>${all.map(c=>`<tr><td><strong>${esc(c.label)}</strong><small>${esc(c.advice)}</small></td><td>${esc(groups[c.group]||c.group)}</td><td>${esc(c.evidence)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function answerPanel(s){
    const stats=answerStats(data().answerChecks||[],s.id),rows=(data().answerChecks||[]).filter(c=>c.websiteId===s.id).sort((a,b)=>String(b.checkedOn).localeCompare(String(a.checkedOn)));
    const figure=(label,v)=>`<div><small>${label}</small><strong>${v===null?'–':v+'%'}</strong></div>`;
    const summary=`<div class="deal-summary"><div><small>Checks in the last ${stats.windowDays} days</small><strong>${stats.total}</strong></div>${figure('Mentioned',stats.mentionRate)}${figure('Linked to your site',stats.linkRate)}${stats.byEngine.map(e=>`<div><small>${esc(e.engine)}</small><strong>${e.mentionRate}% <span class="sub">of ${e.checks}</span></strong></div>`).join('')}</div>`;
    const table=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Question asked</th><th>Assistant</th><th>Result</th><th>Checked</th></tr></thead><tbody>${rows.map(c=>`<tr><td><button class="link title-cell" data-edit="answerChecks:${esc(c.id)}">${esc(c.prompt)}</button>${c.competitors?`<small>Others named: ${esc(c.competitors)}</small>`:''}</td><td>${esc(c.engine)}</td><td><span class="badge ${c.result==='Not mentioned'?'red':c.result==='Mentioned'?'amber':'blue'}">${esc(c.result)}</span></td><td>${fmt(c.checkedOn)}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('search','No answer checks yet','Ask an assistant the questions your customers would ask, then record whether it named and linked to this site. Repeat monthly to see the trend.',ctx.addButton('answerChecks','Log a check'));
    return ctx.panel('AI answer checks','Recorded by hand. VareonHQ does not query assistants for you, so these figures are only what you logged.',(rows.length?`<div class="start-note">${summary+table}</div>`:table),rows.length?ctx.addButton('answerChecks','Log a check'):'');
  }

  function render(){
    const s=site();
    if(!s)return ctx.heading('MARKETING','SEO & AEO','How your sites read to search engines and AI assistants.')+ctx.panel('Websites','',ctx.empty('search','Add a website first','SEO and AEO checks run against a website. Add one under Website analytics.','<button class="btn primary" data-page="analytics">Open Website analytics</button>'));
    const list=audits(s.id),audit=list[0],before=list[1];
    const pills=sites().length>1?`<div class="page-tabs" role="group" aria-label="Website">${sites().map(w=>`<button type="button" data-seo-site="${esc(w.id)}" class="${w.id===s.id?'active':''}">${esc(w.name)}</button>`).join('')}</div>`:'';
    const action=`<button class="btn primary" id="seo-run" ${running?'disabled':''}>${running?'Auditing…':audit?'Run audit again':'Run audit'}</button>`;
    const tiles=`<div class="analytics-audit-grid">${tile('SEO fundamentals',audit?.scores.seo,before?.scores.seo,'10 checks on the homepage HTML')}${tile('Answer readiness',audit?.scores.aeo,before?.scores.aeo,'5 signals that the page explains itself')}${tile('AI and crawlers',audit?.signals?.score,before?.signals?.score,'robots.txt, sitemap, structured data, Q&A')}</div>`;
    return ctx.heading('MARKETING','SEO & AEO',`${esc(s.name)}${audit?' · last audited '+fmt(audit.auditedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):' · not audited yet'}. For visits and search queries, open <button class="link" data-page="analytics">Website analytics</button>.`,action)+pills+tiles+(audit?ctx.panel('What to fix',`${esc(audit.url)} · public homepage and site files only`,([...audit.checks,...(audit.signals?.checks||[])].some(c=>!c.passed)?`<div>${fixList(audit)}</div>`:fixList(audit))):'')+answerPanel(s)+(audit?`<p class="sub seo-method">${esc(audit.methodology||'')} Site checks read robots.txt, sitemap.xml and llms.txt from the same address.</p>`:'');
  }

  function bind(){
    document.querySelectorAll('[data-seo-site]').forEach(b=>b.onclick=()=>{selected=b.dataset.seoSite;try{localStorage.setItem('vareon-website',selected);}catch{}ctx.render();});
    document.querySelector('#seo-run')?.addEventListener('click',()=>{const s=site();running=true;ctx.render();ctx.perform(async()=>{try{await api(`/analytics/${s.id}/audit`,{method:'POST',body:'{}'});}finally{running=false;await ctx.refresh();}});});
  }

  return {render,bind};
}
