import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createLocalAuth} from '../server/local-auth.mjs';
import {defaultIndustryProfile} from '../server/industry-profile.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-auth-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,auth:createLocalAuth(store)};}
const SIGNUP={name:'CJ Perry',email:'Owner@Example.com',businessName:'Harbour Labs',password:'correct horse battery',confirmPassword:'correct horse battery',profile:defaultIndustryProfile()};

test('sign-up creates the single owner, signs them in, and stores no plain secrets',async t=>{
  const {store,auth}=fixture(t);
  assert.deepEqual(auth.status(''),{accountExists:false,authenticated:false,account:null});
  const result=await auth.signup(SIGNUP);
  assert.match(result.recoveryCode,/^VHQ-([0-9A-F]{4}-){7}[0-9A-F]{4}$/);
  assert.equal(result.account.email,'owner@example.com');
  assert.equal(auth.status(result.session.token).authenticated,true);
  const raw=JSON.stringify([...store.list('localAccounts'),...store.list('authSessions')]);
  assert.ok(!raw.includes(SIGNUP.password),'password must not be stored');
  assert.ok(!raw.includes(result.session.token),'session token must be stored only as a hash');
  assert.ok(!raw.includes(result.recoveryCode.replace(/-/g,'')),'recovery code must be stored only as a hash');
});

test('a second owner can never be created',async t=>{
  const {auth}=fixture(t);
  await auth.signup(SIGNUP);
  await assert.rejects(()=>auth.signup({...SIGNUP,email:'other@example.com'}),/already exists/);
});

test('sign-up checks name, email, business, password length and confirmation',async t=>{
  const {auth}=fixture(t);
  await assert.rejects(()=>auth.signup({...SIGNUP,name:'C'}),/Enter your name/);
  await assert.rejects(()=>auth.signup({...SIGNUP,email:'nope'}),/valid email/);
  await assert.rejects(()=>auth.signup({...SIGNUP,businessName:''}),/business name/);
  await assert.rejects(()=>auth.signup({...SIGNUP,password:'short',confirmPassword:'short'}),/between 10 and 128/);
  await assert.rejects(()=>auth.signup({...SIGNUP,confirmPassword:'different password'}),/do not match/);
  assert.equal(auth.status('').accountExists,false,'a failed sign-up leaves nothing behind');
});

test('login accepts the right password, refuses the wrong one, and logout ends the session',async t=>{
  const {auth}=fixture(t);
  await auth.signup(SIGNUP);
  await assert.rejects(()=>auth.login({email:'owner@example.com',password:'wrong password!'},'k1'),e=>e.status===401);
  await assert.rejects(()=>auth.login({email:'someone@else.com',password:SIGNUP.password},'k1'),e=>e.status===401);
  const {session}=await auth.login({email:' OWNER@example.com ',password:SIGNUP.password},'k1');
  assert.ok(auth.tokenAccount(session.token));
  auth.logout(session.token);
  assert.equal(auth.tokenAccount(session.token),null);
  assert.equal(auth.tokenAccount('not-a-token'),null);
  assert.equal(auth.tokenAccount('x'.repeat(500)),null);
});

test('five wrong passwords lock that caller out, and a correct one does not get past the lock',async t=>{
  const {auth}=fixture(t);
  await auth.signup(SIGNUP);
  for(let i=0;i<5;i++)await assert.rejects(()=>auth.login({email:'owner@example.com',password:'wrong password!'},'caller'),e=>e.status===401);
  await assert.rejects(()=>auth.login({email:'owner@example.com',password:SIGNUP.password},'caller'),e=>e.status===429);
  assert.ok((await auth.login({email:'owner@example.com',password:SIGNUP.password},'another caller')).session.token);
});

test('the recovery code resets the password once, signs everything else out, and the old password stops working',async t=>{
  const {auth}=fixture(t);
  const {recoveryCode,session}=await auth.signup(SIGNUP);
  await assert.rejects(()=>auth.reset({email:'owner@example.com',recoveryCode:'VHQ-0000-0000-0000-0000-0000-0000-0000-0000',password:'a brand new password',confirmPassword:'a brand new password'}),e=>e.status===401);
  const reset=await auth.reset({email:'owner@example.com',recoveryCode:recoveryCode.toLowerCase(),password:'a brand new password',confirmPassword:'a brand new password'});
  assert.equal(auth.tokenAccount(session.token),null,'old sessions end');
  assert.ok(auth.tokenAccount(reset.session.token));
  await assert.rejects(()=>auth.login({email:'owner@example.com',password:SIGNUP.password},'r1'),e=>e.status===401);
  assert.ok((await auth.login({email:'owner@example.com',password:'a brand new password'},'r2')).session.token);
});
