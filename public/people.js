// Team members and contractors, and how much open ticket work each has against weekly capacity.
const day=ms=>new Date(ms).toISOString().slice(0,10);
const brisbaneToday=(now=new Date())=>now.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
export const weekStart=iso=>{const d=Date.parse(iso+'T00:00:00Z'),dow=(new Date(d).getUTCDay()+6)%7;return day(d-dow*86400000);};
const addDays=(iso,n)=>day(Date.parse(iso+'T00:00:00Z')+n*86400000);
const OPEN=t=>!['Done','Cancelled'].includes(t.status);

export function teamLoad(data,{weeks=4,now=new Date()}={}){
  const first=weekStart(brisbaneToday(now));
  const starts=Array.from({length:weeks},(_,i)=>addDays(first,i*7));
  const people=(data.people||[]).filter(p=>p.status==='Active');
  const open=(data.tasks||[]).filter(OPEN);
  const load=assigneeId=>{
    const mine=open.filter(t=>(t.assigneeId||'')===assigneeId);
    const weekly=starts.map(()=>0);let unscheduled=0,overdue=0;
    for(const t of mine){
      const hours=Number(t.estimatedHours)||0,when=t.scheduledDate||t.dueDate;
      if(!when){unscheduled+=hours;continue;}
      const w=weekStart(when);
      if(w<first){overdue+=hours;continue;}
      const i=starts.indexOf(w);
      if(i>=0)weekly[i]+=hours;
    }
    const round=n=>Math.round(n*10)/10;
    return {weekly:weekly.map(round),unscheduled:round(unscheduled),overdue:round(overdue),tickets:mine.length};
  };
  return {weeks:starts,rows:people.map(p=>({person:p,capacity:p.weeklyHours,...load(p.id)})),unassigned:load('')};
}

export function createPeopleUI(ctx){
  const {esc,currency,badge}=ctx;
  const data=()=>ctx.getData();
  const label=iso=>new Date(iso+'T00:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'UTC'});
  const cell=(hours,capacity)=>`<td class="${capacity&&hours>capacity?'over-capacity':''}">${hours||'–'}${capacity&&hours>capacity?' <span class="badge red">Over</span>':''}</td>`;

  function loadPanel(){
    const {weeks,rows,unassigned}=teamLoad(data());
    const head=`<tr><th>Person</th><th>Capacity a week</th>${weeks.map(w=>`<th>Week of ${label(w)}</th>`).join('')}<th>Overdue</th><th>No date</th></tr>`;
    const body=rows.map(r=>`<tr><td><button class="link title-cell" data-edit="people:${esc(r.person.id)}">${esc(r.person.name)}</button><small>${esc(r.person.kind)} · ${r.tickets} open ticket${r.tickets===1?'':'s'}</small></td><td>${r.capacity}h</td>${r.weekly.map(h=>cell(h,r.capacity)).join('')}${cell(r.overdue,0)}${cell(r.unscheduled,0)}</tr>`).join('')+`<tr><td><strong>Unassigned</strong><small>${unassigned.tickets} open ticket${unassigned.tickets===1?'':'s'}</small></td><td></td>${unassigned.weekly.map(h=>cell(h,0)).join('')}${cell(unassigned.overdue,0)}${cell(unassigned.unscheduled,0)}</tr>`;
    return ctx.panel('Capacity','Estimated hours on open tickets, by the week they are scheduled or due',`<div><div class="table-wrap"><table class="table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`);
  }

  function peoplePanel(){
    const list=ctx.viewRecords('people',data().people||[]);
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Person</th><th>Type</th><th>Hours a week</th><th>Cost an hour</th><th>Status</th></tr></thead><tbody>${list.map(p=>`<tr><td><button class="link title-cell" data-edit="people:${esc(p.id)}">${esc(p.name)}</button>${p.skills?`<small>${esc(p.skills)}</small>`:''}</td><td>${esc(p.kind)}</td><td>${p.weeklyHours}</td><td>${currency(p.hourlyCost)}</td><td>${badge(p.status)}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('users','No one on the team yet','Add yourself, employees and contractors, give each a weekly capacity, then assign tickets to them.',ctx.addButton('people','Add a person'));
    return ctx.panel('Team and contractors',`${list.length} people`,body,list.length?ctx.addButton('people','Add a person'):'');
  }

  return {render(){return ctx.heading('PLAN','Team & capacity','Who is doing what, and whether the next few weeks fit.',ctx.addButton('people','Add a person'))+ctx.toolbar(['All','Active','Inactive'])+loadPanel()+peoplePanel();}};
}
