// The client page as one place: every conversation in date order, and a button for every job you do for a client.
import { fmtDuration } from './comms.js';
import { handoverProgress } from './service-desk.js';

export function createClientHub(ctx){
  const {esc,icon,fmt,currency,badge}=ctx;
  const data=()=>ctx.getData();
  let filter='All';
  const FILTERS=['All','Emails','Calls','Texts','Meetings','Forms'];

  const ACTIONS=[['emails','Email','mail'],['calls','Log a call','phone'],['smsMessages','Log a text','chat'],['meetings','Meeting','calendar'],['proposals','Proposal','file'],['invoices','Invoice','file'],['tasks','Ticket','check'],['supportRequests','Support request','shield'],['deals','Deal','chart'],['notes','Note','file']];
  const actions=()=>`<div class="hub-actions" role="group" aria-label="Do something for this client">${ACTIONS.map(([c,label,symbol])=>`<button type="button" class="btn small" data-client-add="${c}">${icon(symbol)}${esc(label)}</button>`).join('')}</div>`;

  const day=v=>String(v||'');
  function events(w){
    const out=[];
    for(const m of w.emails||[])out.push({kind:'Emails',label:'Email',date:m.receivedAt||m.sentAt||m.createdAt,html:`<button class="link" data-open-email="${esc(m.id)}">${esc(m.subject||'(no subject)')}</button><div class="row-sub">${esc(m.fromName||m.from||m.to||'')} ${badge(m.status)}</div>`});
    for(const c of w.calls||[])out.push({kind:'Calls',label:`${c.direction} call`,date:c.startedAt,html:`<button class="link" data-edit="calls:${esc(c.id)}">${esc(c.outcome)}${c.durationSeconds?' · '+esc(fmtDuration(c.durationSeconds)):''}</button>${c.summary?`<div class="row-sub">${esc(c.summary.slice(0,220))}</div>`:''}${c.recordingId?`<audio class="call-audio" controls preload="none" src="/api/recordings/${esc(c.recordingId)}/file"></audio>`:''}`});
    for(const m of w.smsMessages||[])out.push({kind:'Texts',label:m.direction==='Incoming'?'Text received':'Text',date:m.at,html:`<button class="link sms-bubble ${m.direction==='Incoming'?'in':'out'}" data-edit="smsMessages:${esc(m.id)}">${esc(m.body.slice(0,300))}</button><div class="row-sub">${esc(m.status)}</div>`});
    for(const m of w.meetings||[])out.push({kind:'Meetings',label:'Meeting',date:m.startAt,html:`<button class="link" data-edit="meetings:${esc(m.id)}">${esc(m.title)}</button>${m.notes?`<div class="row-sub">${esc(m.notes.slice(0,180))}</div>`:''}`});
    for(const n of w.meetingNotes||[])out.push({kind:'Meetings',label:'Meeting notes',date:n.date||n.createdAt,html:`<button class="link" data-edit="meetingNotes:${esc(n.id)}">${esc(n.title)}</button><div class="row-sub">${esc((n.notes||n.transcript||'').slice(0,180))}</div>`});
    const forms=(data().forms||[]).filter(f=>f.clientId===w.client.id).map(f=>f.id);
    for(const r of (data().formSubmissions||[]).filter(r=>forms.includes(r.formId)))out.push({kind:'Forms',label:'Form response',date:r.createdAt,html:`<button class="link" data-page="forms">${esc(r.title)}</button><div class="row-sub">${esc(Object.entries(r.answers).filter(([,v])=>v!==''&&v!==false).slice(0,3).map(([k,v])=>`${r.fieldLabels?.[k]||k}: ${v===true?'Yes':v}`).join(' · '))}</div>`});
    return out.filter(e=>e.date).sort((a,b)=>Date.parse(day(b.date))-Date.parse(day(a.date)));
  }

  function communication(w){
    const all=events(w),count=f=>f==='All'?all.length:all.filter(e=>e.kind===f).length,list=all.filter(e=>filter==='All'||e.kind===filter);
    const chips=`<div class="page-tabs page-subtabs" role="group" aria-label="Show">${FILTERS.map(f=>`<button type="button" data-comm-filter="${f}" class="${f===filter?'active':''}" aria-pressed="${f===filter}">${f} <span class="l-count">${count(f)}</span></button>`).join('')}</div>`;
    const items=list.length?list.map(e=>`<div class="comm-item"><div class="comm-meta"><strong>${esc(e.label)}</strong><small>${fmt(e.date,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><div class="comm-body">${e.html}</div></div>`).join(''):`<div class="l-empty"><div class="l-empty-mark">${icon('chat')}</div><h2>Nothing here yet</h2><p>Emails, calls, texts, meetings and form responses with this client appear here together, newest first. Use the buttons above to add one.</p></div>`;
    return chips+`<section class="panel"><div class="comm-list">${items}</div></section>`;
  }

  function sales(w,c,{add,rows,section}){
    const deals=w.deals||[],proposals=w.proposals||[];
    return section('Deals',deals.length,deals.map(d=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="deals:${esc(d.id)}">${esc(d.title)}</button><div class="row-sub">${currency(d.value)}${d.expectedClose?' · close '+fmt(d.expectedClose):''}</div></div><div class="ops-row-end"><span class="badge ${d.stage==='Won'?'blue':d.stage==='Lost'?'red':'gray'}">${esc(d.stage)}</span></div></div>`).join('')||'<p class="sub panel-pad">No deals yet.</p>',add('deals','New deal'))
      +section('Proposals',proposals.length,proposals.map(p=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="proposals:${esc(p.id)}">${esc(p.title)}</button><div class="row-sub">${currency((p.lineItems||[]).reduce((n,l)=>n+l.quantity*l.unitPrice,0))}${p.validUntil?' · valid until '+fmt(p.validUntil):''}</div></div><div class="ops-row-end">${badge(p.status)}</div></div>`).join('')||'<p class="sub panel-pad">No proposals yet.</p>',add('proposals','New proposal'))
      +section('Agreements',w.contracts.length,rows('contracts',r=>`${currency(r.value)} · ${fmt(r.dueDate)}`,r=>badge(r.status))||'<p class="sub panel-pad">No agreements yet.</p>',add('contracts','New contract'))
      +section('Retainers',(w.retainers||[]).length,(w.retainers||[]).map(r=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="retainers:${esc(r.id)}">${esc(r.name)}</button><div class="row-sub">${currency(r.monthlyAmount)} a month${r.includedHours?` · ${r.includedHours} hours included`:''}</div></div><div class="ops-row-end">${badge(r.status)}</div></div>`).join('')||'<p class="sub panel-pad">No retainer.</p>',add('retainers','New retainer'));
  }

  function support(w,c,{add,section}){
    const requests=w.supportRequests||[],assets=w.clientAssets||[],progress=handoverProgress(assets);
    return section('Support requests',requests.length,requests.map(r=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="supportRequests:${esc(r.id)}">${esc(r.title)}</button><div class="row-sub">${esc(r.priority)} · due ${fmt(r.dueBy)}</div></div><div class="ops-row-end">${badge(r.status==='Resolved'?'Active':r.status)}</div></div>`).join('')||'<p class="sub panel-pad">No support requests.</p>',add('supportRequests','New request'))
      +section('Assets and handover',assets.length,(assets.length?`<p class="sub panel-pad">${progress.complete?'Everything has been handed over.':`${progress.done} of ${progress.total} handed over.`}</p>`:'')+assets.map(a=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="clientAssets:${esc(a.id)}">${esc(a.name)}</button><div class="row-sub">${esc(a.kind)} · owned by ${esc(a.owner)}</div></div><div class="ops-row-end"><span class="badge ${a.status==='Handed over'?'blue':'gray'}">${esc(a.status)}</span></div></div>`).join('')||'<p class="sub panel-pad">No assets recorded.</p>',add('clientAssets','New asset'));
  }

  function people(w,c,{add,section}){
    const list=w.clientContacts||[];
    const pill=(label,v)=>`<span class="badge ${v==='Opted in'?'blue':v==='Opted out'?'red':'gray'}">${label}: ${v==='Opted in'?'agreed':v==='Opted out'?'opted out':'not asked'}</span>`;
    return section('Contacts',list.length,list.map(p=>`<div class="ops-row"><div class="ops-row-copy"><button class="link ops-record-title" data-edit="clientContacts:${esc(p.id)}">${esc(p.name)}</button><div class="row-sub">${esc([p.role,p.email,p.phone].filter(Boolean).join(' · '))}${p.primary?' · main contact':''}</div></div><div class="ops-row-end">${pill('Email',p.marketingConsent)} ${pill('Texts',p.smsConsent)}</div></div>`).join('')||'<p class="sub panel-pad">No contacts yet. Add the people you deal with.</p>',add('clientContacts','New contact'));
  }

  function bind(){
    document.querySelectorAll('[data-comm-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.commFilter;ctx.render();});
  }
  return {actions,communication,sales,support,people,bind};
}
