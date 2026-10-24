import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,approvePrdRevision,approveStandardRevision} from '../server/domain.mjs';
import {createActions} from '../server/actions.mjs';
import {createDeliveryRuns,approvePlan} from '../server/delivery-runs.mjs';
import {agencyStandard} from '../public/requirements.js';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(t,engine){
  const dir=mkdtempSync('/private/tmp/vhq-run-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});
  const p=saveRecord(s,'projects',{name:'Shop',workflow:'Software',description:'Online shop'}),prd=saveRecord(s,'documents',{title:'Checkout PRD',category:'PRD',projectId:p.id,body:'Pay quickly'});
  saveRecord(s,'requirements',{prdId:prd.id,title:'Pay by card',acceptanceCriteria:'Visa works'});saveRecord(s,'requirements',{prdId:prd.id,title:'Coupons'});approvePrdRevision(s,prd.id);
  saveRecord(s,'projectStandards',{projectId:p.id,...agencyStandard});approveStandardRevision(s,p.id);
  const actions=createActions(s),calls=[];
  const assistant={conversations:{create:(engine,projectId,title)=>s.put('conversations',{engine,projectId,title})},cancel(){calls.push('cancel');},async chat(prompt,engineName,options){calls.push({prompt,engineName,options});return engine?engine(actions,prompt):'ok';}};
  return {s,p,prd,actions,runs:createDeliveryRuns(s,assistant),calls};
}
const plan=[{ref:'epic',title:'Checkout',type:'Epic',requirementCodes:['REQ-001'],acceptanceCriteria:'Customer can pay'},{ref:'form',title:'Card form',type:'Story',requirementCodes:['REQ-001'],acceptanceCriteria:'Visa works',implementationPlan:'Build the form',parentRef:'epic'},{ref:'qa',title:'Payment QA',type:'Task',acceptanceCriteria:'All cards tested',implementationPlan:'Test matrix',parentRef:'epic',dependsOnRefs:['form']}];

test('a run reads approved scope, proposes a plan, and nothing is created until the owner approves',async t=>{
  const {s,p,runs,actions,calls}=fixture(t,async(actions,prompt)=>{const runId=/run ([0-9a-f-]{36})/.exec(prompt)[1];const ctx=await actions.execute('get_delivery_context',{projectId:/project ([0-9a-f-]{36})/.exec(prompt)[1],runId},'Claude');assert.equal(ctx.prds[0].approvedRevision.requirements.length,2);assert.equal(ctx.engineeringStandard.revision,1);await actions.execute('propose_delivery_plan',{runId,summary:'Card checkout',items:plan},'Claude');return 'planned';});
  assert.throws(()=>runs.start({projectId:saveRecord(s,'projects',{name:'Simple'}).id,engine:'Claude',goal:'x'}),/software workflow/);
  const run=runs.start({projectId:p.id,engine:'Claude',goal:'Card checkout'});await wait(30);
  assert.equal(calls[0].engineName,'Claude');assert.equal(calls[0].options.conversationId,run.conversationId);
  const current=s.get('deliveryRuns',run.id),proposal=s.get('deliveryPlans',current.planId);
  assert.equal(current.status,'Awaiting approval');assert.equal(proposal.status,'Proposed');assert.equal(proposal.proposedBy,'Claude');
  assert.equal(s.list('tasks').length,0,'no tickets before approval');
  assert.throws(()=>runs.start({projectId:p.id,engine:'GPT',goal:'Again'}),/already has an active delivery run/);
  assert.throws(()=>approvePlan(s,run.id,proposal.id,'Claude'),/Only the owner/);
  assert.ok(!actions.descriptors().some(d=>/approve/i.test(d.name)),'no assistant tool approves plans');
});

test('plans are validated: requirement codes, refs and cycles',async t=>{
  const {s,p,actions}=fixture(t),run=s.put('deliveryRuns',{projectId:p.id,engine:'GPT',goal:'x',status:'Planning',log:[]});
  const propose=items=>actions.execute('propose_delivery_plan',{runId:run.id,summary:'x',items},'GPT');
  await assert.rejects(propose([{ref:'a',title:'A',requirementCodes:['REQ-999']}]),/not an active requirement/);
  await assert.rejects(propose([{ref:'a',title:'A',dependsOnRefs:['b']}]),/not in this plan/);
  await assert.rejects(propose([{ref:'a',title:'A',dependsOnRefs:['b']},{ref:'b',title:'B',dependsOnRefs:['a']}]),/cycle/);
  await assert.rejects(propose([{ref:'a',title:'A'},{ref:'a',title:'B'}]),/unique/);
  const first=await propose([{ref:'a',title:'A'}]),second=await propose([{ref:'a',title:'A2'}]);
  assert.equal(s.get('deliveryPlans',first.planId).status,'Superseded');assert.equal(second.number,2);
});

test('approval creates tickets once, in dependency order, linked to requirements and the run',t=>{
  const {s,p,actions}=fixture(t),run=s.put('deliveryRuns',{projectId:p.id,engine:'Codex',goal:'x',status:'Planning',log:[]});
  return actions.execute('propose_delivery_plan',{runId:run.id,summary:'Checkout',items:plan},'Codex').then(({planId})=>{
    const result=approvePlan(s,run.id,planId);assert.equal(result.tickets.length,3);
    const tasks=s.list('tasks'),by=title=>tasks.find(t=>t.title===title);
    assert.equal(by('Card form').parentTaskId,by('Checkout').id);assert.deepEqual(by('Payment QA').dependencyIds,[by('Card form').id]);
    assert.equal(by('Card form').requirementIds.length,1);assert.ok(by('Card form').plannedRevisionId);assert.ok(tasks.every(t=>t.deliveryRunId===run.id));
    assert.equal(by('Card form').status,'Ready');assert.equal(by('Checkout').status,'Ready');
    approvePlan(s,run.id,planId);assert.equal(s.list('tasks').length,3,'approving again or resuming never duplicates tickets');
    assert.equal(s.get('deliveryRuns',run.id).status,'Running');
    return actions.execute('propose_delivery_plan',{runId:run.id,summary:'Other',items:plan},'Codex').then(()=>assert.fail('should refuse'),e=>assert.match(e.message,/already has an approved plan/));
  });
});

test('the run works one eligible ticket at a time through the normal gates and waits for the owner',async t=>{
  const {s,p,actions}=fixture(t),run=s.put('deliveryRuns',{projectId:p.id,engine:'GPT',goal:'x',status:'Planning',log:[]});
  const {planId}=await actions.execute('propose_delivery_plan',{runId:run.id,summary:'Checkout',items:plan},'GPT');approvePlan(s,run.id,planId);
  const by=title=>s.list('tasks').find(t=>t.title===title),outside=saveRecord(s,'tasks',{title:'Not in plan',projectId:p.id,acceptanceCriteria:'x',status:'Ready'});
  await assert.rejects(actions.execute('start_delivery_ticket',{runId:run.id,taskId:outside.id},'GPT'),/not part of this delivery run/);
  await assert.rejects(actions.execute('start_delivery_ticket',{runId:run.id,taskId:by('Payment QA').id},'GPT'),/dependencies done first/);
  await actions.execute('start_delivery_ticket',{runId:run.id,taskId:by('Card form').id},'GPT');
  await assert.rejects(actions.execute('start_delivery_ticket',{runId:run.id,taskId:by('Checkout').id},'GPT'),/implementation plan|one ticket at a time/);
  await assert.rejects(actions.execute('submit_delivery_ticket',{runId:run.id,taskId:by('Card form').id},'GPT'),/reviewable change/);
  await actions.execute('save_ticketEvidence',{record:{taskId:by('Card form').id,kind:'Change',title:'Form files',result:'Info',reference:'codex-workspace/checkout/form.html'}},'GPT');
  await actions.execute('save_ticketEvidence',{record:{taskId:by('Card form').id,kind:'Check',title:'HTML validation',result:'Passed'}},'GPT');
  const submitted=await actions.execute('submit_delivery_ticket',{runId:run.id,taskId:by('Card form').id},'GPT');assert.equal(submitted.status,'In review');
  assert.equal(s.get('deliveryRuns',run.id).status,'Awaiting review');
  await assert.rejects(actions.execute('move_card',{collection:'tasks',id:by('Card form').id,status:'QA / staging'},'GPT'),/your review approval/);
  await assert.rejects(actions.execute('start_delivery_ticket',{runId:run.id,taskId:by('Checkout').id},'GPT'),/waiting for the owner’s review/);
  await actions.execute('block_delivery_ticket',{runId:run.id,taskId:by('Checkout').id,reason:'Need payment provider account'},'GPT');
  assert.equal(by('Checkout').status,'Blocked');assert.equal(s.get('deliveryRuns',run.id).status,'Needs attention');
  assert.ok(s.get('deliveryRuns',run.id).log.some(l=>/Submitted/.test(l.text)));
});

test('resume continues the same conversation and cancel keeps the records',async t=>{
  const {s,p,runs,calls}=fixture(t),run=runs.start({projectId:p.id,engine:'Codex',goal:'Checkout'});await wait(20);
  const resumed=runs.resume(run.id);await wait(20);
  assert.equal(calls[1].options.conversationId,run.conversationId);assert.match(calls[1].prompt,/resumed run/);assert.equal(resumed.status,'Planning');
  const cancelled=runs.cancel(run.id);assert.equal(cancelled.status,'Cancelled');assert.throws(()=>runs.resume(run.id),/cancelled/);
  assert.ok(s.get('deliveryRuns',run.id).log.length>=3);
});

test('Claude and Codex get the same delivery tools over MCP, with no approval tool',async t=>{
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const dir=mkdtempSync('/private/tmp/vhq-run-mcp-');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let s=createStore(dir);const p=saveRecord(s,'projects',{name:'Shop',workflow:'Software'}),run=s.put('deliveryRuns',{projectId:p.id,engine:'Codex',goal:'x',status:'Planning',log:[]});s.close();
  const client=new Client({name:'run-test',version:'1.0.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[new URL('../server/mcp-stdio.mjs',import.meta.url).pathname],env:{...process.env,VAREON_DATA_DIR:dir,VAREON_ACTOR:'Codex'}}));
  try{
    const names=(await client.listTools()).tools.map(t=>t.name);
    for(const n of ['get_delivery_context','propose_delivery_plan','start_delivery_ticket','submit_delivery_ticket','block_delivery_ticket','report_delivery_progress'])assert.ok(names.includes(n),n);
    assert.ok(!names.some(n=>/approve/i.test(n)));
    const result=await client.callTool({name:'propose_delivery_plan',arguments:{runId:run.id,summary:'Plan',items:[{ref:'a',title:'Thing'}]}});assert.ok(!result.isError,JSON.stringify(result.content));
  }finally{await client.close();}
  s=createStore(dir);const proposal=s.list('deliveryPlans')[0];assert.equal(proposal.proposedBy,'Codex');assert.equal(s.list('tasks').length,0);s.close();
});
