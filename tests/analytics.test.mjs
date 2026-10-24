import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {createGoogleAnalytics} from '../server/google-analytics.mjs';
import {analysePage,publicAddress,fetchPublicPage} from '../server/site-audit.mjs';
import {createAnalytics} from '../server/analytics.mjs';
import {saveRecord,deleteRecord} from '../server/domain.mjs';
const config={installed:{client_id:'123-example.apps.googleusercontent.com',client_secret:'synthetic-only'}};
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-analytics-test-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});let secret='';return {store,deps:{readSecret:async()=>secret,writeSecret:async(_,value)=>secret=value,deleteSecret:async()=>secret='',now:()=>Date.parse('2026-10-21T02:00:00Z')},secret:()=>secret};}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('Google desktop OAuth verifies one-use state and PKCE; credentials stay out of settings',async t=>{
 const f=fixture(t);let body;
 const google=createGoogleAnalytics(f.store,4320,{...f.deps,fetch:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');body=options.body;return json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly'});}});
 await google.configure(config);const {url}=await google.authorize(),auth=new URL(url),state=auth.searchParams.get('state');
 assert.equal(auth.origin,'https://accounts.google.com');assert.equal(auth.searchParams.get('redirect_uri'),'http://127.0.0.1:4320/auth/google/callback');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
 await assert.rejects(google.callback({state:'wrong',code:'x'}),/verified/);await google.callback({state,code:'synthetic-code'});assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));await assert.rejects(google.callback({state,code:'replay'}),/verified/);
 assert.equal(f.store.settings().googleAnalyticsConnected,true);assert.ok(!JSON.stringify(f.store.settings()).includes('synthetic'));assert.ok(f.secret().includes('synthetic-refresh'));
 await google.disconnect();assert.equal(f.secret(),'');assert.equal(f.store.settings().googleAnalyticsConnected,false);
});
test('Google partial consent is rejected and expired states cannot be exchanged',async t=>{
 const f=fixture(t);let clock=f.deps.now(),calls=0;const google=createGoogleAnalytics(f.store,4317,{...f.deps,now:()=>clock,fetch:async()=>{calls++;return json({access_token:'x',scope:'https://www.googleapis.com/auth/analytics.readonly'});}});await google.configure(config);let url=new URL((await google.authorize()).url);await assert.rejects(google.callback({state:url.searchParams.get('state'),code:'x'}),/both Analytics/);assert.equal(f.store.settings().googleAnalyticsConnected,false);url=new URL((await google.authorize()).url);clock+=600001;await assert.rejects(google.callback({state:url.searchParams.get('state'),code:'x'}),/expired/);assert.equal(calls,1);
});
test('concurrent reports share refresh, use final Search Console dates, and preserve provider failures',async t=>{
 const f=fixture(t);await f.deps.writeSecret('',JSON.stringify({clientId:config.installed.client_id,clientSecret:'synthetic',refreshToken:'synthetic-refresh',expiresAt:0}));let refreshes=0;const requests=[];
 const google=createGoogleAnalytics(f.store,4317,{...f.deps,fetch:async(url,options)=>{if(url.includes('/token')){refreshes++;await new Promise(r=>setTimeout(r,5));return json({access_token:'fresh',expires_in:3600});}requests.push({url,body:JSON.parse(options.body)});assert.equal(options.headers.Authorization,'Bearer fresh');if(url.includes('webmasters'))return json({error:{message:'Property access denied'}},403);const body=JSON.parse(options.body);return json({rows:body.dimensions?[{dimensionValues:[{value:'20261020'}],metricValues:[{value:'12'}]}]:[{metricValues:['5','12','20','0.5','2'].map(value=>({value}))}],metadata:{timeZone:'Australia/Brisbane',subjectToThresholding:true}});}});
 const report=await google.report({id:'v',ga4PropertyId:'123',searchConsoleSite:'sc-domain:vareonhq.com'},28);assert.equal(refreshes,1);assert.equal(report.analytics.totals.sessions,12);assert.equal(report.analytics.totals.engagementRate,.5);assert.equal(report.analytics.quality.thresholded,true);assert.equal(report.search.status,'error');assert.match(report.search.error,/access denied/);const gsc=requests.find(r=>r.url.includes('webmasters'));assert.equal(gsc.body.endDate,'2026-10-19');assert.equal(gsc.body.startDate,'2026-09-22');assert.equal(gsc.body.dataState,'final');assert.ok(requests.every(r=>!r.url.includes('synthetic')));
 await assert.rejects(google.report({},99),/7, 28 or 90/);
});
test('public audit blocks loopback, private, metadata, mapped and rebinding DNS destinations',async()=>{
 for(const address of ['127.0.0.1','10.0.0.5','169.254.169.254','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://127.0.0.1/','http://[::1]/','http://localhost/','https://example.com:4317/','file:///etc/passwd','https://user:pass@example.com/'])await assert.rejects(fetchPublicPage(url));
});
test('audit scoring exposes evidence, ignores scripted content, and treats decorative alt correctly',()=>{
 const html=`<html lang="en-AU"><head><title>Example business</title><meta name="description" content="Useful description"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Business services</h1><h2>What we do</h2><p>${'Useful content '.repeat(90)}</p><h2>How it works</h2><p>More practical information.</p><img alt="" src="x"><a href="/contact">Contact</a><script>fake words fake words</script><script type="application/ld+json">{invalid}</script></body></html>`;
 const audit=analysePage({url:'https://example.com/',status:200,headers:{'content-type':'text/html'},html});assert.equal(audit.scores.seo,100);assert.equal(audit.scores.aeo,100);assert.equal(audit.structuredData.invalid,1);assert.match(audit.methodology,/not measured AI visibility/);
 const blocked=analysePage({url:'https://example.com/',status:200,headers:{'content-type':'text/html','x-robots-tag':'noindex'},html:html.replace('alt=""','')});assert.equal(blocked.scores.seo,80);assert.equal(blocked.checks.find(c=>c.key==='noindex').passed,false);assert.equal(blocked.checks.find(c=>c.key==='alt').passed,false);
});
test('website records separate clients; audits persist and deduplicate; linked clients are protected',async t=>{
 const f=fixture(t);let calls=0;const service=createAnalytics(f.store,4317,{...f.deps,fetchPage:async url=>{calls++;return {url,status:200,headers:{'content-type':'text/html'},html:'<title>Client</title><h1>Client</h1>'};}});assert.equal(f.store.list('websites')[0].name,'VareonHQ');const client=saveRecord(f.store,'clients',{name:'Example'}),site=saveRecord(f.store,'websites',{name:'Client site',url:'https://example.com/',clientId:client.id});assert.throws(()=>deleteRecord(f.store,'clients',client.id),/linked/);assert.throws(()=>saveRecord(f.store,'websites',{name:'bad',url:'https://example.com',ga4PropertyId:'G-123'}));const [a,b]=await Promise.all([service.audit(site.id),service.audit(site.id)]);assert.equal(a.id,b.id);assert.equal(calls,1);assert.equal(service.state().audits[0].websiteId,site.id);assert.equal(f.store.list('websiteAudits').length,1);
});
