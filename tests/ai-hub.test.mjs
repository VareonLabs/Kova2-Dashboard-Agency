import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createAIHub} from '../server/ai-hub.mjs';
import {hubSignals} from '../public/ai-hub.js';

test('AI briefing only keeps findings linked to saved records and takes no action',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'vareon-ai-hub-')),store=createStore(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const task=store.put('tasks',{title:'Check client launch',status:'To do',dueDate:'2026-10-24'});
  const hub=createAIHub(store,{gpt:async()=>JSON.stringify({roles:[{role:'Operations',findings:[{kind:'Current risk',title:'Launch task overdue',explanation:'The due date has passed.',evidenceIds:[task.id]},{kind:'Future risk',title:'Imagined risk',explanation:'No source.',evidenceIds:['invented']},{kind:'Trend',title:'Unproven trend',explanation:'Only one record.',evidenceIds:[task.id]}]}]})});
  const report=await hub.analyse();
  assert.equal(report.roles.length,8);
  assert.equal(report.roles.find(role=>role.role==='Operations').findings.length,1);
  assert.deepEqual(report.roles.find(role=>role.role==='Operations').findings[0].evidenceIds,[task.id]);
  assert.equal(store.list('tasks').length,1);assert.equal(store.list('approvals').length,0);
  assert.equal(store.list('aiHubReports').length,1);
});

test('current signals distinguish overdue work from future deadlines',()=>{
  const signals=hubSignals({tasks:[{status:'To do',dueDate:'2026-10-24'}],projects:[{status:'Active',dueDate:'2026-10-29'}]},new Date('2026-10-25T00:00:00Z'));
  assert(signals.some(s=>s.kind==='Risk'&&s.title.includes('overdue')));
  assert(signals.some(s=>s.kind==='Future risk'&&s.title.includes('deadline')));
});
