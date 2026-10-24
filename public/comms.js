// Calls and texts. Until a phone line is connected (Twilio, later), people log what happened by hand; a live connection
// will write the same records. Nothing here pretends to place a call or send a text.
export const PHONE_NEEDS=[
  ['A Twilio account','Sign-up gives you an Account SID and an Auth Token. The token is a secret and belongs in the Keychain, never in a note.','https://www.twilio.com/docs/usage/api'],
  ['A phone number that can do voice and texts','Australian numbers need a regulatory bundle (proof of your business) before Twilio will activate them.','https://www.twilio.com/en-us/guidelines/au/regulatory'],
  ['A webhook address Twilio can reach','Incoming calls and texts arrive by Twilio calling your server. That needs a public address, which this private setup deliberately does not have yet.','https://www.twilio.com/docs/usage/webhooks'],
  ['Call recording notice','If calls are recorded, the other person must be told. VareonHQ will not attach a recording unless you confirm they were.','https://www.twilio.com/docs/voice/api/recording'],
  ['Texting consent and opt-out','People must agree to receive texts and be able to say STOP. VareonHQ already records both on each contact.','https://www.twilio.com/docs/messaging']
];
export const fmtDuration=s=>{s=Math.max(0,Number(s)||0);if(!s)return '';const m=Math.floor(s/60),r=s%60;return m?`${m} min${r?` ${r} s`:''}`:`${r} s`;};
export const brisbaneNow=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{});return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
// The form's date-time box has no zone; this workspace works in Brisbane time (UTC+10 all year).
export const toBrisbaneISO=local=>`${local}:00+10:00`;
export const fromISO=iso=>{if(!iso)return brisbaneNow();const d=new Date(iso);const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};

