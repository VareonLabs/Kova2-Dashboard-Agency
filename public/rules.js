// Automation rules: "when [trigger], if [conditions], then [actions]". Shared by the server engine and the builder
// so a rule reads the same everywhere. Actions only change local records; nothing is sent, published or deployed.
export const TRIGGERS={
  'task.created':{label:'a task or ticket is created',collection:'tasks',event:'create'},
  'task.status':{label:'a task or ticket changes status',collection:'tasks',event:'status'},
  'task.overdue':{label:'a task or ticket becomes overdue',collection:'tasks',event:'overdue'},
  'check.failed':{label:'a check fails on a ticket',collection:'ticketEvidence',event:'create',implicit:{kind:'Check',result:'Failed'}},
  'prospect.status':{label:'a prospect changes stage',collection:'prospects',event:'status'},
  'contract.status':{label:'a contract changes stage',collection:'contracts',event:'status'},
  'invoice.overdue':{label:'an invoice becomes overdue',collection:'invoices',event:'overdue'},
  'project.created':{label:'a project is created',collection:'projects',event:'create'},
  'release.status':{label:'a release changes status',collection:'releases',event:'status'}
};
export const FIELDS={
  tasks:{toStatus:'new status',fromStatus:'previous status',priority:'priority',type:'type',title:'title'},
  ticketEvidence:{title:'check name'},
  prospects:{toStatus:'new stage',fromStatus:'previous stage',source:'source',company:'company'},
  contracts:{toStatus:'new stage',fromStatus:'previous stage',value:'value'},
  invoices:{amount:'amount',number:'number'},
  projects:{workflow:'workflow',name:'name'},
  releases:{toStatus:'new status',fromStatus:'previous status',name:'name'}
};
export const OPS={is:'is',isNot:'is not',contains:'contains',greater:'is greater than'};
export const ACTIONS={
  createTask:{label:'Create a task',needs:['title','dueInDays','priority']},
  addNote:{label:'Add a note',needs:['title','body']},
  setPriority:{label:'Set the task’s priority',needs:['priority'],only:['tasks']},
  comment:{label:'Comment on the ticket',needs:['body'],only:['tasks','ticketEvidence']},
  flag:{label:'Flag it for me on Today',needs:['body']}
};
export const fillTemplate=(text,vars)=>String(text||'').replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);

export function describeRule(rule){
  const t=TRIGGERS[rule.trigger],fields=FIELDS[t?.collection]||{};
  const when=t?`When ${t.label}`:'When (unknown trigger)';
  const ifs=(rule.conditions||[]).map(c=>`${fields[c.field]||c.field} ${OPS[c.op]||c.op} “${c.value}”`);
  const thens=(rule.actions||[]).map(a=>{const label=ACTIONS[a.type]?.label||a.type;if(a.type==='createTask')return `${label.toLowerCase()} “${a.title}”${a.dueInDays!==undefined&&a.dueInDays!==''?` due in ${a.dueInDays} day${Number(a.dueInDays)===1?'':'s'}`:''}`;if(a.type==='addNote')return `${label.toLowerCase()} “${a.title}”`;if(a.type==='setPriority')return `set priority to ${a.priority}`;return `${label.toLowerCase()}: “${a.body}”`;});
  return `${when}${ifs.length?', if '+ifs.join(' and '):''}, then ${thens.join(', then ')||'do nothing'}.`;
}
