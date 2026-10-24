// Forms: the list, the builder, filling a form in, and reading the responses. All of it lives inside the app.
import { FIELD_TYPES, LEAD_MAP, checkAnswers } from './forms.js';

export function createFormsUI(ctx){
  const {esc,icon,api,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const brand=()=>({accent:data().settings?.profile?.accentColor||'#C6F432',logo:data().settings?.profile?.logo||'',name:data().settings?.profile?.businessName||data().settings?.businessName||'Your business',footer:data().settings?.profile?.formFooter||''});
  const textOn=hex=>{const n=parseInt(hex.slice(1),16),l=((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000;return l>150?'#1a1a1a':'#ffffff';};
  const slug=label=>String(label).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,28)||'field';
  const responses=id=>(data().formSubmissions||[]).filter(r=>r.formId===id);

  function render(){
    const list=ctx.viewRecords('forms',data().forms||[]);
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Form</th><th>Stage</th><th>Responses</th><th>Last response</th><th></th></tr></thead><tbody>${list.map(f=>{const rs=responses(f.id),last=rs[0];return `<tr><td><button class="link title-cell" data-edit="forms:${esc(f.id)}">${esc(f.name)}</button><small>${f.fields.length} field${f.fields.length===1?'':'s'}${f.createLead?' · creates a lead':''}</small></td><td>${badge(f.status==='Live'?'Active':f.status)}</td><td>${rs.length?`<button class="link" data-form-responses="${esc(f.id)}">${rs.length}${rs.some(r=>!r.handled)?` <span class="badge amber">${rs.filter(r=>!r.handled).length} new</span>`:''}</button>`:'0'}</td><td>${last?fmt(last.createdAt):''}</td><td><button class="btn small" data-form-fill="${esc(f.id)}">Fill in</button></td></tr>`;}).join('')}</tbody></table></div>`:ctx.empty('file','No forms yet','Build a form for discovery calls, intake questions or feedback. Fill it in during the call and the answers become a lead or a record you can find later.',ctx.addButton('forms','Build a form'));
    return ctx.heading('COLLECT','Forms','Build forms and fill them in inside the app. Sharing a form by public link needs a public address, which this private setup does not have.',ctx.addButton('forms','New form'))+ctx.toolbar(['All','Draft','Live','Closed'])+ctx.panel('Your forms',`${list.length} forms`,list.length?`<div>${body}</div>`:body);
  }

  // ---------- builder ----------
  function fieldRow(f,i,n){
    return `<div class="fb-row" data-fb="${i}"><div class="fb-main"><input data-fb-label value="${esc(f.label)}" placeholder="Question or label" aria-label="Label" maxlength="120"><select data-fb-type aria-label="Type">${Object.entries(FIELD_TYPES).map(([k,v])=>`<option value="${k}" ${k===f.type?'selected':''}>${v}</option>`).join('')}</select><label class="tick"><input type="checkbox" data-fb-required ${f.required?'checked':''}> Required</label></div>${f.type==='select'?`<input data-fb-options value="${esc((f.options||[]).join(', '))}" placeholder="Options, separated by commas" aria-label="Options">`:''}<input data-fb-help value="${esc(f.help||'')}" placeholder="Hint shown under the field (optional)" aria-label="Hint" maxlength="200"><div class="fb-tools"><button type="button" class="text-btn" data-fb-up ${i===0?'disabled':''}>Up</button><button type="button" class="text-btn" data-fb-down ${i===n-1?'disabled':''}>Down</button><button type="button" class="text-btn" data-fb-remove>Remove</button></div></div>`;
  }

  function build(record={}){
    const draft={name:'',description:'',status:'Draft',clientId:'',fields:[],submitLabel:'Send',thanks:'Thank you. We have your response.',consentText:'',createLead:false,leadMap:{},...JSON.parse(JSON.stringify(record))};
    if(!draft.fields.length&&!record.id)draft.fields=[{id:'name',label:'Your name',type:'text',required:true,options:[],help:''},{id:'email',label:'Email',type:'email',required:true,options:[],help:''}];
    const hasResponses=record.id&&responses(record.id).length>0;
    const paint=()=>{
      const box=document.querySelector('#fb-root');
      const opts=(list,cur,blank)=>`<option value="">${blank}</option>`+list.map(([v,l])=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(l)}</option>`).join('');
      box.innerHTML=`<div class="form-grid"><div class="field full"><label for="fb-name">Form name *</label><input id="fb-name" value="${esc(draft.name)}" maxlength="300"></div><div class="field full"><label for="fb-desc">What it is for</label><textarea id="fb-desc">${esc(draft.description)}</textarea></div><div class="field"><label for="fb-status">Stage</label><select id="fb-status">${['Draft','Live','Closed'].map(s=>`<option ${s===draft.status?'selected':''}>${s}</option>`).join('')}</select><small>Only live forms take responses.</small></div><div class="field"><label for="fb-client">Client</label><select id="fb-client">${opts(data().clients.map(c=>[c.id,c.name]),draft.clientId,'No client')}</select></div></div>
      <h3>Fields</h3><div id="fb-fields">${draft.fields.map((f,i)=>fieldRow(f,i,draft.fields.length)).join('')}</div><button type="button" class="btn small" id="fb-add">${icon('plus')}Add a field</button>
      <h3>After it is sent</h3><div class="form-grid"><div class="field"><label for="fb-submit">Button text</label><input id="fb-submit" value="${esc(draft.submitLabel)}" maxlength="40"></div><div class="field"><label for="fb-consent">Consent line (adds a tick box)</label><input id="fb-consent" value="${esc(draft.consentText)}" maxlength="300" placeholder="e.g. Email me about your services"></div><div class="field full"><label for="fb-thanks">Thank-you message</label><input id="fb-thanks" value="${esc(draft.thanks)}" maxlength="500"></div><div class="field full"><label class="tick"><input type="checkbox" id="fb-lead" ${draft.createLead?'checked':''}> Create a lead from each response</label></div></div>
      ${draft.createLead?`<div class="form-grid">${LEAD_MAP.map(k=>`<div class="field"><label for="fb-map-${k}">Lead ${k}${k==='name'?' *':''}</label><select id="fb-map-${k}" data-fb-map="${k}">${opts(draft.fields.map(f=>[f.id,f.label||f.id]),draft.leadMap[k]||'',k==='name'?'Choose a field':'Not collected')}</select></div>`).join('')}</div>`:''}
      ${hasResponses?'<div class="notice">This form has responses. Old responses keep the labels they were sent with, so changing a label here does not rewrite them.</div>':''}
      <div class="form-error hidden" id="fb-error"></div><div class="form-actions">${record.id&&!hasResponses?'<button type="button" class="btn danger" id="fb-delete">Delete</button>':''}<button type="button" class="btn" id="fb-try">Try it</button><button type="button" class="btn primary" id="fb-save">Save form</button></div>`;
      wire();
    };
    const read=()=>{
      const q=s=>document.querySelector(s);
      draft.name=q('#fb-name').value;draft.description=q('#fb-desc').value;draft.status=q('#fb-status').value;draft.clientId=q('#fb-client').value;draft.submitLabel=q('#fb-submit').value;draft.consentText=q('#fb-consent').value;draft.thanks=q('#fb-thanks').value;draft.createLead=q('#fb-lead').checked;
      document.querySelectorAll('[data-fb]').forEach(row=>{const f=draft.fields[Number(row.dataset.fb)];f.label=row.querySelector('[data-fb-label]').value;f.type=row.querySelector('[data-fb-type]').value;f.required=row.querySelector('[data-fb-required]').checked;f.help=row.querySelector('[data-fb-help]').value;const o=row.querySelector('[data-fb-options]');f.options=f.type==='select'?(o?o.value:(f.options||[]).join(',')).split(',').map(x=>x.trim()).filter(Boolean):[];});
      document.querySelectorAll('[data-fb-map]').forEach(sel=>{if(sel.value)draft.leadMap[sel.dataset.fbMap]=sel.value;else delete draft.leadMap[sel.dataset.fbMap];});
    };
    const payload=()=>{read();const used=new Set(),fields=draft.fields.map(f=>{let id=f.id&&!/^field_/.test(f.id)?f.id:slug(f.label),n=2,base=id;while(used.has(id))id=`${base}_${n++}`;used.add(id);return {...f,id};});const remap=Object.fromEntries(draft.fields.map((f,i)=>[f.id,fields[i].id]));const leadMap=Object.fromEntries(Object.entries(draft.leadMap).map(([k,v])=>[k,remap[v]||v]));return {name:draft.name,description:draft.description,status:draft.status,clientId:draft.clientId,fields,submitLabel:draft.submitLabel||'Send',thanks:draft.thanks,consentText:draft.consentText,createLead:draft.createLead,leadMap:draft.createLead?leadMap:{}};};
    const fail=e=>{const el=document.querySelector('#fb-error');el.textContent=e.message;el.classList.remove('hidden');};
    const wire=()=>{
      const rows=[...document.querySelectorAll('[data-fb]')];
      document.querySelector('#fb-add').onclick=()=>{read();draft.fields.push({id:'field_'+Date.now().toString(36),label:'',type:'text',required:false,options:[],help:''});paint();};
      document.querySelector('#fb-lead').onchange=()=>{read();paint();};
      rows.forEach(row=>{const i=Number(row.dataset.fb);
        row.querySelector('[data-fb-type]').onchange=()=>{read();paint();};
        row.querySelector('[data-fb-remove]').onclick=()=>{read();draft.fields.splice(i,1);paint();};
        row.querySelector('[data-fb-up]').onclick=()=>{read();[draft.fields[i-1],draft.fields[i]]=[draft.fields[i],draft.fields[i-1]];paint();};
        row.querySelector('[data-fb-down]').onclick=()=>{read();[draft.fields[i+1],draft.fields[i]]=[draft.fields[i],draft.fields[i+1]];paint();};
      });
      document.querySelector('#fb-save').onclick=async()=>{try{const body=JSON.stringify(payload());await(record.id?api(`/records/forms/${record.id}`,{method:'PUT',body}):api('/records/forms',{method:'POST',body}));ctx.closeModal();await ctx.refresh();}catch(e){fail(e);}};
      document.querySelector('#fb-delete')?.addEventListener('click',async()=>{try{await api(`/records/forms/${record.id}`,{method:'DELETE'});ctx.closeModal();await ctx.refresh();}catch(e){fail(e);}});
      document.querySelector('#fb-try').onclick=()=>{try{const p=payload();fill({...p,id:record.id||'preview'},{test:true});}catch(e){fail(e);}};
    };
    ctx.modal(record.id?`Form · ${record.name}`:'New form','<div id="fb-root"></div>','drawer');paint();
  }

  // ---------- filling a form in ----------
  function control(f){
    const id='ff-'+f.id,req=f.required?'required':'',label=`<label for="${id}">${esc(f.label)}${f.required?' *':''}</label>`,hint=f.help?`<small>${esc(f.help)}</small>`:'';
    if(f.type==='textarea')return `<div class="field full">${label}<textarea id="${id}" name="${f.id}" ${req} maxlength="5000"></textarea>${hint}</div>`;
    if(f.type==='select')return `<div class="field">${label}<select id="${id}" name="${f.id}" ${req}><option value="">Choose…</option>${(f.options||[]).map(o=>`<option>${esc(o)}</option>`).join('')}</select>${hint}</div>`;
    if(f.type==='checkbox')return `<div class="field full"><label class="tick"><input type="checkbox" id="${id}" name="${f.id}"> ${esc(f.label)}${f.required?' *':''}</label>${hint}</div>`;
    const type={email:'email',phone:'tel',number:'number',date:'date'}[f.type]||'text';
    return `<div class="field">${label}<input id="${id}" name="${f.id}" type="${type}" ${req} ${type==='number'?'step="any"':''}>${hint}</div>`;
  }
  function fill(form,{test=false}={}){
    const b=brand();
    ctx.modal(form.name,`<div class="ff-card"><div class="ff-head">${b.logo?`<img src="${esc(b.logo)}" alt="" class="brand-logo-preview">`:''}<strong>${esc(b.name)}</strong>${test?'<span class="badge amber">Trying it. Nothing is saved.</span>':''}</div><form id="ff-form" novalidate>${form.description?`<p class="sub">${esc(form.description)}</p>`:''}<div class="form-grid">${form.fields.map(control).join('')}</div>${form.consentText?`<label class="tick ff-consent"><input type="checkbox" id="ff-consent"> ${esc(form.consentText)}</label>`:''}<div class="form-error hidden" id="ff-error"></div><button class="ff-submit" type="submit" style="background:${esc(b.accent)};color:${textOn(b.accent)}">${esc(form.submitLabel||'Send')}</button></form>${b.footer?`<small class="ff-footer">${esc(b.footer)}</small>`:''}</div>`,'wide');
    document.querySelector('#ff-form').onsubmit=async e=>{
      e.preventDefault();const answers={};
      for(const f of form.fields){const el=e.target.elements[f.id];answers[f.id]=f.type==='checkbox'?el.checked:el.value;}
      try{
        if(test){const {errors}=checkAnswers(form.fields,answers);if(errors.length)throw new Error(errors[0]);}
        else await api(`/forms/${form.id}/responses`,{method:'POST',body:JSON.stringify({answers,consent:document.querySelector('#ff-consent')?.checked===true})});
        document.querySelector('#ff-form').outerHTML=`<div class="notice ff-thanks">${esc(form.thanks)}</div><div class="form-actions"><button class="btn" id="ff-done">Done</button></div>`;
        document.querySelector('#ff-done').onclick=()=>ctx.closeModal();
        if(!test)await ctx.refresh();
      }catch(err){const el=document.querySelector('#ff-error');el.textContent=err.message;el.classList.remove('hidden');}
    };
  }

  // ---------- responses ----------
  function showResponses(formId){
    const form=data().forms.find(f=>f.id===formId),list=responses(formId);
    const answer=(r)=>Object.entries(r.answers).filter(([,v])=>v!==''&&v!==false).map(([k,v])=>`<div class="resp-line"><small>${esc(r.fieldLabels?.[k]||k)}</small><span>${esc(v===true?'Yes':v)}</span></div>`).join('');
    ctx.modal(`${form.name} · ${list.length} response${list.length===1?'':'s'}`,list.map(r=>`<article class="resp"><div class="resp-head"><strong>${fmt(r.createdAt)}</strong><span class="row-sub">${r.consent?'Agreed to marketing email':'No marketing consent'}${r.prospectId?' · lead created':''}</span><label class="tick"><input type="checkbox" data-resp-handled="${esc(r.id)}" ${r.handled?'checked':''}> Handled</label></div>${answer(r)}</article>`).join('')||'<p class="sub">No responses yet.</p>','wide');
    document.querySelectorAll('[data-resp-handled]').forEach(box=>box.onchange=()=>ctx.perform(async()=>{await api(`/records/formSubmissions/${box.dataset.respHandled}`,{method:'PUT',body:JSON.stringify({handled:box.checked})});await ctx.refresh();showResponses(formId);}));
  }

  function bind(){
    document.querySelectorAll('[data-form-fill]').forEach(b=>b.onclick=()=>{const f=data().forms.find(x=>x.id===b.dataset.formFill);if(f.status!=='Live')return ctx.toast('Make the form live first, or use “Try it” in the builder.');fill(f);});
    document.querySelectorAll('[data-form-responses]').forEach(b=>b.onclick=()=>showResponses(b.dataset.formResponses));
  }

  return {render,build,bind};
}
