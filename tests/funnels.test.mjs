import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,submitForm,snapshot} from '../server/domain.mjs';

test('funnels persist ordered journey steps and only link saved forms',t=>{
  const dir=mkdtempSync(join(tmpdir(),'vareon-funnels-')),store=createStore(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const form=saveRecord(store,'forms',{name:'Enquiry',status:'Live',fields:[{id:'name',label:'Name'}]});
  const funnel=saveRecord(store,'funnels',{name:'New enquiries',goal:'Convert visitors to leads',steps:[{id:'landing',kind:'Landing page',name:'Service page',url:'https://example.com/service'},{id:'enquiry',kind:'Form',name:'Enquire',formId:form.id}]});
  assert.equal(snapshot(store).funnels[0].steps[1].formId,form.id);
  assert.deepEqual(funnel.steps.map(step=>step.kind),['Landing page','Form']);
  assert.throws(()=>saveRecord(store,'funnels',{name:'Broken',steps:[{id:'bad',kind:'Form',name:'Missing form',formId:'missing'}]}),/linked form no longer exists/);
});

test('a response opened from a funnel carries its source into the lead',t=>{
  const dir=mkdtempSync(join(tmpdir(),'vareon-funnel-response-')),store=createStore(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const form=saveRecord(store,'forms',{name:'Enquiry',status:'Live',createLead:true,leadMap:{name:'name'},fields:[{id:'name',label:'Name'}]});
  const funnel=saveRecord(store,'funnels',{name:'Service journey',steps:[{id:'form',kind:'Form',name:'Enquire',formId:form.id}]});
  const response=submitForm(store,form.id,{answers:{name:'Taylor'},funnelId:funnel.id});
  assert.equal(response.funnelId,funnel.id);
  assert.equal(store.get('prospects',response.prospectId).funnelId,funnel.id);
  assert.throws(()=>submitForm(store,form.id,{answers:{name:'Sam'},funnelId:'unrelated'}),/not linked to that funnel/);
});
