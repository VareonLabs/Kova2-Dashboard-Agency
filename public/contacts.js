// The people at each client or prospect, with a plain record of whether they agreed to marketing email.
export function createContactsUI(ctx){
  const {esc,badge}=ctx;
  const data=()=>ctx.getData();
  const company=c=>data().clients.find(x=>x.id===c.clientId)?.name||data().prospects.find(x=>x.id===c.prospectId)?.name||'No company';
  const consent=c=>c.marketingConsent==='Opted in'?`<span class="badge blue">Opted in</span>`:c.marketingConsent==='Opted out'?`<span class="badge red">Opted out</span>`:`<span class="badge gray">Not asked</span>`;

  function render(){
    const list=ctx.viewRecords('clientContacts',data().clientContacts||[]).slice().sort((a,b)=>company(a).localeCompare(company(b))||a.name.localeCompare(b.name));
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Contact</th><th>Company</th><th>Email</th><th>Phone</th><th>Marketing email</th></tr></thead><tbody>${list.map(c=>`<tr><td><button class="link title-cell" data-edit="clientContacts:${esc(c.id)}">${esc(c.name)}</button>${c.role||c.primary?`<small>${esc([c.role,c.primary?'Primary':''].filter(Boolean).join(' · '))}</small>`:''}</td><td>${esc(company(c))}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${consent(c)}${c.consentDate?`<small>${ctx.fmt(c.consentDate)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('users','No contacts yet','Add the people you deal with at each client. Record whether they agreed to marketing email, and how, before any campaign goes to them.',ctx.addButton('clientContacts','Add a contact'));
    return ctx.heading('PEOPLE','Contacts','The people at your clients and prospects, and who has agreed to hear from you.',ctx.addButton('clientContacts','Add a contact'))+ctx.toolbar(['All'])+ctx.panel('Contacts',`${list.length} contacts`,list.length?`<div>${body}</div>`:body);
  }
  return {render};
}