export function createCommsUI(ctx){
  const {esc,icon,api,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const clientName=id=>data().clients.find(c=>c.id===id)?.name||data().prospects.find(p=>p.id===id)?.name||'';
  const contactsOf=(clientId,prospectId)=>(data().clientContacts||[]).filter(c=>clientId?c.clientId===clientId:prospectId&&c.prospectId===prospectId);
  const when=iso=>fmt(iso,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const recordingPlayer=call=>call.recordingId?`<audio class="call-audio" controls preload="none" src="/api/recordings/${esc(call.recordingId)}/file"></audio>`:'';

  // ---------- dialogs ----------
  const clientPicker=(record,id)=>`<div class="field"><label for="${id}">Client</label><select id="${id}"><option value="">Choose a client</option>${data().clients.map(c=>`<option value="${esc(c.id)}" ${record.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`;
  const contactOptions=(clientId,selected)=>`<option value="">Not a saved contact</option>${contactsOf(clientId,'').map(c=>`<option value="${esc(c.id)}" ${selected===c.id?'selected':''}>${esc(c.name)}${c.phone?' · '+esc(c.phone):''}</option>`).join('')}`;

  function logCall(record={}){
    const fixed=!!record.clientId&&!record.id;
    ctx.modal(record.id?'Call':'Log a call',`<form id="call-form"><div class="form-grid">${clientPicker(record,'cl-client')}<div class="field"><label for="cl-contact">Who</label><select id="cl-contact">${contactOptions(record.clientId,record.contactId)}</select></div><div class="field"><label for="cl-dir">Direction</label><select id="cl-dir">${['Outgoing','Incoming'].map(v=>`<option ${v===(record.direction||'Outgoing')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="cl-outcome">What happened</label><select id="cl-outcome">${['Completed','Missed','Voicemail','No answer','Busy'].map(v=>`<option ${v===(record.outcome||'Completed')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="cl-when">When (Brisbane time)</label><input id="cl-when" type="datetime-local" value="${esc(fromISO(record.startedAt))}"></div><div class="field"><label for="cl-min">Length (minutes)</label><input id="cl-min" type="number" min="0" max="1440" step="1" value="${record.durationSeconds?Math.round(record.durationSeconds/60):''}"></div><div class="field"><label for="cl-number">Number</label><input id="cl-number" value="${esc(record.number||'')}" maxlength="40"></div><div class="field full"><label for="cl-notes">Notes</label><textarea id="cl-notes" placeholder="What was agreed, and what happens next">${esc(record.summary||'')}</textarea></div><div class="field full"><label for="cl-file">Recording (optional)</label>${record.recordingId?`<div>${recordingPlayer(record)}</div>`:''}<input id="cl-file" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.webm"><label class="tick" id="cl-notice-row"><input type="checkbox" id="cl-notice" ${record.recordingNotice?'checked':''}> The other person was told the call was being recorded</label><small>In most places everyone on a call must be told. A recording can only be attached once this is ticked.</small></div></div><div class="form-error hidden" id="cl-error"></div><div class="form-actions">${record.id?'<button type="button" class="btn danger" id="cl-delete">Delete</button>':''}<button class="btn primary" type="submit">${record.id?'Save call':'Save call'}</button></div></form>`,'drawer');
    const q=s=>document.querySelector(s),fail=e=>{q('#cl-error').textContent=e.message;q('#cl-error').classList.remove('hidden');};
    if(!fixed)q('#cl-client').onchange=e=>{q('#cl-contact').innerHTML=contactOptions(e.target.value,'');};
    q('#call-form').onsubmit=async e=>{
      e.preventDefault();const btn=e.submitter||e.target.querySelector('[type=submit]');btn.disabled=true;let uploaded='';
      try{
        let recordingId=record.recordingId||'';const file=q('#cl-file').files[0];
        if(file&&!q('#cl-notice').checked)throw new Error('Confirm the other person was told the call was being recorded before attaching a recording.');
        if(file){const r=await fetch('/api/recordings',{method:'POST',headers:{'X-Vareon-Local':'1','X-Vareon-Filename':encodeURIComponent(file.name)},body:file});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not upload the recording');recordingId=j.id;uploaded=j.id;}
        const body={clientId:q('#cl-client').value||record.clientId||'',contactId:q('#cl-contact').value,direction:q('#cl-dir').value,outcome:q('#cl-outcome').value,startedAt:toBrisbaneISO(q('#cl-when').value),durationSeconds:Math.round(Number(q('#cl-min').value||0)*60),number:q('#cl-number').value,summary:q('#cl-notes').value,recordingId,recordingNotice:q('#cl-notice').checked};
        await(record.id?api(`/records/calls/${record.id}`,{method:'PUT',body:JSON.stringify(body)}):api('/records/calls',{method:'POST',body:JSON.stringify(body)}));
        ctx.closeModal();await ctx.refresh();ctx.toast('Call saved');
      }catch(err){if(uploaded)fetch(`/api/recordings/${uploaded}`,{method:'DELETE',headers:{'X-Vareon-Local':'1'}}).catch(()=>{});fail(err);btn.disabled=false;}
    };
    q('#cl-delete')?.addEventListener('click',async()=>{if(!confirm('Delete this call and its recording?'))return;try{await api(`/records/calls/${record.id}`,{method:'DELETE'});ctx.closeModal();await ctx.refresh();}catch(err){fail(err);}});
  }

  function logText(record={}){
    const consentNote=id=>{const c=(data().clientContacts||[]).find(x=>x.id===id);return !c?'':c.smsConsent==='Opted out'?`<div class="notice">${esc(c.name)} opted out of text messages. Do not text them.</div>`:c.smsConsent==='Opted in'?'':`<div class="row-sub">No consent to text ${esc(c.name)} is recorded yet.</div>`;};
    ctx.modal(record.id?'Text message':'Log a text',`<form id="text-form"><div class="notice">VareonHQ cannot send texts until a phone line is connected. Log a text you sent or received on your own phone, or keep a draft.</div><div class="form-grid">${clientPicker(record,'tx-client')}<div class="field"><label for="tx-contact">Who</label><select id="tx-contact">${contactOptions(record.clientId,record.contactId)}</select></div><div class="field"><label for="tx-dir">Direction</label><select id="tx-dir">${['Outgoing','Incoming'].map(v=>`<option ${v===(record.direction||'Outgoing')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="tx-status">Status</label><select id="tx-status"></select></div><div class="field full" id="tx-consent">${consentNote(record.contactId)}</div><div class="field full"><label for="tx-body">Message</label><textarea id="tx-body" maxlength="1600">${esc(record.body||'')}</textarea></div><div class="field"><label for="tx-when">When (Brisbane time)</label><input id="tx-when" type="datetime-local" value="${esc(fromISO(record.at))}"></div><div class="field"><label for="tx-number">Number</label><input id="tx-number" value="${esc(record.number||'')}" maxlength="40"></div></div><div class="form-error hidden" id="tx-error"></div><div class="form-actions">${record.id?'<button type="button" class="btn danger" id="tx-delete">Delete</button>':''}<button class="btn primary" type="submit">Save text</button></div></form>`,'drawer');
    const q=s=>document.querySelector(s),fail=e=>{q('#tx-error').textContent=e.message;q('#tx-error').classList.remove('hidden');};
    const statuses=()=>q('#tx-dir').value==='Incoming'?['Received']:['Logged','Draft'];
    const paintStatus=()=>{const cur=record.status&&statuses().includes(record.status)?record.status:statuses()[0];q('#tx-status').innerHTML=statuses().map(s=>`<option value="${s}" ${s===cur?'selected':''}>${s==='Logged'?'Logged (already sent from my phone)':s}</option>`).join('');};
    paintStatus();q('#tx-dir').onchange=paintStatus;
    if(!(record.clientId&&!record.id))q('#tx-client').onchange=e=>{q('#tx-contact').innerHTML=contactOptions(e.target.value,'');};
    q('#tx-contact').onchange=e=>{q('#tx-consent').innerHTML=consentNote(e.target.value);};
    q('#text-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter||e.target.querySelector('[type=submit]');btn.disabled=true;try{
      const body={clientId:q('#tx-client').value||record.clientId||'',contactId:q('#tx-contact').value,direction:q('#tx-dir').value,status:q('#tx-status').value,body:q('#tx-body').value,at:toBrisbaneISO(q('#tx-when').value),number:q('#tx-number').value};
      await(record.id?api(`/records/smsMessages/${record.id}`,{method:'PUT',body:JSON.stringify(body)}):api('/records/smsMessages',{method:'POST',body:JSON.stringify(body)}));
      ctx.closeModal();await ctx.refresh();ctx.toast('Text saved');}catch(err){fail(err);btn.disabled=false;}};
    q('#tx-delete')?.addEventListener('click',async()=>{if(!confirm('Delete this text?'))return;try{await api(`/records/smsMessages/${record.id}`,{method:'DELETE'});ctx.closeModal();await ctx.refresh();}catch(err){fail(err);}});
  }

  // ---------- pages ----------
  function phoneLinesPanel(){
    const lines=data().phoneLines||[];
    const body=lines.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Line</th><th>Used for</th><th>Status</th><th></th></tr></thead><tbody>${lines.map(l=>`<tr><td><button class="link title-cell" data-edit="phoneLines:${esc(l.id)}">${esc(l.name)}</button><small>${esc(l.number)} · ${esc(l.provider)}</small></td><td>${esc(l.purpose)}</td><td><span class="badge ${l.status==='Connected'?'blue':l.status==='Needs attention'?'red':'gray'}">${esc(l.status)}</span></td><td class="row-actions"><button class="btn small" data-phone-needs>How to connect</button></td></tr>`).join('')}</tbody></table></div>`:ctx.empty('phone','No phone line yet','Add the number you will use for calls and texts. Connecting it to Twilio comes later; until then you can log calls and texts by hand.',ctx.addButton('phoneLines','Add a phone line'));
    return ctx.panel('Phone lines',`${lines.length} line${lines.length===1?'':'s'}`,lines.length?`<div>${body}</div>`:body,lines.length?ctx.addButton('phoneLines','Add a phone line'):'');
  }
  function needsModal(){
    ctx.modal('Connect a phone line',`<div class="notice">Phone lines are not connected, and VareonHQ does not pretend otherwise. Connecting needs each of the items below.</div><ol class="needs">${PHONE_NEEDS.map(([t,why,url])=>`<li><strong>${esc(t)}</strong><span>${esc(why)}</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official guide</a></li>`).join('')}</ol>`,'wide');
  }

  const personCell=r=>{const name=clientName(r.clientId||r.prospectId),contact=(data().clientContacts||[]).find(c=>c.id===r.contactId);return `${r.clientId?`<button class="link" data-client-open="${esc(r.clientId)}">${esc(name)}</button>`:esc(name)}${contact?`<small>${esc(contact.name)}</small>`:''}`;};

  function callsPage(){
    const filter=ctx.getFilter?.()||'All',all=(data().calls||[]).slice().sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));
    const list=all.filter(c=>filter==='All'||(filter==='Missed'?['Missed','No answer','Voicemail'].includes(c.outcome):c.direction===filter));
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Call</th><th>Length</th><th>Notes and recording</th></tr></thead><tbody>${list.map(c=>`<tr><td><button class="link title-cell" data-edit="calls:${esc(c.id)}">${esc(when(c.startedAt))}</button></td><td>${personCell(c)}</td><td>${esc(c.direction)}<small>${esc(c.outcome)}</small></td><td>${esc(fmtDuration(c.durationSeconds))}</td><td>${esc((c.summary||'').slice(0,140))}${c.recordingId?`<div>${recordingPlayer(c)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('phone',all.length?'No calls match':'No calls logged yet',all.length?'Try another filter.':'Log a call after you make or take one, with notes and an optional recording. They also appear on the client’s page.',all.length?'':ctx.addButton('calls','Log a call'));
    return ctx.heading('CLIENTS','Calls','Calls with clients and leads, with notes and recordings. Placing calls from here needs a connected phone line.',ctx.addButton('calls','Log a call'))+ctx.toolbar(['All','Incoming','Outgoing','Missed'])+ctx.panel('Call log',`${list.length} calls`,list.length?`<div>${body}</div>`:body)+phoneLinesPanel();
  }
  function textsPage(){
    const all=(data().smsMessages||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    const optedOut=(data().clientContacts||[]).filter(c=>c.smsConsent==='Opted out');
    const body=all.length?`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Message</th><th>Status</th></tr></thead><tbody>${all.map(m=>`<tr><td><button class="link title-cell" data-edit="smsMessages:${esc(m.id)}">${esc(when(m.at))}</button></td><td>${personCell(m)}</td><td><span class="sms-dir">${m.direction==='Incoming'?'In':'Out'}</span> ${esc(m.body.slice(0,160))}</td><td><span class="badge ${m.status==='Received'?'blue':m.status==='Draft'?'amber':'gray'}">${esc(m.status)}</span></td></tr>`).join('')}</tbody></table></div>`:ctx.empty('chat','No texts yet','Log a text you sent or received on your phone, or keep a draft. Sending from here needs a connected phone line. Replies of STOP opt the person out automatically.',ctx.addButton('smsMessages','Log a text'));
    return ctx.heading('CLIENTS','Texts','Text messages with clients and leads. Sending from here needs a connected phone line; until then, log them.',ctx.addButton('smsMessages','Log a text'))+ctx.panel('Messages',`${all.length} messages${optedOut.length?` · ${optedOut.length} contact${optedOut.length===1?'':'s'} opted out`:''}`,all.length?`<div>${body}</div>`:body);
  }

  function bind(){
    document.querySelectorAll('[data-phone-needs]').forEach(b=>b.onclick=needsModal);
    document.querySelectorAll('[data-client-open]').forEach(b=>b.onclick=()=>ctx.openClient(b.dataset.clientOpen));
  }

  return {logCall,logText,callsPage,textsPage,bind,recordingPlayer};
}
