import {randomUUID} from 'node:crypto';

export function createConversations(store){
  const scope=(engine,projectId='')=>`${engine}:${projectId}`;
  function validate(engine,projectId=''){
    if(!['GPT','Codex','Claude'].includes(engine))throw new Error('Choose GPT, Claude or Codex.');
    if(projectId&&!store.get('projects',projectId))throw new Error('Choose an existing project.');
  }
  function select(id){
    const chat=store.get('conversations',id);if(!chat)throw new Error('Chat not found.');validate(chat.engine,chat.projectId);
    store.put('chatScopes',{id:scope(chat.engine,chat.projectId),conversationId:id});return chat;
  }
  function create(engine,projectId='',title='New chat'){
    validate(engine,projectId);
    const chat=store.put('conversations',{id:randomUUID(),engine,projectId,title,hasMessages:false});select(chat.id);return chat;
  }
  function ensure(engine,projectId=''){
    validate(engine,projectId);const selected=store.get('chatScopes',scope(engine,projectId));
    return selected&&store.get('conversations',selected.conversationId)||create(engine,projectId);
  }
  function resolve(id,engine,projectId=''){
    if(!id)return ensure(engine,projectId);
    const chat=store.get('conversations',id);
    if(!chat||chat.engine!==engine||(chat.projectId||'')!==projectId)throw new Error('Choose a chat for this assistant and project.');
    select(chat.id);return chat;
  }
  // Keep earlier messages and Codex sessions accessible when upgrading.
  const legacy=store.list('messages').filter(m=>!m.conversationId&&['GPT','Codex'].includes(m.engine));
  for(const message of legacy){
    const projectId=message.projectId||'';if(projectId&&!store.get('projects',projectId))continue;
    const chat=ensure(message.engine,projectId);
    if(!chat.hasMessages)store.put('conversations',{...chat,title:'Earlier conversation',hasMessages:true});
    store.put('messages',{...message,conversationId:chat.id});
    if(message.engine==='Codex'){
      const saved=store.get('codexConversations',projectId||'business');
      if(saved?.threadId&&!store.get('codexConversations',chat.id))store.put('codexConversations',{id:chat.id,threadId:saved.threadId});
    }
  }
  ensure('GPT');ensure('Codex');ensure('Claude');
  return {create,select,ensure,resolve,
    touch(id,prompt){const chat=store.get('conversations',id);return store.put('conversations',{...chat,title:chat.hasMessages?chat.title:prompt.replace(/\s+/g,' ').trim().slice(0,70),hasMessages:true,lastMessageAt:new Date().toISOString()});},
    activeMessages(){const ids=new Set(store.list('chatScopes').map(s=>s.conversationId));return store.list('messages').filter(m=>ids.has(m.conversationId)).slice(0,2000);}
  };
}
