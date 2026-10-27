// Optional areas of the workspace. Switching one off hides it everywhere (menus, ⌘K, Today and project tabs)
// without deleting anything; switching it back on brings it all back. Everything is on by default.
export const MODULES=[
  {key:'sales',label:'Sales pipeline',description:'Prospects, follow-ups, client onboarding and contracts.',pages:['prospects','followups','onboarding','proposals','contracts']},
  {key:'inbox',label:'Inbox',description:'Your Outlook mailbox inside VareonHQ.',pages:['inbox']},
  {key:'marketing',label:'Marketing',description:'Content studio, website analytics and the media library.',pages:['marketing','analytics','assets','funnels']},
  {key:'finance',label:'Finance and time',description:'Budgets and invoices, cash-flow forecast, time and profitability, renewals and client reports.',pages:['finance','retainers','forecast','time','renewals','reports'],projectTabs:['Time']},
  {key:'meetings',label:'Meetings',description:'Meeting notes and their reviewed action proposals.',pages:['meetings']},
  {key:'software',label:'Software delivery',description:'Coding workspaces, live preview, technology records and each project’s Delivery tab: repositories, environments, releases and delivery runs. Tickets in software projects keep their gates either way.',pages:['build','codex','technology'],projectTabs:['Delivery']},
  {key:'automation',label:'Automation',description:'Rules and scheduled assistant work.',pages:['automations']}
];
export const isOn=(settings,key)=>settings?.modules?.[key]!==false;
export const hiddenPages=settings=>new Set(MODULES.filter(m=>!isOn(settings,m.key)).flatMap(m=>m.pages));
export const hiddenProjectTabs=settings=>new Set(MODULES.filter(m=>!isOn(settings,m.key)).flatMap(m=>m.projectTabs||[]));
