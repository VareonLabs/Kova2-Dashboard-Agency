import { mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, renameSync, realpathSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const memoryFiles=['PROJECT.md','INSTRUCTIONS.md','MEMORY.md','BRAND.md','DECISIONS.md'];
const digest=text=>createHash('sha256').update(text).digest('hex');
export function createMemory(store,directory) {
  const root=resolve(directory,'assistant');mkdirSync(root,{recursive:true,mode:0o700});
  const canonicalRoot=realpathSync(root);
  function folder(projectId='') {
    if(!projectId)return root;
    if(!/^[a-f0-9-]{36}$/i.test(projectId)||!store.get('projects',projectId))throw new Error('Choose an existing project');
    const path=resolve(root,'projects',projectId);mkdirSync(path,{recursive:true,mode:0o700});
    if(!realpathSync(path).startsWith(canonicalRoot+sep))throw new Error('Memory folders cannot point outside this workspace');
    return path;
  }
  function filePath(filename,projectId='') {
    if(!memoryFiles.includes(filename))throw new Error('Choose an authorised Markdown memory file');
    const file=resolve(folder(projectId),filename);
    if(existsSync(file)&&lstatSync(file).isSymbolicLink())throw new Error('Memory files cannot be symbolic links');
    return file;
  }
  function initial(filename,projectId) {
    const project=projectId?store.get('projects',projectId):null;
    if(filename==='PROJECT.md')return project?`# ${project.name}\n\n${project.description||'Add the project brief, goals, deliverables and useful background here.'}\n`:'# VareonHQ business workspace\n\nBusiness email: hello@vareonhq.com\nTimezone: Australia/Brisbane (AEST)\n\nThis is the owner’s private business app on their Mac. Clients, projects, contracts, marketing drafts, tasks, notes and automations are shared with the assistant through dashboard tools.\n';
    if(filename==='INSTRUCTIONS.md')return '# How to work with me\n\n- Take action when I ask for something. Use dashboard tools, and show the work live.\n- When creating or editing content, open the relevant form first, fill it visibly, then save it.\n- Use Australian English. Interpret dates in Brisbane time.\n- Read the relevant records and notes before making assumptions.\n- Remember durable preferences and decisions in the appropriate Markdown file.\n- Keep me informed of real results and any connection that is still needed.\n';
    if(filename==='BRAND.md')return '# VareonHQ brand\n\n- Official logo: use the supplied VareonHQ lockup and icon.\n- Theme: neutral charcoal with official bright lime #C6F432.\n- No purple. Never use the rejected sage, olive or cream palette. Bright VareonHQ lime is approved.\n- Business tone: clear, direct and practical. Avoid invented claims and results.\n';
    if(filename==='DECISIONS.md')return '# Decisions\n\n- Business records and this assistant’s memory are saved locally on the Mac.\n- Marketing, contracts, projects and To do use Kanban boards.\n- The notepad is shared with GPT and Codex.\n- Assistant changes should be visible live in the app.\n';
    return '# Persistent memory\n\nRecord useful facts, owner preferences and decisions here. Keep entries factual, current and concise. The assistant reads this file again for every conversation.\n';
  }
  function read(filename,projectId='') {
    const file=filePath(filename,projectId);if(!existsSync(file))writeFileSync(file,initial(filename,projectId),{encoding:'utf8',mode:0o600,flag:'wx'});
    const content=readFileSync(file,'utf8');if(content.length>100000)throw new Error('This memory file is too large. Shorten it to under 100,000 characters.');
    return {filename,projectId,content,revision:digest(content)};
  }
  function list(projectId=''){return memoryFiles.map(filename=>{const{content,...meta}=read(filename,projectId);return {...meta,characters:content.length};});}
  function write(filename,content,projectId='',expectedRevision,actor='You') {
    if(typeof content!=='string'||content.length>40000)throw new Error('Keep each memory file under 40,000 characters');
    const prior=read(filename,projectId);if(expectedRevision!==prior.revision)throw new Error('This memory file changed. Reload it before saving so no edits are lost.');
    const file=filePath(filename,projectId),temporary=resolve(dirname(file),`.${randomUUID()}.tmp`);
    writeFileSync(temporary,content,{encoding:'utf8',mode:0o600,flag:'wx'});renameSync(temporary,file);
    store.put('memoryHistory',{filename,projectId,content:prior.content,revision:prior.revision,actor});
    store.log(`Updated ${projectId?store.get('projects',projectId).name+' / ':''}${filename}`,actor);
    return read(filename,projectId);
  }
  function context(projectId='') {
    const sections=[...memoryFiles.map(filename=>{const file=read(filename);return `Workspace / ${filename}\n${file.content.slice(0,16000)}`;})];
    if(projectId){const project=store.get('projects',projectId);if(!project)throw new Error('The selected project no longer exists');sections.push(`Current project record\n${JSON.stringify(project)}`);for(const filename of memoryFiles){const file=read(filename,projectId);sections.push(`Project / ${filename}\n${file.content.slice(0,16000)}`);}}
    return sections.join('\n\n---\n\n');
  }
  for(const filename of memoryFiles)read(filename);
  return {root,list,read,write,context};
}
