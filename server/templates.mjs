import { saveRecord } from './domain.mjs';
import { plusDays, validDay } from './planning.mjs';
import { agencyStandard } from '../public/requirements.js';

// Versioned project templates and the deal-won hand-off. Drafts are ordinary records; published versions are
// immutable snapshots created only by the owner. A project remembers the version it was built from, and newer
// versions can be reviewed and applied to it without touching work that already exists.
const TYPES=['Task','Epic','Feature','Story','Bug','Spike','Technical debt'];
export const itemKey=title=>String(title).trim().toLowerCase().replace(/\s+/g,' ');

export function parseKickoff(text){
  return String(text||'').split('\n').map(l=>l.trim()).filter(Boolean).map((line,i)=>{
    const [head,offset='0',criteria='']=line.split('|').map(v=>v.trim());const m=/^([A-Za-z ]+):\s*(.+)$/.exec(head),type=m&&TYPES.find(t=>t.toLowerCase()===m[1].trim().toLowerCase());
    const title=(type?m[2]:head).trim();if(!title)throw new Error(`Kickoff line ${i+1} needs a title.`);if(!/^\d{1,3}$/.test(offset))throw new Error(`Kickoff line ${i+1}: use “Type: Title | days after start | acceptance criteria”.`);
    return {key:itemKey(title),type:type||'Task',title:title.slice(0,300),offset:+offset,acceptanceCriteria:criteria.slice(0,5000)};
  });
}
export function parseSteps(text){
  return String(text||'').split('\n').map(l=>l.trim()).filter(Boolean).map((line,i)=>{const [title,offset='0']=line.split('|').map(v=>v.trim());if(!title||!/^\d{1,3}$/.test(offset))throw new Error(`Onboarding line ${i+1}: use “Step title | days after start”.`);return {key:itemKey(title),title:title.slice(0,300),offset:+offset};});
}
export function snapshotOf(store,template){
  const onboarding=template.onboardingTemplateId?store.get('onboardingTemplates',template.onboardingTemplateId):null;
  const kickoff=parseKickoff(template.kickoffText),steps=onboarding?parseSteps(onboarding.stepsText):[];
  for(const list of [kickoff,steps]){const seen=new Set();for(const i of list){if(seen.has(i.key))throw new Error(`“${i.title}” appears twice. Each item needs a unique title.`);seen.add(i.key);}}
  return {name:template.name,description:template.description||'',workflow:template.workflow||'Simple',durationDays:template.durationDays||0,createStandard:!!template.createStandard,onboarding:onboarding?{name:onboarding.name,steps}:null,kickoff};
}
export function diffVersions(before,after){
  const compare=(a=[],b=[])=>{const old=new Map(a.map(i=>[i.key,i]));return {added:b.filter(i=>!old.has(i.key)),removed:a.filter(i=>!b.some(x=>x.key===i.key)),changed:b.filter(i=>old.has(i.key)&&JSON.stringify(old.get(i.key))!==JSON.stringify(i))};};
  const kickoff=compare(before?.kickoff,after.kickoff),steps=compare(before?.onboarding?.steps,after.onboarding?.steps||[]);
  const settings=['workflow','durationDays','createStandard','description'].filter(k=>JSON.stringify(before?.[k])!==JSON.stringify(after[k]));
  return {kickoff,steps,settings,empty:![...Object.values(kickoff),...Object.values(steps)].some(l=>l.length)&&!settings.length};
}
const versionsOf=(store,templateId)=>store.list('templateVersions').filter(v=>v.templateId===templateId).sort((a,b)=>b.number-a.number);

export function publishTemplate(store,templateId,{reason=''}={},actor='You'){
  if(actor!=='You')throw new Error('Only the owner can publish a template version.');
  const template=store.get('projectTemplates',templateId);if(!template)throw new Error('Template not found.');
  const snapshot=snapshotOf(store,template),latest=versionsOf(store,templateId)[0],diff=diffVersions(latest?.snapshot,snapshot),why=String(reason||'').trim().slice(0,2000);
  if(!snapshot.kickoff.length&&!snapshot.onboarding)throw new Error('Add kickoff tickets or an onboarding checklist before publishing.');
  if(latest&&diff.empty)throw new Error(`Nothing has changed since version ${latest.number}.`);
  if(latest&&!why)throw new Error('Say what changed in this version.');
  const version=store.put('templateVersions',{templateId,number:(latest?.number||0)+1,reason:why||'First version',publishedBy:actor,publishedAt:new Date().toISOString(),snapshot},{actor});
  store.log(`Published ${template.name} version ${version.number}`,actor,templateId);return version;
}

function createItems(store,{project,clientId,startDate,version,items,kind,actor}){
  const software=project.workflow==='Software',created=[];
  for(const item of items){
    const exists=store.list('tasks').some(t=>t.projectId===project.id&&t.templateItemKey===kind+':'+item.key);if(exists)continue;
    const task=saveRecord(store,'tasks',{title:item.title,type:item.type||'Task',projectId:project.id,clientId,status:software?'Backlog':'To do',dueDate:startDate?plusDays(startDate,item.offset):'',acceptanceCriteria:item.acceptanceCriteria||'',notes:`From template ${version.snapshot.name} v${version.number}`},undefined,actor);
    created.push(store.put('tasks',{...store.get('tasks',task.id),templateItemKey:kind+':'+item.key,templateVersion:version.number}).id);
  }
  return created;
}

