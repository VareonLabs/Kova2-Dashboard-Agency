import test from 'node:test';
import assert from 'node:assert/strict';
import {runPrompt} from '../server/delivery-runs.mjs';

const run={id:'r1',projectId:'p1',goal:'Trial run. Do not start any ticket. Stop once the plan is ready.'};

test('an approved plan tells the assistant a plan-only goal no longer applies',()=>{
  assert.match(runPrompt(run,true,true),/approved the plan and chosen to start building/);
  assert.match(runPrompt(run,true,true),/no longer applies/);
});

test('before approval the goal is left as the owner wrote it',()=>{
  assert.doesNotMatch(runPrompt(run,false,false),/chosen to start building/);
  assert.match(runPrompt(run,false,false),/Do not start any ticket/);
});
