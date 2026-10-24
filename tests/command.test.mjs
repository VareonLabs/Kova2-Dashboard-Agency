import test from 'node:test';
import assert from 'node:assert/strict';
import {score} from '../public/command.js';

test('command menu matching prefers prefixes, then substrings, then in-order letters',()=>{
  assert.ok(score('Shop app','shop')>score('Webshop app','shop'));
  assert.ok(score('Webshop app','shop')>score('Sales help order page','shop'));
  assert.ok(score('T-4DF42891 Build homepage','t-4df')>0);
  assert.equal(score('Clients','zz'),0);
  assert.equal(score('anything',''),1);
});
