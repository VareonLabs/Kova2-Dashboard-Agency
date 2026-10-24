import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveProfile,defaultProfile} from '../server/profile.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-profile-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('business details save, trim and fall back to sensible defaults',t=>{
  const store=fixture(t);
  assert.equal(defaultProfile(store.settings()).accentColor,'#C6F432');
  const saved=saveProfile(store,{businessName:'  Vareon Labs ',abn:'12 345 678 901',website:'https://vareonhq.com',accentColor:'#1a1a1a'});
  assert.equal(saved.businessName,'Vareon Labs');
  assert.equal(store.settings().businessName,'Vareon Labs');
  assert.equal(defaultProfile(store.settings()).abn,'12 345 678 901');
});

test('bad details are refused with a plain message',t=>{
  const store=fixture(t);
  assert.throws(()=>saveProfile(store,{businessName:''}),/business name/i);
  assert.throws(()=>saveProfile(store,{abn:'123'}),/11 digits/);
  assert.throws(()=>saveProfile(store,{accentColor:'green'}),/six-digit/);
  assert.throws(()=>saveProfile(store,{website:'javascript:alert(1)'}));
  assert.throws(()=>saveProfile(store,{email:'nope'}));
});

test('only small PNG, JPEG or WebP logos are accepted',t=>{
  const store=fixture(t);
  assert.equal(saveProfile(store,{logo:PIXEL}).logo,PIXEL);
  assert.throws(()=>saveProfile(store,{logo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG, JPEG or WebP/);
  assert.throws(()=>saveProfile(store,{logo:'https://x.test/logo.png'}),/PNG, JPEG or WebP/);
  const big='data:image/png;base64,'+'A'.repeat(210000);
  assert.throws(()=>saveProfile(store,{logo:big}),/under 150 KB/);
});
