import {cleanChatText} from '../public/chat-format.js';
import {createChatFiles} from './chat-files.mjs';
import {createMemory,memoryFiles} from './memory.mjs';
const fields={onboardingTemplates:['name','stepsText'],onboardings:['name'],renewals:['name','kind','notes'],timeEntries:['title','notes'],meetingNotes:['title','transcript','notes'],documents:['title','category','folder','version','body'],meetings:['title','notes'],forecastItems:['title','notes'],reportSchedules:['name'],clientReports:['start','end','status'],clients:['name','company','email','phone','notes'],prospects:['name','company','email','website','notes','source'],projects:['name','description'],designs:['title','figmaUrl','notes'],services:['name','description'],retainers:['name','notes'],forms:['name','description'],adAccounts:['name','accountId','notes'],socialAccounts:['name','handle','notes'],answerChecks:['prompt','notes','competitors'],deals:['title','notes','lostReason'],clientContacts:['name','email','role','notes'],people:['name','email','skills','notes'],clientAssets:['name','kind','notes'],supportRequests:['title','notes'],proposals:['title','notes'],variations:['title','reason'],tasks:['title','notes'],emails:['subject','fromName','from','to','body'],posts:['title','content','slides','platform'],contracts:['title','notes'],notes:['title','body'],invoices:['title','number','notes'],expenses:['title','category','notes'],resources:['name','provider','notes'],websites:['name','url'],automations:['name','prompt'],messages:['content'],approvals:['title','reviewNote']};
const readable=value=>cleanChatText(value).replace(/^\s*#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,(_,a,b)=>a||b).replace(/^\s*[-*+]\s+/gm,'').replace(/`([^`]+)`/g,'$1');
const normal=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const snippet=(value,terms)=>{value=String(value).replace(/\s+/g,' ').trim();const text=normal(value),positions=terms.map(t=>text.indexOf(t)).filter(i=>i>=0),start=Math.max(0,(positions.length?Math.min(...positions):0)-45);return (start?'…':'')+value.slice(start,start+200)+(value.length>start+200?'…':'');};
export const searchTypes=[...Object.keys(fields),'files','memory'];
export function createSearch(store,memory=createMemory(store,store.directory)) {
 const files=createChatFiles(store,store.directory);
 function query({query='',type='all',offset=0,limit=40}={}) {
  if(typeof query!=='string'||query.length>200)throw new Error('Keep the search under 200 characters');
  if(type!=='all'&&!searchTypes.includes(type))throw new Error('Choose a search category');
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Choose a valid result range');
  const terms=normal(query.trim()).split(/\s+/).filter(Boolean).slice(0,10);if(!terms.length)return {query,items:[],total:0,offset,hasMore:false};
  const results=[];
  const add=(kind,r,title,body,extra={})=>{const haystack=normal([title,body].join(' '));if(!terms.every(t=>haystack.includes(t)))return;const titleText=normal(title),score=terms.reduce((n,t)=>n+(titleText===t?80:titleText.startsWith(t)?40:titleText.includes(t)?20:2),0);results.push({type:kind,id:r.id,title:String(title||kind).slice(0,180),snippet:snippet(body||title,terms),updatedAt:r.updatedAt||r.createdAt||'',score,...extra});};
  for(const [collection,keys]of Object.entries(fields)){
   if(type!=='all'&&type!==collection)continue;
   for(const r of store.list(collection)){
    if(r.deletedAt||['Trashed','Deleted'].includes(r.status))continue;
    const raw=keys.map(k=>Array.isArray(r[k])?r[k].join(' '):r[k]||'').join(' '),body=collection==='messages'?readable(raw):collection==='clientReports'?[r.content?.client?.name,raw].join(' '):raw;
    const title=r.title||r.name||r.subject||(collection==='clientReports'&&r.content?.client?.name+' · '+r.start+' – '+r.end)||(collection==='messages'?(r.role==='user'?'You: ':'Assistant: ')+readable(r.content||'').slice(0,90):collection);
    if(collection==='messages'&&!store.get('conversations',r.conversationId))continue;
    add(collection,r,title,body,{clientId:r.clientId||'',projectId:r.projectId||'',conversationId:r.conversationId||'',engine:r.engine||'',status:r.status||'',...(collection==='messages'?{messageId:r.id}:{})});
   }
  }
  if(type==='all'||type==='files'){
   for(const f of store.list('chatFiles')){let text='';try{if(f.textLength)text=files.read(f.id,0,32000).text;}catch{}add('files',f,f.relativePath||f.name,text,{fileType:'chat',fileKind:f.kind});}
   for(const [collection,fileType]of [['media','media'],['attachments','email']])for(const f of store.list(collection))add('files',f,f.name,[f.name,f.role,f.contentType].join(' '),{fileType});
  }
  if(type==='all'||type==='memory')for(const projectId of ['',...store.list('projects').map(p=>p.id)])for(const filename of memoryFiles){try{const f=memory.read(filename,projectId);add('memory',{id:(projectId||'workspace')+':'+filename},filename,f.content,{filename,projectId});}catch{}}
  results.sort((a,b)=>b.score-a.score||String(b.updatedAt).localeCompare(String(a.updatedAt))||a.id.localeCompare(b.id));
  return {query:query.trim(),items:results.slice(offset,offset+limit),total:results.length,offset,hasMore:offset+limit<results.length,scope:'Saved local records and extracted file text; external accounts are searched only after syncing. File text is searched through the first 32,000 extracted characters.'};
 }
 return {query};
}
