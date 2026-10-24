import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,parseDay,num,mapAdRows,mapSocialRows,adReport,socialReport,AD_PLATFORMS,SOCIAL_PLATFORMS} from '../public/ads-social.js';

const GOOGLE=`Campaign report
1 October 2026 - 24 October 2026
Day,Campaign,Cost,Impr.,Clicks,Conversions,Conv. value
2026-10-20,Brand search,"$1,200.50","10,000",400,20,"4,000.00"
2026-10-21,Brand search,300,5000,100,5,900
2026-10-21,Retargeting,80,4000,40,1,150
Total: --,,"1,580.50","19,000",540,26,"5,050.00"`;
const META=`Reporting starts,Campaign name,Amount spent (AUD),Impressions,Link clicks,Results
20/10/2026,Lead gen,150.25,8000,160,12
21/10/2026,Lead gen,90,5000,70,6`;

test('csv handles quotes, commas, tabs and a byte-order mark',()=>{
  assert.deepEqual(parseCsv('﻿a,b\n"x, y","say ""hi"""\n'),[['a','b'],['x, y','say "hi"']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'),[['a','b'],['1','2']]);
  assert.deepEqual(parseCsv('a,b\r\n\r\n1,2\r\n'),[['a','b'],['1','2']]);
});

test('dates and numbers are read strictly',()=>{
  assert.equal(parseDay('2026-10-20'),'2026-10-20');assert.equal(parseDay('20/10/2026'),'2026-10-20');
  assert.equal(parseDay('31/02/2026'),'');assert.equal(parseDay('Oct 2026'),'');
  assert.equal(num('$1,200.50'),1200.5);assert.equal(num('--'),0);assert.equal(num('2.5%'),2.5);assert.ok(Number.isNaN(num('abc')));
});

test('a Google Ads export with title lines and a totals row is understood',()=>{
  const {records,skipped}=mapAdRows(GOOGLE);
  assert.equal(records.length,3);assert.equal(skipped,1);
  assert.deepEqual(records[0],{date:'2026-10-20',campaign:'Brand search',spend:1200.5,impressions:10000,clicks:400,conversions:20,revenue:4000});
});

test('a Meta export with Australian dates and a currency suffix is understood',()=>{
  const {records}=mapAdRows(META);
  assert.equal(records.length,2);assert.equal(records[0].date,'2026-10-20');assert.equal(records[0].spend,150.25);assert.equal(records[0].clicks,160);assert.equal(records[0].conversions,12);
});

test('an export without the needed columns is refused with a plain message',()=>{
  const r=mapAdRows('Name,Value\nA,1');
  assert.equal(r.records.length,0);assert.match(r.problems[0],/could not find the columns: date, spend/);
  assert.equal(mapAdRows('Day,Cost\n2026-10-20,abc').records.length,0);
});

test('ad reports total, rank campaigns and compute rates',()=>{
  const now=new Date('2026-10-24T02:00:00Z');
  const rows=mapAdRows(GOOGLE).records;
  const r=adReport(rows,28,now);
  assert.equal(r.totals.spend,1580.5);assert.equal(r.totals.clicks,540);
  assert.equal(r.byCampaign[0].campaign,'Brand search');
  assert.equal(r.totals.ctr,2.84);assert.equal(r.totals.cpc,2.93);assert.equal(r.totals.roas,3.2);
  assert.equal(adReport(rows,2,new Date('2026-12-24T00:00:00Z')).totals.spend,0);
  assert.equal(adReport([],28,now).totals.cpa,null);
});

test('social exports map followers, comments and reach, and growth is measured over the window',()=>{
  const csv='Date,Followers,Posts,Reactions,Comments,Shares,Reach\n2026-07-01,1000,4,50,5,2,2000\n2026-10-01,1100,6,80,10,4,3000\n2026-10-20,1150,5,70,8,2,2500';
  const {records}=mapSocialRows(csv);assert.equal(records.length,3);
  const r=socialReport(records,90,new Date('2026-10-24T02:00:00Z'));
  assert.equal(r.followers,1150);assert.equal(r.asOf,'2026-10-20');assert.equal(r.growth,150);assert.equal(r.growthPct,15);
  assert.equal(r.comments,18);assert.equal(r.posts,11);assert.equal(r.engagement,18+150+6);
  assert.equal(socialReport([],90).followers,null);
});

test('every platform lists what you need before it can be connected, with a source link',()=>{
  for(const set of [AD_PLATFORMS,SOCIAL_PLATFORMS])for(const p of Object.values(set)){assert.ok(p.needs.length>0);for(const [title,why,url] of p.needs){assert.ok(title&&why);assert.match(url,/^https:\/\//);}}
});

import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createStore} from '../server/store.mjs';import {saveRecord,deleteRecord} from '../server/domain.mjs';
import {importAdStats,adSummary,importSocialStats,socialSummary} from '../server/ads-social.mjs';
const withStore=async fn=>{const dir=mkdtempSync(join(tmpdir(),'vareon-ads-')),store=createStore(dir);try{await fn(store);}finally{store.close();rmSync(dir,{recursive:true,force:true});}};

test('accounts cannot be marked connected by hand, and need a real client and number',()=>withStore(store=>{
  assert.throws(()=>saveRecord(store,'adAccounts',{platform:'Google Ads',name:'Harbour',status:'Connected'}),/only when its sign-in succeeds/);
  assert.throws(()=>saveRecord(store,'adAccounts',{platform:'Meta Ads',name:'H',accountId:'abc'}),/account number/);
  assert.throws(()=>saveRecord(store,'adAccounts',{platform:'Meta Ads',name:'H',clientId:'zzz'}),/existing client/);
  assert.equal(saveRecord(store,'adAccounts',{platform:'Google Ads',name:'Harbour',accountId:'123-456-7890'}).status,'Not connected');
  assert.throws(()=>saveRecord(store,'socialAccounts',{platform:'Instagram',name:'H',status:'Connected'}),/only when its sign-in succeeds/);
}));

test('importing the same ad export twice updates rows instead of doubling them',()=>withStore(store=>{
  const acct=saveRecord(store,'adAccounts',{platform:'Google Ads',name:'Harbour'});
  const csv='Day,Campaign,Cost,Impressions,Clicks,Conversions\n2026-10-20,Brand,100,1000,50,5\n2026-10-21,Brand,200,2000,80,8';
  assert.equal(importAdStats(store,acct.id,csv).imported,2);
  assert.equal(importAdStats(store,acct.id,csv.replace('100,','150,')).imported,2);
  assert.equal(store.list('adStats').length,2);
  const r=adSummary(store,acct.id,28,new Date('2026-10-24T02:00:00Z'));
  assert.equal(r.totals.spend,350);assert.equal(r.rows,2);
  assert.throws(()=>importAdStats(store,acct.id,'Name\nx'),/could not find the columns/);
  assert.throws(()=>importAdStats(store,acct.id,''),/Choose a CSV/);
  assert.throws(()=>importAdStats(store,'nope','a'),/Account not found/);
}));

test('social figures import, report, and are removed with their account',()=>withStore(store=>{
  const acct=saveRecord(store,'socialAccounts',{platform:'Instagram',name:'@harbour'});
  importSocialStats(store,acct.id,'Date,Followers,Comments\n2026-10-01,1000,4\n2026-10-20,1100,9');
  const r=socialSummary(store,acct.id,90,new Date('2026-10-24T02:00:00Z'));
  assert.equal(r.followers,1100);assert.equal(r.comments,13);
  assert.throws(()=>importSocialStats(store,acct.id,'Date,Foo\n2026-10-01,3'),/No followers/);
  deleteRecord(store,'socialAccounts',acct.id);
  assert.equal(store.list('socialStats').length,0);
}));
