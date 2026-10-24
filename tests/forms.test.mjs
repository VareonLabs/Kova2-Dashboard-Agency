import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,submitForm,snapshot} from '../server/domain.mjs';
import {checkAnswers,leadFrom} from '../public/forms.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-forms-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const FIELDS=[
  {id:'name',label:'Your name',type:'text',required:true},
  {id:'email',label:'Email',type:'email',required:true},
  {id:'budget',label:'Budget',type:'select',options:['Under $5k','$5k to $15k','Over $15k']},
  {id:'brief',label:'What do you need?',type:'textarea'},
  {id:'start',label:'Ideal start',type:'date'}
];
const intake=store=>saveRecord(store,'forms',{name:'Project enquiry',status:'Live',fields:FIELDS,createLead:true,leadMap:{name:'name',email:'email'},consentText:'Email me about services'});

test('answers are checked against the form’s own fields',()=>{
  const ok=checkAnswers(FIELDS,{name:' Dana ',email:'dana@x.com',budget:'Over $15k',extra:'dropped'});
  assert.deepEqual(ok.errors,[]);assert.equal(ok.answers.name,'Dana');assert.ok(!('extra' in ok.answers));
  assert.match(checkAnswers(FIELDS,{email:'dana@x.com'}).errors[0],/Your name is required/);
  assert.match(checkAnswers(FIELDS,{name:'D',email:'nope'}).errors[0],/valid email/);
  assert.match(checkAnswers(FIELDS,{name:'D',email:'d@x.com',budget:'Free'}).errors[0],/choose one/);
  assert.match(checkAnswers(FIELDS,{name:'D',email:'d@x.com',start:'31 Feb'}).errors[0],/valid date/);
});

test('form definitions are validated',t=>{
  const store=fixture(t);
  assert.throws(()=>saveRecord(store,'forms',{name:'Empty',status:'Live'}),/at least one field/);
  assert.throws(()=>saveRecord(store,'forms',{name:'Dupes',fields:[{id:'a',label:'A'},{id:'a',label:'B'}]}),/share an id/);
  assert.throws(()=>saveRecord(store,'forms',{name:'Pick',fields:[{id:'a',label:'A',type:'select'}]}),/at least one option/);
  assert.throws(()=>saveRecord(store,'forms',{name:'Lead',fields:[{id:'a',label:'A'}],createLead:true}),/holds the lead’s name/);
  assert.throws(()=>saveRecord(store,'forms',{name:'Map',fields:[{id:'a',label:'A'}],createLead:true,leadMap:{name:'zzz'}}),/does not exist/);
});

test('a live form takes a response, creates a lead and records consent',t=>{
  const store=fixture(t),form=intake(store);
  const r=submitForm(store,form.id,{answers:{name:'Dana Whitfield',email:'dana@whitfield.com',brief:'New site'},consent:true});
  assert.equal(r.title,'Project enquiry');
  assert.equal(r.fieldLabels.name,'Your name');
  assert.equal(r.consent,true);
  const prospect=store.get('prospects',r.prospectId);
  assert.equal(prospect.name,'Dana Whitfield');assert.equal(prospect.email,'dana@whitfield.com');
  assert.match(prospect.source,/Form: Project enquiry/);
  assert.match(prospect.notes,/What do you need\?: New site/);
  assert.match(prospect.notes,/Agreed to marketing email/);
  assert.equal(snapshot(store).formSubmissions.length,1);
  const noConsent=submitForm(store,form.id,{answers:{name:'Ben',email:'ben@x.com'}});
  assert.equal(noConsent.consent,false);assert.doesNotMatch(store.get('prospects',noConsent.prospectId).notes,/marketing/);
});

test('closed forms refuse responses, test mode saves nothing, responses are not editable',t=>{
  const store=fixture(t),form=intake(store);
  saveRecord(store,'forms',{status:'Closed'},form.id);
  assert.throws(()=>submitForm(store,form.id,{answers:{name:'D',email:'d@x.com'}}),/not taking responses/);
  const trial=submitForm(store,form.id,{answers:{name:'D',email:'d@x.com'}},'You',{test:true});
  assert.equal(trial.test,true);assert.equal(store.list('formSubmissions').length,0);assert.equal(store.list('prospects').length,0);
  saveRecord(store,'forms',{status:'Live'},form.id);
  const r=submitForm(store,form.id,{answers:{name:'D',email:'d@x.com'}});
  assert.throws(()=>saveRecord(store,'formSubmissions',{answers:{name:'X'}},r.id),/cannot be edited/);
  assert.equal(saveRecord(store,'formSubmissions',{handled:true},r.id).handled,true);
  assert.throws(()=>saveRecord(store,'formSubmissions',{formId:form.id,title:'x'}),/filling in a form/);
  assert.throws(()=>deleteRecord(store,'forms',form.id),/has responses/);
});

test('a response sets off form rules for the form’s client',t=>{
  const store=fixture(t),client=saveRecord(store,'clients',{name:'Harbour Co'});
  const form=saveRecord(store,'forms',{name:'Feedback',status:'Live',clientId:client.id,fields:[{id:'note',label:'Note'}]});
  saveRecord(store,'automationRules',{name:'Chase',enabled:true,trigger:'form.submitted',actions:[{type:'createSupportRequest',title:'Review {title} for {client}',priority:'Medium'}]});
  submitForm(store,form.id,{answers:{note:'Great'}});
  assert.equal(store.list('supportRequests')[0].title,'Review Feedback for Harbour Co');
  assert.equal(leadFrom({fields:[],leadMap:{}},{}).name,'');
});
