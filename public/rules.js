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
  'release.status':{label:'a release changes status',collection:'releases',event:'status'},
  'deal.created':{label:'a deal is created',collection:'deals',event:'create'},
  'deal.stage':{label:'a deal changes stage',collection:'deals',event:'status',statusField:'stage'},
  'proposal.status':{label:'a proposal changes stage',collection:'proposals',event:'status'},
  'support.created':{label:'a support request is logged',collection:'supportRequests',event:'create'},
  'support.overdue':{label:'a support request becomes overdue',collection:'supportRequests',event:'overdue'},
  'consent.changed':{label:'a contact’s marketing consent changes',collection:'clientContacts',event:'status',statusField:'marketingConsent'}
};
// Most records keep their stage in `status`; deals and contacts use their own field.
export const statusField=collection=>Object.values(TRIGGERS).find(t=>t.collection===collection&&t.statusField)?.statusField||'status';
export const FIELDS={
  tasks:{toStatus:'new status',fromStatus:'previous status',priority:'priority',type:'type',title:'title'},
  ticketEvidence:{title:'check name'},
  prospects:{toStatus:'new stage',fromStatus:'previous stage',source:'source',company:'company'},
  contracts:{toStatus:'new stage',fromStatus:'previous stage',value:'value'},
  invoices:{amount:'amount',number:'number'},
  projects:{workflow:'workflow',name:'name'},
  releases:{toStatus:'new status',fromStatus:'previous status',name:'name'},
  deals:{toStatus:'new stage',fromStatus:'previous stage',value:'value',title:'name'},
  proposals:{toStatus:'new stage',fromStatus:'previous stage',title:'name'},
  supportRequests:{priority:'priority',channel:'came in by',title:'request'},
  clientContacts:{toStatus:'new consent',fromStatus:'previous consent',role:'role'}
};
export const OPS={is:'is',isNot:'is not',contains:'contains',greater:'is greater than'};
export const ACTIONS={
  createTask:{label:'Create a task',needs:['title','dueInDays','priority']},
  addNote:{label:'Add a note',needs:['title','body']},
  setPriority:{label:'Set the task’s priority',needs:['priority'],only:['tasks']},
  comment:{label:'Comment on the ticket',needs:['body'],only:['tasks','ticketEvidence']},
  createSupportRequest:{label:'Log a support request',needs:['title','priority']},
  flag:{label:'Flag it for me on Today',needs:['body']}
};
export const fillTemplate=(text,vars)=>String(text||'').replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);

export function describeRule(rule){
  const t=TRIGGERS[rule.trigger],fields=FIELDS[t?.collection]||{};
  const when=t?`When ${t.label}`:'When (unknown trigger)';
  const ifs=(rule.conditions||[]).map(c=>`${fields[c.field]||c.field} ${OPS[c.op]||c.op} “${c.value}”`);
  const thens=(rule.actions||[]).map(a=>{const label=ACTIONS[a.type]?.label||a.type;if(a.type==='createTask')return `${label.toLowerCase()} “${a.title}”${a.dueInDays!==undefined&&a.dueInDays!==''?` due in ${a.dueInDays} day${Number(a.dueInDays)===1?'':'s'}`:''}`;if(a.type==='addNote')return `${label.toLowerCase()} “${a.title}”`;if(a.type==='createSupportRequest')return `${label.toLowerCase()} “${a.title}”${a.priority?` (${a.priority.toLowerCase()} priority)`:''}`;if(a.type==='setPriority')return `set priority to ${a.priority}`;return `${label.toLowerCase()}: “${a.body}”`;});
  return `${when}${ifs.length?', if '+ifs.join(' and '):''}, then ${thens.join(', then ')||'do nothing'}.`;
}
