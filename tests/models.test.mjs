import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseModels } from '../server/models.mjs';
test('Codex model picker preserves supplied order, model identifiers, names and default while hiding hidden entries',()=>{
  assert.deepEqual(normaliseModels([{id:'ui-id',model:'model-one',displayName:'First model',isDefault:true},{model:'secret',hidden:true},{model:'model-two',description:'Second'}]),[{slug:'model-one',name:'First model',description:'',isDefault:true},{slug:'model-two',name:'model-two',description:'Second',isDefault:false}]);
});
