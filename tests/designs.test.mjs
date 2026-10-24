import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,approveDesignRevision,snapshot} from '../server/domain.mjs';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-design-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}

test('design reference approval records immutable revisions and keeps edits pending',t=>{
  const store=fixture(t),project=saveRecord(store,'projects',{name:'Site'});
  const design=saveRecord(store,'designs',{projectId:project.id,title:'Homepage',figmaUrl:'https://www.figma.com/design/Abc12345/Homepage',notes:'First review'});
  assert.throws(()=>approveDesignRevision(store,design.id,{},'Claude'),/Only the owner/);
  const first=approveDesignRevision(store,design.id);
  assert.equal(first.number,1);
  assert.equal(first.reference.notes,'First review');
  assert.throws(()=>approveDesignRevision(store,design.id),/Nothing has changed/);
  saveRecord(store,'designs',{notes:'Second review'},design.id);
  assert.equal(store.get('designRevisions',first.id).reference.notes,'First review');
  assert.throws(()=>approveDesignRevision(store,design.id),/Explain why/);
  const second=approveDesignRevision(store,design.id,{reason:'Review changes'});
  assert.equal(second.number,2);
  assert.equal(snapshot(store).designRevisions.length,2);
  assert.throws(()=>deleteRecord(store,'designs',design.id),/approved revisions/);
  assert.throws(()=>deleteRecord(store,'projects',project.id),/linked records/);
});

test('designs require an existing project and a Figma file URL',t=>{
  const store=fixture(t),project=saveRecord(store,'projects',{name:'Site'});
  assert.throws(()=>saveRecord(store,'designs',{projectId:project.id,title:'Wrong',figmaUrl:'https://example.com/design/Abc12345'}));
  assert.throws(()=>saveRecord(store,'designs',{projectId:'missing',title:'Wrong',figmaUrl:'https://www.figma.com/design/Abc12345/Foo'}),/existing project/);
});
