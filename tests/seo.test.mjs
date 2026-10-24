import test from 'node:test';
import assert from 'node:assert/strict';
import {analysePage,analyseSignals,blockedCrawlers,auditWebsite} from '../server/site-audit.mjs';
import {answerStats} from '../public/seo.js';

const ROBOTS_OPEN='User-agent: *\nDisallow: /admin\nSitemap: https://x.test/sitemap.xml\n';
const file=(body,status=200)=>({status,html:body,headers:{}});

test('robots.txt parsing finds fully blocked AI crawlers',()=>{
  assert.deepEqual(blockedCrawlers(ROBOTS_OPEN),[]);
  assert.deepEqual(blockedCrawlers('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n'),['GPTBot']);
  assert.ok(blockedCrawlers('User-agent: *\nDisallow: /\n').includes('ClaudeBot'));
  assert.deepEqual(blockedCrawlers('User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n').includes('ClaudeBot'),false);
  assert.deepEqual(blockedCrawlers('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n'),['GPTBot','CCBot']);
  assert.deepEqual(blockedCrawlers(''),[]);
});

test('site signals score what the site files and structured data say',()=>{
  const good=analyseSignals({robots:file(ROBOTS_OPEN),sitemap:file('<urlset></urlset>'),llms:file('# Site'),structuredTypes:['Organization','FAQPage']});
  assert.equal(good.score,100);
  const bare=analyseSignals({robots:null,sitemap:file('<html>Not found</html>',404),llms:null,structuredTypes:[]});
  assert.equal(bare.checks.find(c=>c.key==='crawlers').passed,true);
  assert.equal(bare.checks.find(c=>c.key==='robots').passed,false);
  assert.equal(bare.checks.find(c=>c.key==='sitemap').passed,false);
  assert.ok(bare.score<40);
  const blocked=analyseSignals({robots:file('User-agent: *\nDisallow: /\n'),structuredTypes:['LocalBusiness']});
  assert.equal(blocked.checks.find(c=>c.key==='crawlers').passed,false);
  assert.match(blocked.checks.find(c=>c.key==='crawlers').evidence,/GPTBot/);
  assert.equal(analyseSignals({structuredTypes:[],questionHeadings:2}).checks.find(c=>c.key==='faq').passed,true);
});

test('page analysis reports structured data types and question headings',()=>{
  const html='<html lang="en"><head><title>T</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["FAQPage","WebPage"]}]}</script></head><body><h1>Hi</h1><h2>What do you do?</h2><h2>How much is it?</h2><p>a</p></body></html>';
  const a=analysePage({url:'https://x.test/',status:200,headers:{'content-type':'text/html'},html});
  assert.deepEqual(a.structuredTypes.sort(),['FAQPage','Organization','WebPage']);
  assert.equal(a.questionHeadings,2);
});

test('an audit fetches the site files from the same origin and survives missing ones',async()=>{
  const seen=[];
  const fetchPage=async url=>{seen.push(url);if(url.endsWith('/robots.txt'))return file(ROBOTS_OPEN);if(url.endsWith('/llms.txt'))throw new Error('refused');return {url,status:200,headers:{'content-type':'text/html'},html:'<html lang="en"><head><title>T</title></head><body><h1>Hi</h1></body></html>'};};
  const audit=await auditWebsite({id:'w1',url:'https://x.test/home'},{fetchPage});
  assert.deepEqual(seen.slice(1).sort(),['https://x.test/llms.txt','https://x.test/robots.txt','https://x.test/sitemap.xml']);
  assert.equal(audit.websiteId,'w1');
  assert.equal(audit.signals.checks.find(c=>c.key==='llms').passed,false);
  assert.equal(audit.signals.checks.find(c=>c.key==='sitemap').passed,true);
});

test('answer checks turn into mention and link rates',()=>{
  const now=new Date('2026-10-24T02:00:00Z');
  const rows=[
    {websiteId:'a',engine:'ChatGPT',result:'Mentioned and linked',checkedOn:'2026-10-20',prompt:'best web agency brisbane'},
    {websiteId:'a',engine:'ChatGPT',result:'Not mentioned',checkedOn:'2026-10-21',prompt:'who builds shopify sites'},
    {websiteId:'a',engine:'Claude',result:'Mentioned',checkedOn:'2026-10-22',prompt:'best web agency brisbane'},
    {websiteId:'a',engine:'Claude',result:'Not mentioned',checkedOn:'2026-05-01',prompt:'old'},
    {websiteId:'b',engine:'ChatGPT',result:'Mentioned',checkedOn:'2026-10-22',prompt:'other site'}
  ];
  const s=answerStats(rows,'a',now);
  assert.equal(s.total,3);assert.equal(s.mentionRate,67);assert.equal(s.linkRate,33);
  assert.deepEqual(s.byEngine.map(e=>[e.engine,e.checks,e.mentionRate]),[['ChatGPT',2,50],['Claude',1,100]]);
  assert.equal(answerStats([],'a',now).mentionRate,null);
});

test('answer checks belong to a real website and need a question and a date',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {createStore}=await import('../server/store.mjs');const {saveRecord,snapshot}=await import('../server/domain.mjs');
  const dir=mkdtempSync(join(tmpdir(),'vareon-seo-')),store=createStore(dir);
  try{
    const site=saveRecord(store,'websites',{name:'Harbour',url:'https://harbour.test/'});
    assert.throws(()=>saveRecord(store,'answerChecks',{websiteId:'nope',prompt:'q',checkedOn:'2026-10-20'}),/existing website/);
    assert.throws(()=>saveRecord(store,'answerChecks',{websiteId:site.id,prompt:'',checkedOn:'2026-10-20'}),/question/);
    assert.throws(()=>saveRecord(store,'answerChecks',{websiteId:site.id,prompt:'q',checkedOn:'31 Oct'}),/date/);
    const c=saveRecord(store,'answerChecks',{websiteId:site.id,prompt:'best web agency brisbane',engine:'Perplexity',checkedOn:'2026-10-20',result:'Mentioned'});
    assert.equal(c.engine,'Perplexity');assert.equal(snapshot(store).answerChecks.length,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
