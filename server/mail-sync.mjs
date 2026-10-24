export const MAIL_SYNC_INTERVAL=30*60*1000;

export function createMailSync(store,outlook,{now=Date.now,every=setInterval,cancel=clearInterval}={}){
  let stopped=false,timer=null,lastAttempt=0,nextDue=now()+MAIL_SYNC_INTERVAL,tail=Promise.resolve();
  const pending=new Map();
  store.setting('outlookSyncing',false);
  store.setting('outlookAutoSyncMinutes',30);
  function sync(folderId='',reason='manual'){
    if(stopped)return Promise.resolve({skipped:true});
    if(!store.settings().outlookConnected)return reason==='manual'?Promise.reject(new Error('Connect Outlook before syncing.')):Promise.resolve({skipped:true});
    const key=folderId&&store.get('mailFolders',folderId)?.isInbox?'':folderId;
    if(pending.has(key))return pending.get(key);
    const work=tail.then(async()=>{
      if(stopped||!store.settings().outlookConnected)return {skipped:true};
      if(!key)lastAttempt=now();
      store.setting('outlookSyncing',true);store.setting('outlookSyncError','');
      store.emit('mail_sync',{status:'running',reason,folderId:key});
      try{
        const result=await outlook.sync(key);
        if(!stopped){store.setting('outlookSyncError','');store.emit('mail_sync',{status:'complete',reason,folderId:key,count:result.count});}
        return result;
      }catch(error){
        if(!stopped){store.setting('outlookSyncError',error.message);store.emit('mail_sync',{status:'failed',reason,folderId:key,error:error.message});}
        throw error;
      }finally{
        if(!stopped){store.setting('outlookSyncing',false);if(!key){nextDue=now()+MAIL_SYNC_INTERVAL;store.setting('outlookNextSync',new Date(nextDue).toISOString());}}
      }
    });
    const job=work.finally(()=>pending.delete(key));pending.set(key,job);tail=job.catch(()=>{});return job;
  }
  function automatic(reason='load'){
    if(pending.has(''))return pending.get('');
    if(reason==='due'&&now()<nextDue||reason==='load'&&lastAttempt&&now()-lastAttempt<60000)return Promise.resolve({skipped:true});
    return sync('',reason);
  }
  return {
    sync,automatic,
    start(){if(timer||stopped)return;timer=every(()=>automatic('due').catch(()=>{}),30000);timer.unref?.();automatic('startup').catch(()=>{});},
    stop(){stopped=true;if(timer)cancel(timer);timer=null;},
    idle(){return tail;}
  };
}
