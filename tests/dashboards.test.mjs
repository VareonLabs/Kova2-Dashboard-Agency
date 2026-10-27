import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,snapshot} from '../server/domain.mjs';
import {METRICS,METRIC_KEYS,DEFAULT_WIDGETS,formatMetric,dashboardCashFlow} from '../public/dashboards.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-dash-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const NOW=new Date('2026-10-24T02:00:00Z');

test('dashboards only accept known figures, each once',t=>{
  const store=fixture(t);
  assert.throws(()=>saveRecord(store,'dashboards',{name:'Bad',widgets:['nope']}),/from the list/);
  assert.throws(()=>saveRecord(store,'dashboards',{name:'Twice',widgets:['openTickets','openTickets']}),/once/);
  const d=saveRecord(store,'dashboards',{name:'Mine',widgets:['openTickets']});
  assert.deepEqual(saveRecord(store,'dashboards',{widgets:['openTickets','winRate']},d.id).widgets,['openTickets','winRate']);
  assert.equal(snapshot(store).dashboards.length,1);
});

test('the default dashboard only uses figures that exist, and every figure computes on an empty workspace',()=>{
  for(const k of DEFAULT_WIDGETS)assert.ok(METRIC_KEYS.includes(k),k);
  for(const m of METRICS){const v=m.value({},NOW);assert.ok(v===null||typeof v==='number',m.key);}
});

test('figures read the records they describe',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'A',status:'Active'});
  saveRecord(store,'deals',{title:'D',clientId:client.id,value:1000,stage:'Negotiation'});
  saveRecord(store,'supportRequests',{title:'S',clientId:client.id,priority:'Urgent',reportedOn:'2026-10-20'});
  saveRecord(store,'retainers',{name:'R',clientId:client.id,monthlyAmount:250,startDate:'2026-10-01'});
  const data=snapshot(store),get=k=>METRICS.find(m=>m.key===k).value(data,NOW);
  assert.equal(get('activeClients'),1);
  assert.equal(get('openDealValue'),1000);
  assert.equal(get('weightedForecast'),750);
  assert.equal(get('openSupport'),1);
  assert.equal(get('overdueSupport'),1);
  assert.equal(get('retainerMonthly'),250);
  assert.equal(formatMetric(METRICS.find(m=>m.key==='winRate'),null,String),'–');
  assert.equal(formatMetric(METRICS.find(m=>m.key==='winRate'),67,String),'67%');
});

test('cash flow chart uses recorded payment and paid expense dates',()=>{
  const rows=dashboardCashFlow({payments:[{paidDate:'2026-09-12',amount:125},{paidDate:'2026-10-02',amount:75}],expenses:[{date:'2026-10-05',amount:30,paid:true},{date:'2026-10-06',amount:80,paid:false}]},2,NOW);
  assert.deepEqual(rows.map(r=>[r.key,r.received,r.costs]),[['2026-09',125,0],['2026-10',75,30]]);
});
