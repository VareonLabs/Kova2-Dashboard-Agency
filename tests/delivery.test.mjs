import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord} from '../server/domain.mjs';
import {createGitHub,checkEnvironment} from '../server/github.mjs';
import {createDelivery} from '../server/delivery.mjs';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
function fakeGitHub(routes,calls=[]){return async(url,options)=>{calls.push({url,auth:options?.headers?.Authorization||''});const path=String(url).replace('https://api.github.com','');for(const [pattern,body] of routes)if(path.startsWith(pattern))return typeof body==='function'?body(path):json(body);return json({message:'Not Found'},404);};}
function fixture(t,routes,extra={}){const dir=mkdtempSync('/private/tmp/vhq-del-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});const calls=[],deps={fetch:fakeGitHub(routes,calls),readSecret:async()=>extra.token||null,writeSecret:async()=>{},deleteSecret:async()=>{}},github=createGitHub(s,deps),delivery=createDelivery(s,github,{fetch:extra.siteFetch||deps.fetch});const p=saveRecord(s,'projects',{name:'Shop',workflow:'Software'});return {s,p,delivery,github,calls};}
const repoRoutes=[['/repos/acme/shop/branches/','{"name":"main"}'],['/repos/acme/shop/pulls/42/reviews',[{user:{login:'sam'},state:'CHANGES_REQUESTED',submitted_at:'2026-10-20T00:00:00Z'},{user:{login:'kim'},state:'APPROVED',submitted_at:'2026-10-21T00:00:00Z'}]],['/repos/acme/shop/pulls/42',{title:'Checkout form',html_url:'https://github.com/acme/shop/pull/42',state:'open',draft:false,merged_at:null,head:{sha:'abc1234def',ref:'feature/checkout'}}],['/repos/acme/shop/commits/abc1234def/check-runs',{check_runs:[{id:1,name:'tests',status:'completed',conclusion:'success',html_url:'u1'},{id:2,name:'lint',status:'completed',conclusion:'failure',html_url:'u2'},{id:3,name:'e2e',status:'in_progress'}]}],['/repos/acme/shop/commits/abc1234def/status',{statuses:[{id:9,context:'vercel',state:'success',target_url:'https://preview.example'}]}],['/repos/acme/shop/deployments/77/statuses',[{state:'success',environment_url:'https://shop.example'}]],['/repos/acme/shop/deployments',[{id:77,sha:'abc1234def',ref:'main',created_at:'2026-10-22T00:00:00Z'}]],['/repos/acme/shop',{full_name:'acme/shop',html_url:'https://github.com/acme/shop',default_branch:'main',private:false}]];

test('repositories verify against GitHub and private ones explain the token they need',async t=>{
  const {s,p,delivery}=fixture(t,repoRoutes),repo=saveRecord(s,'repositories',{projectId:p.id,owner:'acme',name:'shop'});
  const verified=await delivery.verifyRepository(repo.id);assert.equal(verified.fullName,'acme/shop');assert.equal(verified.verifiedBranch,'main');assert.ok(verified.verifiedAt);
  assert.equal(saveRecord(s,'repositories',{branch:'release'},repo.id).verifiedAt,'','changing the branch clears verification');
  assert.throws(()=>saveRecord(s,'repositories',{projectId:p.id,owner:'ACME',name:'Shop'}),/already linked/);
  const missing=saveRecord(s,'repositories',{projectId:p.id,owner:'acme',name:'secret'});
  await assert.rejects(delivery.verifyRepository(missing.id),/read-only token/);assert.match(s.get('repositories',missing.id).verifyError,/token/);
});

test('pull request sync records state, reviews and checks, and imports permanent evidence once',async t=>{
  const {s,p,delivery}=fixture(t,repoRoutes),repo=saveRecord(s,'repositories',{projectId:p.id,owner:'acme',name:'shop'}),task=saveRecord(s,'tasks',{title:'Checkout',projectId:p.id});
  assert.throws(()=>saveRecord(s,'ticketLinks',{taskId:task.id,repositoryId:repo.id,kind:'Pull request',ref:'abc'}),/pull request number/);
  const link=saveRecord(s,'ticketLinks',{taskId:task.id,repositoryId:repo.id,kind:'Pull request',ref:'#42'});assert.equal(link.ref,'42');
  const synced=await delivery.syncLink(link.id);assert.equal(synced.sync.state,'Open');assert.equal(synced.sync.checks.length,4);assert.deepEqual(synced.sync.reviews.map(r=>r.state).sort(),['Approved','Changes requested']);
  const first=delivery.importEvidence(link.id);assert.equal(first.created,5);assert.equal(first.pending,1);
  const evidence=s.list('ticketEvidence').filter(e=>e.taskId===task.id);
  assert.ok(evidence.every(e=>e.recordedBy==='GitHub'&&e.sourceProvider==='GitHub'));
  assert.deepEqual(evidence.filter(e=>e.kind==='Check').map(e=>e.title+':'+e.result).sort(),['lint:Failed','tests:Passed','vercel:Passed']);
  assert.ok(!evidence.some(e=>e.kind==='Review'&&e.result==='Passed'),'another reviewer’s approval is not the owner’s review');
  assert.equal(delivery.importEvidence(link.id).created,0,'importing again adds nothing');
  const forged=saveRecord(s,'ticketEvidence',{taskId:task.id,kind:'Check',title:'x',result:'Passed',sourceProvider:'GitHub',sourceId:'run:1:Passed'},undefined,'Claude');
  assert.equal(forged.sourceProvider,'','only the sync can mark evidence as coming from GitHub');
  assert.equal(saveRecord(s,'ticketLinks',{ref:'43'},link.id).sync,null,'changing the reference clears stale sync data');
  assert.throws(()=>deleteRecord(s,'repositories',repo.id),/Remove ticket links/);
});

test('environment checks record real health and whether the site can be embedded',async()=>{
  const ok=await checkEnvironment('https://site.example',{fetch:async()=>new Response('ok',{status:200,headers:{'x-frame-options':'DENY'}})});
  assert.equal(ok.status,'Healthy');assert.equal(ok.httpStatus,200);assert.equal(ok.embeddable,false);
  const down=await checkEnvironment('https://site.example',{fetch:async()=>new Response('no',{status:503})});assert.equal(down.status,'Down');
  const framed=await checkEnvironment('https://site.example',{fetch:async()=>new Response('ok',{status:200,headers:{'content-security-policy':"frame-ancestors *"}})});assert.equal(framed.embeddable,true);
  const unreachable=await checkEnvironment('https://site.example',{fetch:async()=>{throw new TypeError('fetch failed');}});assert.equal(unreachable.status,'Down');
  assert.equal((await checkEnvironment('ftp://x')).status,'Unknown');
});

test('a release needs owner approval and a verified, matching, healthy deployment to be released',async t=>{
  let health={status:503};const {s,p,delivery}=fixture(t,repoRoutes,{siteFetch:async url=>String(url).startsWith('https://api.github.com')?fakeGitHub(repoRoutes)(url):new Response('',{status:health.status})});
  const repo=saveRecord(s,'repositories',{projectId:p.id,owner:'acme',name:'shop'}),task=saveRecord(s,'tasks',{title:'Checkout',projectId:p.id});
  const env=saveRecord(s,'environments',{projectId:p.id,name:'Production',kind:'Production',url:'https://shop.example',repositoryId:repo.id,githubEnvironment:'Production'});
  assert.throws(()=>saveRecord(s,'releases',{projectId:p.id,name:'1.0',status:'Approved'}),/start as drafts/);
  const release=saveRecord(s,'releases',{projectId:p.id,name:'1.0',environmentId:env.id,ticketIds:[task.id],commit:'ABC1234'});
  assert.throws(()=>saveRecord(s,'releases',{status:'Approved'},release.id,'Claude'),/Only the owner can approve/);
  assert.throws(()=>saveRecord(s,'releases',{status:'Approved'},release.id),/changelog/);
  saveRecord(s,'releases',{changelog:'Card checkout'},release.id);
  assert.throws(()=>saveRecord(s,'releases',{status:'Approved'},release.id),/rollback reference/);
  saveRecord(s,'releases',{rollbackReference:'Redeploy v0.9 from Vercel'},release.id);
  const approved=saveRecord(s,'releases',{status:'Approved'},release.id);assert.equal(approved.approvedBy,'You');
  assert.throws(()=>saveRecord(s,'releases',{changelog:'Sneaky'},release.id),/Only draft releases can be edited/);
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id),/Check the environment after approval/);
  await delivery.checkEnvironment(env.id);
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id),/respond healthy/);
  health={status:200};await delivery.checkEnvironment(env.id);
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id),/Sync the environment’s deployment/);
  await delivery.syncDeployment(env.id);
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id,'Codex'),/Only the owner can mark a production release/);
  const released=saveRecord(s,'releases',{status:'Released'},release.id);assert.equal(released.verification.deployment.sha,'abc1234def');assert.equal(released.verification.health.status,'Healthy');
  assert.throws(()=>saveRecord(s,'releases',{status:'Failed'},release.id),/can’t go from Released to Failed/);
  assert.throws(()=>saveRecord(s,'releases',{status:'Rolled back'},release.id),/what happened/);
  assert.throws(()=>deleteRecord(s,'releases',release.id),/Only draft releases/);
  assert.throws(()=>deleteRecord(s,'tasks',task.id),/part of a release/);
  assert.throws(()=>deleteRecord(s,'environments',env.id),/Releases target/);
});

