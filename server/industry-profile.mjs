import { z } from 'zod';

const word=(label,max=48)=>z.string().trim().min(1,`Add a ${label}.`).max(max);
const moduleKeys=['sales','inbox','marketing','finance','meetings','software','automation'];
export const industryProfileSchema=z.object({
  industry:word('industry',100),
  description:z.string().trim().max(500).default(''),
  workSingular:word('name for the main work item'),
  workPlural:word('plural name for the main work item'),
  taskSingular:word('name for a work step'),
  taskPlural:word('plural name for work steps'),
  customerSingular:word('customer name'),
  customerPlural:word('plural customer name'),
  stages:z.array(word('workflow stage',40)).min(2,'Add at least two workflow stages.').max(10,'Use up to ten active workflow stages.'),
  completionLabel:word('completion label',40),
  assistantGuidance:z.string().trim().max(4000).default(''),
  modules:z.record(z.string(),z.boolean()).default({})
}).superRefine((p,ctx)=>{
  const stages=p.stages.map(s=>s.toLowerCase());
  if(new Set(stages).size!==stages.length)ctx.addIssue({code:'custom',path:['stages'],message:'Workflow stage names must be unique.'});
  if(stages.some(s=>['done','blocked','cancelled','complete','on hold'].includes(s)))ctx.addIssue({code:'custom',path:['stages'],message:'Use the separate completion label. Done, Complete, On hold, Blocked and Cancelled are reserved system states.'});
  for(const key of Object.keys(p.modules))if(!moduleKeys.includes(key))ctx.addIssue({code:'custom',path:['modules',key],message:'Unknown workspace area.'});
});

export const INDUSTRY_STARTERS={
  'Software & digital':{industry:'Software & digital',workSingular:'Project',workPlural:'Projects',taskSingular:'Ticket',taskPlural:'Tickets',customerSingular:'Client',customerPlural:'Clients',stages:['Backlog','Ready','In progress','In review','QA / staging','Ready for release'],completionLabel:'Done',modules:{sales:true,inbox:true,marketing:true,finance:true,meetings:true,software:true,automation:true}},
  'Cleaning & field services':{industry:'Cleaning & field services',workSingular:'Job',workPlural:'Jobs',taskSingular:'Checklist item',taskPlural:'Checklist items',customerSingular:'Customer',customerPlural:'Customers',stages:['New','Scheduled','Assigned','In progress','Quality check','Ready to invoice'],completionLabel:'Completed',modules:{sales:true,inbox:true,marketing:false,finance:true,meetings:false,software:false,automation:true}},
  'Construction & trades':{industry:'Construction & trades',workSingular:'Job',workPlural:'Jobs',taskSingular:'Task',taskPlural:'Tasks',customerSingular:'Customer',customerPlural:'Customers',stages:['New','Quoted','Scheduled','On site','Inspection','Ready to invoice'],completionLabel:'Completed',modules:{sales:true,inbox:true,marketing:false,finance:true,meetings:true,software:false,automation:true}},
  'Retail & ecommerce':{industry:'Retail & ecommerce',workSingular:'Order',workPlural:'Orders',taskSingular:'Fulfilment step',taskPlural:'Fulfilment steps',customerSingular:'Customer',customerPlural:'Customers',stages:['New','Confirmed','Picking','Packed','Shipped'],completionLabel:'Delivered',modules:{sales:true,inbox:true,marketing:true,finance:true,meetings:false,software:false,automation:true}},
  'Professional services':{industry:'Professional services',workSingular:'Engagement',workPlural:'Engagements',taskSingular:'Task',taskPlural:'Tasks',customerSingular:'Client',customerPlural:'Clients',stages:['Intake','Scoped','In progress','Review','Ready to deliver'],completionLabel:'Delivered',modules:{sales:true,inbox:true,marketing:false,finance:true,meetings:true,software:false,automation:true}},
  'Creative & marketing':{industry:'Creative & marketing',workSingular:'Campaign',workPlural:'Campaigns',taskSingular:'Task',taskPlural:'Tasks',customerSingular:'Client',customerPlural:'Clients',stages:['Idea','Planning','In progress','In review','Scheduled'],completionLabel:'Published',modules:{sales:true,inbox:true,marketing:true,finance:true,meetings:true,software:false,automation:true}}
};

export const defaultIndustryProfile=()=>({...INDUSTRY_STARTERS['Software & digital'],description:'',assistantGuidance:'',stages:[...INDUSTRY_STARTERS['Software & digital'].stages],modules:{...INDUSTRY_STARTERS['Software & digital'].modules}});
export const emptyIndustryProfile=()=>({...INDUSTRY_STARTERS['Professional services'],industry:'',description:'',assistantGuidance:'',stages:[...INDUSTRY_STARTERS['Professional services'].stages],modules:{sales:true,inbox:true,marketing:true,finance:true,meetings:true,software:true,automation:true}});

export function saveIndustryProfile(store,input,{completeSetup=false}={}){
  const parsed=industryProfileSchema.safeParse(input);
  if(!parsed.success)throw new Error(parsed.error.issues[0]?.message||'Check the industry setup details.');
  const profile={...parsed.data,modules:Object.fromEntries(moduleKeys.map(k=>[k,parsed.data.modules[k]!==false]))};
  store.db.exec('SAVEPOINT industry_setup');
  try{
    store.setting('workspaceProfile',profile);
    store.setting('modules',{...(store.settings().modules||{}),...profile.modules});
    if(completeSetup)store.setting('workspaceSetupComplete',true);
    store.log(`Updated workspace profile for ${profile.industry}`,'You');
    store.db.exec('RELEASE industry_setup');
  }catch(error){store.db.exec('ROLLBACK TO industry_setup');store.db.exec('RELEASE industry_setup');throw error;}
  return profile;
}
