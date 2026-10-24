import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailSync,MAIL_SYNC_INTERVAL} from '../server/mail-sync.mjs';

function fixture(sync){
 let clock=100000,callback,cancelled=false;
 const settings={outlookConnected:true},events=[];
 const store={settings:()=>({...settings}),setting:(key,value)=>settings[key]=value,get:(_,id)=>id==='inbox-id'?{isInbox:true}:null,emit:(type,data)=>events.push({type,...data})};
 const controller=createMailSync(store,{sync},{now:()=>clock,every:(fn,ms)=>{assert.equal(ms,30000);callback=fn;return {unref(){}};},cancel:()=>cancelled=true});
 return {controller,settings,events,advance:ms=>clock+=ms,tick:()=>callback(),cancelled:()=>cancelled};
}
test('Outlook sync runs on startup, at 30 minutes, and catches up after sleep without a burst',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {count:3};});f.controller.start();await f.controller.idle();assert.equal(calls,1);assert.equal(f.settings.outlookAutoSyncMinutes,30);assert.equal(f.settings.outlookSyncing,false);
 await f.controller.automatic('load');assert.equal(calls,1,'the window load shares the startup sync');f.advance(MAIL_SYNC_INTERVAL-1);f.tick();await f.controller.idle();assert.equal(calls,1);
 f.advance(1);f.tick();await f.controller.idle();assert.equal(calls,2);f.advance(5*MAIL_SYNC_INTERVAL);f.tick();await f.controller.idle();assert.equal(calls,3);f.tick();await f.controller.idle();assert.equal(calls,3);assert.equal(f.events.filter(e=>e.status==='complete').length,3);
 f.controller.stop();assert.equal(f.cancelled(),true);f.advance(MAIL_SYNC_INTERVAL);f.tick();await f.controller.idle();assert.equal(calls,3);
});
test('manual, load and timer syncs share the same inbox operation and serialize other folders',async()=>{
 const calls=[];let finish;
 const f=fixture(folder=>{calls.push(folder);return calls.length===1?new Promise(resolve=>finish=resolve):Promise.resolve({count:1});});
 const first=f.controller.automatic('load'),duplicate=f.controller.sync('inbox-id'),archive=f.controller.sync('archive');assert.equal(first,duplicate);await Promise.resolve();assert.deepEqual(calls,['']);assert.equal(f.settings.outlookSyncing,true);finish({count:4});await Promise.all([first,duplicate,archive]);assert.deepEqual(calls,['','archive']);assert.equal(f.settings.outlookSyncing,false);
});
test('failed sync keeps the timer alive, records the error, and recovers at the next interval',async()=>{
 let calls=0;const f=fixture(async()=>{if(++calls===1)throw new Error('Mailbox offline');return {count:2};});f.controller.start();await f.controller.idle();assert.equal(f.settings.outlookSyncError,'Mailbox offline');assert.equal(f.settings.outlookSyncing,false);assert.ok(f.events.some(e=>e.status==='failed'));
 f.advance(MAIL_SYNC_INTERVAL);f.tick();await f.controller.idle();assert.equal(calls,2);assert.equal(f.settings.outlookSyncError,'');assert.ok(f.events.some(e=>e.status==='complete'));f.controller.stop();
});
test('disconnected Outlook is skipped; connecting and loading the app starts a sync',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {count:0};});f.settings.outlookConnected=false;f.controller.start();await f.controller.idle();assert.equal(calls,0);await assert.rejects(f.controller.sync(),/Connect Outlook/);f.settings.outlookConnected=true;await f.controller.automatic('load');assert.equal(calls,1);f.controller.stop();
});