test('a mismatched or failed deployment cannot complete a release',async t=>{
  const routes=repoRoutes.map(([k,v])=>k==='/repos/acme/shop/deployments/77/statuses'?[k,[{state:'failure'}]]:[k,v]);
  const {s,p,delivery}=fixture(t,routes,{siteFetch:async url=>String(url).startsWith('https://api.github.com')?fakeGitHub(routes)(url):new Response('',{status:200})});
  const repo=saveRecord(s,'repositories',{projectId:p.id,owner:'acme',name:'shop'}),task=saveRecord(s,'tasks',{title:'T',projectId:p.id});
  const env=saveRecord(s,'environments',{projectId:p.id,name:'Staging',kind:'Staging',url:'https://staging.example',repositoryId:repo.id,githubEnvironment:'Staging'});
  const release=saveRecord(s,'releases',{projectId:p.id,name:'1.1',environmentId:env.id,ticketIds:[task.id],commit:'fff0000',changelog:'x'});
  saveRecord(s,'releases',{status:'Approved'},release.id);await delivery.checkEnvironment(env.id);await delivery.syncDeployment(env.id);
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id),/latest deployment for this environment failed/);
  assert.equal(saveRecord(s,'releases',{status:'Failed',notes:'Deploy failed on build step'},release.id).status,'Failed');
  assert.throws(()=>saveRecord(s,'releases',{status:'Released'},release.id),/can’t go from Failed to Released/);
});

test('the GitHub token is validated, sent only to GitHub and never stored in records',async t=>{
  let saved='';const dir=mkdtempSync('/private/tmp/vhq-tok-'),s=createStore(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});
  const calls=[],github=createGitHub(s,{fetch:fakeGitHub([['/user',{login:'owner'}]],calls),readSecret:async()=>saved||null,writeSecret:async(k,v)=>{saved=v;},deleteSecret:async()=>{saved='';}});
  await assert.rejects(github.saveToken('not a token!'),/Paste a GitHub token/);
  assert.deepEqual(await github.saveToken('github_pat_'+'x'.repeat(30)),{connected:true,login:'owner'});
  assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/')));assert.equal((await github.status()).login,'owner');
  assert.ok(!JSON.stringify(s.db.prepare('SELECT data FROM records').all()).includes('github_pat_'));
  await github.removeToken();assert.equal((await github.status()).connected,false);
});
