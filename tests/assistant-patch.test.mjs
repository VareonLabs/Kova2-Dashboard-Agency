import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {createActions} from '../server/actions.mjs';
import {saveRecord} from '../server/domain.mjs';

function fixture(t){const dir=mkdtempSync('/private/tmp/vhq-patch-'),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,actions:createActions(store)};}

test('assistant updates change only the fields they supply',async t=>{
  const {store,actions}=fixture(t),p=saveRecord(store,'projects',{name:'Site'}),file=store.put('chatFiles',{id:'11111111-1111-4111-8111-111111111111',name:'brief.pdf',size:1,kind:'pdf'});
  const dep=saveRecord(store,'tasks',{title:'Dependency',projectId:p.id});
  const ticket=saveRecord(store,'tasks',{title:'Build',projectId:p.id,priority:'High',status:'In progress',notes:'Keep me',acceptanceCriteria:'Loads in 2s',dependencyIds:[dep.id],attachmentIds:[file.id]});
  const updated=await actions.execute('save_tasks',{id:ticket.id,record:{title:'Build homepage'}},'Claude');
  assert.equal(updated.title,'Build homepage');
  for(const key of ['priority','status','notes','acceptanceCriteria','projectId','ticketKey'])assert.equal(updated[key],ticket[key],key);
  assert.deepEqual(updated.dependencyIds,[dep.id]);assert.deepEqual(updated.attachmentIds,[file.id]);
});

test('assistant creates still get schema defaults and required-field validation',async t=>{
  const {store,actions}=fixture(t);
  const created=await actions.execute('save_tasks',{record:{title:'New ticket'}},'GPT');
  assert.equal(created.status,'To do');assert.equal(created.priority,'Medium');assert.deepEqual(created.dependencyIds,[]);
  await assert.rejects(actions.execute('save_tasks',{record:{priority:'High'}},'GPT'));
  await assert.rejects(actions.execute('save_tasks',{record:{title:'Bad',priority:'Urgent'}},'GPT'));
  const client=await actions.execute('save_clients',{record:{name:'Acme'}},'GPT');
  const renamed=await actions.execute('save_clients',{id:client.id,record:{phone:'0400 000 000'}},'GPT');
  assert.equal(renamed.name,'Acme');assert.equal(renamed.status,client.status);
});

test('tool descriptors no longer advertise defaults that would overwrite saved values',()=>{
  const {actions}=fixture({after(){}}),tool=actions.descriptors().find(d=>d.name==='save_tasks');
  const record=tool.parameters.properties.record;
  assert.ok(!record.required?.length);assert.ok(!JSON.stringify(record).includes('"default"'));
});

test('Claude and Codex MCP updates also keep omitted fields',async t=>{
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const dir=mkdtempSync('/private/tmp/vhq-mcp-patch-');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let store=createStore(dir);const p=saveRecord(store,'projects',{name:'Site'}),dep=saveRecord(store,'tasks',{title:'Dependency',projectId:p.id}),ticket=saveRecord(store,'tasks',{title:'Build',projectId:p.id,priority:'High',notes:'Keep me',dependencyIds:[dep.id]});store.close();
  const client=new Client({name:'patch-test',version:'1.0.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[new URL('../server/mcp-stdio.mjs',import.meta.url).pathname],env:{...process.env,VAREON_DATA_DIR:dir,VAREON_ACTOR:'Claude'}}));
  try{const result=await client.callTool({name:'save_tasks',arguments:{id:ticket.id,record:{title:'Build homepage'}}});assert.ok(!result.isError,JSON.stringify(result.content));}finally{await client.close();}
  store=createStore(dir);const saved=store.get('tasks',ticket.id);store.close();
  assert.equal(saved.title,'Build homepage');assert.equal(saved.priority,'High');assert.equal(saved.notes,'Keep me');assert.deepEqual(saved.dependencyIds,[dep.id]);
});
