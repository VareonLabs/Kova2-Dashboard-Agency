import test from 'node:test';
import assert from 'node:assert/strict';
import {projectHealth} from '../server/portfolio.mjs';
const base={tasks:[],evidence:[],labour:0,expenses:[],activityAt:'2026-10-22T00:00:00Z',today:'2026-10-23'};
test('project health is rule-based and explains itself',()=>{
  const late=projectHealth({status:'Active',dueDate:'2026-10-20',budget:1000},{...base,tasks:[{id:'a',status:'To do'}]});
  assert.equal(late.health,'Off track');assert.match(late.reasons[0].text,/Past its due date by 3 days/);
  const costly=projectHealth({status:'Active',dueDate:'2026-12-01',budget:1000},{...base,labour:900});
  assert.equal(costly.health,'At risk');assert.match(costly.reasons[0].text,/90% of budget/);
  const failing=projectHealth({status:'Active',dueDate:'2026-12-01',budget:1000},{...base,tasks:[{id:'t',status:'In progress'}],evidence:[{taskId:'t',kind:'Check',title:'tests',result:'Failed',sequence:1}]});
  assert.ok(failing.reasons.some(r=>/failing check/.test(r.text)));
  const fine=projectHealth({status:'Active',dueDate:'2026-12-01',budget:1000},{...base,tasks:[{id:'t',status:'Done'}]});
  assert.equal(fine.health,'On track');
  assert.ok(projectHealth({status:'Active'},base).reasons.some(r=>r.level==='Note'&&/No due date/.test(r.text)));
});