// Owner-confirmed hand-off. Each step is recorded as it completes, so retrying after an interruption resumes
// instead of creating a second client, project or set of tickets.
export function winProspect(store,prospectId,{versionId='',projectName='',startDate=''}={},actor='You'){
  if(actor!=='You')throw new Error('Only the owner can set up a won client.');
  const prospect=store.get('prospects',prospectId);if(!prospect)throw new Error('Prospect not found.');
  if(startDate&&!validDay(startDate))throw new Error('Choose a valid start date.');
  const version=versionId?store.get('templateVersions',versionId):null;if(versionId&&!version)throw new Error('Choose a published template version.');
  let handoff=store.list('handoffs').find(h=>h.prospectId===prospectId);
  if(handoff?.status==='Complete')throw new Error('This prospect has already been set up. Open its project instead.');
  handoff=store.put('handoffs',{...(handoff||{prospectId,status:'In progress',steps:{},startedAt:new Date().toISOString()}),templateVersionId:handoff?.templateVersionId||versionId});
  const save=steps=>handoff=store.put('handoffs',{...handoff,steps:{...handoff.steps,...steps}});
  const snapshot=version?.snapshot,start=startDate||new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
  let clientId=handoff.steps.clientId||prospect.clientId;
  if(!clientId||!store.get('clients',clientId)){const client=saveRecord(store,'clients',{name:prospect.company||prospect.name,company:prospect.company,email:prospect.email,phone:prospect.phone,notes:[prospect.notes,'Source: '+(prospect.sourceUrl||prospect.source||'prospect')].filter(Boolean).join('\n'),status:'Active'},undefined,actor);clientId=client.id;}
  save({clientId});if(prospect.status!=='Won'||prospect.clientId!==clientId)saveRecord(store,'prospects',{clientId,status:'Won'},prospectId,actor);
  let project=handoff.steps.projectId&&store.get('projects',handoff.steps.projectId);
  if(!project){const name=String(projectName||'').trim()||`${prospect.company||prospect.name} project`;project=saveRecord(store,'projects',{name,clientId,status:'Planning',workflow:snapshot?.workflow||'Simple',startDate:start,dueDate:snapshot?.durationDays?plusDays(start,snapshot.durationDays):'',description:snapshot?.description||''},undefined,actor);if(version)project=store.put('projects',{...project,templateId:version.templateId,templateVersionId:version.id,templateVersion:version.number});save({projectId:project.id});}
  if(version){
    if(snapshot.onboarding&&!handoff.steps.onboardingId){const taskIds=createItems(store,{project,clientId,startDate:start,version,items:snapshot.onboarding.steps,kind:'onboarding',actor});const onboarding=store.put('onboardings',{name:`${store.get('clients',clientId).name} · ${snapshot.onboarding.name}`,templateId:'',clientId,projectId:project.id,startDate:start,taskIds,templateName:snapshot.onboarding.name});save({onboardingId:onboarding.id});}
    if(!handoff.steps.kickoffDone){createItems(store,{project,clientId,startDate:start,version,items:snapshot.kickoff,kind:'kickoff',actor});save({kickoffDone:true});}
    if(snapshot.createStandard&&!store.list('projectStandards').some(s=>s.projectId===project.id)){const draft=saveRecord(store,'projectStandards',{projectId:project.id,...agencyStandard},undefined,actor);save({standardId:draft.id});}
  }
  handoff=store.put('handoffs',{...handoff,status:'Complete',completedAt:new Date().toISOString()});
  store.log(`Set up ${store.get('clients',clientId).name} from a won prospect${version?` using ${snapshot.name} v${version.number}`:''}`,actor,project.id);
  return {...handoff,clientId,projectId:project.id};
}

export function templateUpdate(store,projectId){
  const project=store.get('projects',projectId);if(!project?.templateId)return null;
  const latest=versionsOf(store,project.templateId)[0],current=store.get('templateVersions',project.templateVersionId);
  if(!latest||!current||latest.number<=current.number)return null;
  const diff=diffVersions(current.snapshot,latest.snapshot),has=kind=>new Set(store.list('tasks').filter(t=>t.projectId===projectId&&t.templateItemKey?.startsWith(kind+':')).map(t=>t.templateItemKey.slice(kind.length+1)));
  const existingKick=has('kickoff'),existingSteps=has('onboarding');
  return {from:current.number,to:latest.number,versionId:latest.id,reason:latest.reason,templateName:latest.snapshot.name,addKickoff:latest.snapshot.kickoff.filter(i=>!existingKick.has(i.key)),addSteps:(latest.snapshot.onboarding?.steps||[]).filter(i=>!existingSteps.has(i.key)),removed:[...diff.kickoff.removed,...diff.steps.removed].map(i=>i.title),changed:[...diff.kickoff.changed,...diff.steps.changed].map(i=>i.title),settings:diff.settings};
}
export function applyTemplateUpdate(store,projectId,versionId,actor='You'){
  if(actor!=='You')throw new Error('Only the owner can apply a template update.');
  const update=templateUpdate(store,projectId);if(!update||update.versionId!==versionId)throw new Error('This update is no longer current. Reload the project.');
  const project=store.get('projects',projectId),version=store.get('templateVersions',versionId),start=project.startDate||new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
  const kickoff=createItems(store,{project,clientId:project.clientId,startDate:start,version,items:update.addKickoff,kind:'kickoff',actor});
  const steps=createItems(store,{project,clientId:project.clientId,startDate:start,version,items:update.addSteps,kind:'onboarding',actor});
  if(steps.length){const onboarding=store.list('onboardings').find(o=>o.projectId===projectId);if(onboarding)store.put('onboardings',{...onboarding,taskIds:[...onboarding.taskIds,...steps]});}
  store.put('projects',{...project,templateVersionId:version.id,templateVersion:version.number});
  store.log(`Applied ${version.snapshot.name} v${version.number}: ${kickoff.length+steps.length} new items`,actor,projectId);
  return {added:kickoff.length+steps.length,version:version.number};
}
