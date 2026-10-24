import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createStore} from '../server/store.mjs';
import {saveRecord} from '../server/domain.mjs';
import {coerce,parseArgs,table,matches} from '../cli/lib.mjs';

const CLI=resolve(import.meta.dirname,'../cli/vareon.mjs');
const run=(dir,...args)=>spawnSync(process.execPath,['--no-warnings',CLI,'--data',dir,...args],{encoding:'utf8'});
function workspace(t){const dir=mkdtempSync(join(tmpdir(),'vareon-cli-')),store=createStore(dir);const seed=(c,d)=>saveRecord(store,c,d);t.after(()=>{rmSync(dir,{recursive:true,force:true});});return {dir,store,seed};}

test('values are coerced sensibly and phone-style numbers stay text',()=>{
  assert.equal(coerce('12'),12);assert.equal(coerce('-1.5'),-1.5);assert.equal(coerce('true'),true);assert.equal(coerce('null'),null);
  assert.equal(coerce('0412'),'0412');assert.equal(coerce('007'),'007');assert.equal(coerce('hello world'),'hello world');
  assert.deepEqual(coerce('["a","b"]'),['a','b']);assert.equal(coerce('{bad'),'{bad');
});

test('arguments split into words, pairs and flags',()=>{
  const a=parseArgs(['add','clients','name=Ana Reyes','status=Active','--data','/x','--json']);
  assert.deepEqual(a.positional,['add','clients']);
  assert.deepEqual(a.pairs,{name:'Ana Reyes',status:'Active'});
  assert.equal(a.flags.data,'/x');assert.equal(a.flags.json,true);
  assert.equal(parseArgs(['add','clients','--json','{"name":"A"}']).flags.json,'{"name":"A"}');
  assert.throws(()=>parseArgs(['list','--limit']),/needs a value/);
});

test('tables align columns and filters match case-insensitively',()=>{
  const text=table([{n:'Ana',s:'Active'},{n:'Benedict',s:'Lead'}],[['NAME',r=>r.n],['STAGE',r=>r.s]]);
  assert.match(text,/^NAME {6}STAGE/);assert.equal(table([],[]),'(none)');
  assert.ok(matches({status:'Active'},{status:'active'}));assert.ok(!matches({status:'Lead'},{status:'active'}));
});

test('cli adds, lists, gets and updates through the app’s validation',t=>{
  const {dir,seed}=workspace(t);const client=seed('clients',{name:'Harbour Co'});
  let r=run(dir,'add','clients','name=Ana Reyes','status=Active');
  assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Created clients/);
  r=run(dir,'list','clients','status=Active');assert.match(r.stdout,/Ana Reyes/);assert.doesNotMatch(r.stdout,/Harbour Co/);
  r=run(dir,'set','clients',client.id.slice(0,8),'status=Active');assert.equal(r.status,0,r.stderr);
  r=run(dir,'get','clients',client.id);assert.equal(JSON.parse(r.stdout).status,'Active');
  r=run(dir,'list','clients','--json');assert.equal(JSON.parse(r.stdout).length,2);
  r=run(dir,'add','clients','--json','{"name":"Json Co"}');assert.equal(r.status,0,r.stderr);
});

test('cli refuses bad input, owner-only steps, unknown collections and missing data',t=>{
  const {dir,seed}=workspace(t);const client=seed('clients',{name:'Harbour Co'});
  let r=run(dir,'add','clients','status=Active');assert.notEqual(r.status,0);assert.match(r.stderr,/vareon:/);
  r=run(dir,'add','nonsense','name=x');assert.equal(r.status,2);assert.match(r.stderr,/unknown collection/);
  r=run(dir,'get','clients','zzzz');assert.equal(r.status,1);
  r=run(dir,'add','retainers','name=Care','clientId='+client.id,'monthlyAmount=250','startDate=2026-10-01');assert.equal(r.status,0,r.stderr);
  r=run(dir,'set','retainers','zzzz','invoicedMonths=["2026-10"]');assert.equal(r.status,1);
  r=run(dir,'list','retainers','--json');const care=JSON.parse(r.stdout)[0];
  r=run(dir,'set','retainers',care.id,'invoicedMonths=["2026-10"]');assert.equal(r.status,1);assert.match(r.stderr,/set by raising the invoice/);
  r=spawnSync(process.execPath,['--no-warnings',CLI,'--data',join(dir,'missing'),'list','clients'],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/no VareonHQ data/);
  r=run(dir,'status');assert.equal(r.status,0,r.stderr);
});
