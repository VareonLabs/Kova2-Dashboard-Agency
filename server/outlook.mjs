import { PublicClientApplication } from '@azure/msal-node';
import { randomBytes, createHash } from 'node:crypto';
import { readSecret, writeSecret, deleteSecret } from './secrets.mjs';
import { graphEmail } from './email-html.mjs';
import { cleanReceivedHTML, contentId, emailText, imageData, receivedDocument } from './received-email.mjs';
const scopes=['User.Read','Mail.ReadWrite','Mail.Send','Contacts.Read','offline_access'];
export function createOutlook(store, baseUrl,dependencies={}) {
  const pending=new Map();
  async function client() {
    const {microsoftClientId, microsoftTenant='common'}=store.settings();
    if (!microsoftClientId) throw new Error('Add the Microsoft application ID in Connections first.');
    return new PublicClientApplication({auth:{clientId:microsoftClientId,authority:`https://login.microsoftonline.com/${microsoftTenant}`},cache:{cachePlugin:{beforeCacheAccess:async ctx=>{const cache=await readSecret('outlook'); if(cache){try{JSON.parse(cache);ctx.tokenCache.deserialize(cache);}catch{store.setting('outlookConnected',false);store.setting('outlookError','The previous credential was incomplete. Reconnect Outlook to replace it.');}}},afterCacheAccess:async ctx=>{if(ctx.cacheHasChanged)await writeSecret('outlook',ctx.tokenCache.serialize());}}}});
  }
  async function token() {
    const app=await client(); await app.getTokenCache().getAllAccounts();
    const accounts=await app.getTokenCache().getAllAccounts();
    const account=accounts.find(a=>a.username?.toLowerCase()===store.settings().email?.toLowerCase());
    if(!account) throw new Error('Connect your Outlook mailbox in Connections.');
    const result=await app.acquireTokenSilent({account,scopes});return result.accessToken;
  }
  async function graph(path, options={}) {
    if(dependencies.graph)return dependencies.graph(path,options);
    const response=await fetch(`https://graph.microsoft.com/v1.0${path}`,{...options,headers:{Authorization:`Bearer ${await token()}`,'Content-Type':'application/json',Prefer:'outlook.body-content-type="html", IdType="ImmutableId"',...options.headers},signal:AbortSignal.timeout(30000)});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error?.message || `Outlook request failed (${response.status})`);}
    return response.status===202||response.status===204 ? null : response.json();
  }
  async function pages(path){const items=[];let next=path;while(next){const result=await graph(next);items.push(...(result.value||[]));if(items.length>50000)throw new Error('This mailbox has more than 50,000 records. Narrow the sync before retrying.');const link=result['@odata.nextLink'];if(link&&!link.startsWith('https://graph.microsoft.com/v1.0/'))throw new Error('Unexpected Outlook pagination URL');next=link?link.slice('https://graph.microsoft.com/v1.0'.length):'';}return items;}
  async function syncFolders(){
    if(!store.settings().outlookConnected)return store.list('mailFolders');
    const inbox=await graph('/me/mailFolders/inbox?$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount');store.setting('outlookInboxId',inbox.id);
    const found=[];async function visit(path,depth=0){if(depth>30)throw new Error('Outlook folder nesting is too deep');for(const folder of await pages(path)){found.push(folder);if(folder.childFolderCount)await visit(`/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount`,depth+1);}}
    await visit('/me/mailFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount');
    for(const folder of found)store.put('mailFolders',{id:'outlook-'+folder.id,graphId:folder.id,name:folder.displayName,parentGraphId:folder.parentFolderId,total:folder.totalItemCount,unread:folder.unreadItemCount,source:'Outlook',isInbox:folder.id===inbox.id});
    const ids=new Set(found.map(f=>'outlook-'+f.id));for(const old of store.list('mailFolders'))if(old.source==='Outlook'&&!ids.has(old.id))store.remove('mailFolders',old.id);
    return store.list('mailFolders');
  }
  async function syncContacts(){
    if(!store.settings().outlookConnected)throw new Error('Connect Outlook to load saved contacts.');
    const found=await pages('/me/contacts?$top=250&$select=id,displayName,emailAddresses,companyName,mobilePhone,businessPhones');
    async function visit(path,depth=0){if(depth>30)throw new Error('Contact folder nesting is too deep');for(const folder of await pages(path)){found.push(...await pages(`/me/contactFolders/${encodeURIComponent(folder.id)}/contacts?$top=250&$select=id,displayName,emailAddresses,companyName,mobilePhone,businessPhones`));await visit(`/me/contactFolders/${encodeURIComponent(folder.id)}/childFolders?$top=100`,depth+1);}}
    await visit('/me/contactFolders?$top=100');const ids=new Set();
    for(const contact of found)for(const address of contact.emailAddresses||[]){if(!address.address)continue;const id='outlook-'+contact.id+'-'+address.address.toLowerCase();ids.add(id);store.put('contacts',{id,name:contact.displayName||address.name||address.address,email:address.address,company:contact.companyName||'',phone:contact.mobilePhone||contact.businessPhones?.[0]||'',source:'Outlook'});}
    for(const old of store.list('contacts'))if(old.source==='Outlook'&&!ids.has(old.id))store.remove('contacts',old.id);
    store.setting('contactsLastSync',new Date().toISOString());return {count:ids.size};
  }
  function saveContent(id,body) {
    const html=String(body?.contentType||'').toLowerCase()==='html'?body.content||'':'';
    const text=html?emailText(html):body?.content||'';
    const revision=createHash('sha256').update(html||text).digest('hex');
    const old=store.get('emailContent',id);
    if(old?.revision!==revision)store.put('emailContent',{id,html,text,revision,ready:false,renderedHtml:''});
    return {body:text,contentRevision:revision};
  }
  const pendingContent=new Map();
  async function loadContent(id) {
    let email=store.get('emails',id);if(!email)throw new Error('Email not found');
    let content=store.get('emailContent',id);
    if(!content&&email.graphId){
      const mail=await graph(`/me/messages/${encodeURIComponent(email.graphId)}?$select=id,body`);
      const fields=saveContent(id,mail.body);email=store.put('emails',{...store.get('emails',id),...fields});content=store.get('emailContent',id);
    }
    if(!content)return {html:receivedDocument(cleanReceivedHTML(email.bodyHtml||''),email.body),revision:email.updatedAt,missingImages:0};
    if(content.ready)return {html:receivedDocument(content.renderedHtml,content.text),revision:content.revision,missingImages:0};
    const wanted=new Set([...content.html.matchAll(/\bsrc\s*=\s*["'](cid:[^"']+)["']/gi)].map(m=>contentId(m[1]))),images={};let used=0,imageError='';
    if(wanted.size&&email.graphId){
      try{
        // Inline-only messages can have hasAttachments=false; inspect CID references instead.
        const attachments=await pages(`/me/messages/${encodeURIComponent(email.graphId)}/attachments?$top=100&$select=id,name,contentType,isInline,size`);
        for(const item of attachments.filter(a=>a.isInline&&/^image\/(png|jpeg|gif|webp)$/i.test(a.contentType||'')&&a.size<=5_000_000).slice(0,24)){
          if(used+(item.size||0)>12_000_000)break;
          const file=await graph(`/me/messages/${encodeURIComponent(email.graphId)}/attachments/${encodeURIComponent(item.id)}`),cid=contentId(file.contentId||'');
          if(!wanted.has(cid))continue;const src=imageData(file);if(src){images[cid]=src;used+=Buffer.from(file.contentBytes,'base64').length;}
        }
      }catch(error){imageError=error.message;}
    }
    const missingImages=[...wanted].filter(cid=>!images[cid]).length,renderedHtml=cleanReceivedHTML(content.html,images);
    if(!missingImages)store.put('emailContent',{...content,renderedHtml,ready:true});
    return {html:receivedDocument(renderedHtml,content.text),revision:content.revision,missingImages,...(imageError?{imageError}:{} )};
  }
  return {
    content(id){if(!pendingContent.has(id))pendingContent.set(id,loadContent(id).finally(()=>pendingContent.delete(id)));return pendingContent.get(id);},
    async markRead(id,isRead=true){
      if(typeof isRead!=='boolean')throw new Error('Choose read or unread.');
      const email=store.get('emails',id);if(!email)throw new Error('Email not found');if(!!email.isRead===isRead)return email;
      if(email.graphId)await graph(`/me/messages/${encodeURIComponent(email.graphId)}`,{method:'PATCH',body:JSON.stringify({isRead})});
      const latest=store.get('emails',id),folder=latest.folderId?store.get('mailFolders',latest.folderId):null;
      if(!!latest.isRead!==isRead&&folder&&Number.isFinite(folder.unread))store.put('mailFolders',{...folder,unread:Math.max(0,folder.unread+(isRead?-1:1))});
      const saved=store.put('emails',{...latest,isRead});store.emit('ui',{action:'records_changed',collection:'emails'});return saved;
    },
    async trash(id){
      const email=store.get('emails',id);if(!email)throw new Error('Email not found');if(email.deletedAt)return {moved:true,email};
      let folder,moved;
      if(email.graphId){
        const remote=await graph('/me/mailFolders/deleteditems?$select=id,displayName,totalItemCount,unreadItemCount');
        folder=store.put('mailFolders',{id:'outlook-'+remote.id,graphId:remote.id,name:remote.displayName||'Deleted Items',source:'Outlook',isDeletedItems:true,total:remote.totalItemCount,unread:remote.unreadItemCount});
        if(email.folderId===folder.id)throw new Error('This email is already in Deleted Items.');
        moved=await graph(`/me/messages/${encodeURIComponent(email.graphId)}/move`,{method:'POST',body:JSON.stringify({destinationId:'deleteditems'})});
      }else folder=store.put('mailFolders',{id:'local-deleted-items',name:'Deleted Items',source:'Local',isDeletedItems:true});
      const latest=store.get('emails',id),source=latest.folderId?store.get('mailFolders',latest.folderId):null;
      if(source)store.put('mailFolders',{...source,...(Number.isFinite(source.total)?{total:Math.max(0,source.total-1)}:{}),...(Number.isFinite(source.unread)&&!latest.isRead?{unread:Math.max(0,source.unread-1)}:{})});
      const saved=store.put('emails',{...latest,graphId:moved?.id||latest.graphId,folderId:folder.id,deletedAt:new Date().toISOString()});
      store.log('Moved email to Deleted Items: '+email.subject);store.emit('ui',{action:'records_changed',collection:'emails'});return {moved:true,email:saved};
    },
    async authorize() {
      const app=await client();const state=randomBytes(32).toString('hex');const verifier=randomBytes(48).toString('base64url');
      pending.set(state,{verifier,expires:Date.now()+600000});
      for(const [k,v]of pending)if(v.expires<Date.now())pending.delete(k);
      return app.getAuthCodeUrl({scopes,redirectUri:`${baseUrl}/auth/outlook/callback`,state,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',loginHint:store.settings().email,prompt:'select_account'});
    },
    async callback(query) {
      const item=pending.get(query.state);pending.delete(query.state);
      if(!item||item.expires<Date.now())throw new Error('The sign-in request expired. Start again from Connections.');
      if(query.error)throw new Error(query.error_description||query.error);
      const app=await client();const result=await app.acquireTokenByCode({code:query.code,scopes,redirectUri:`${baseUrl}/auth/outlook/callback`,codeVerifier:item.verifier});
      if(result.account.username.toLowerCase()!==store.settings().email.toLowerCase()) { await deleteSecret('outlook');throw new Error(`Sign in with ${store.settings().email}. The selected mailbox does not match.`); }
      store.setting('outlookConnected',true);store.log('Connected Outlook');return result.account.username;
    },
    syncFolders,syncContacts,
    async createFolder(name){name=String(name||'').trim();if(!name||name.length>100)throw new Error('Enter a folder name up to 100 characters');if(store.list('mailFolders').some(f=>f.name.toLowerCase()===name.toLowerCase()))throw new Error('A folder with that name already exists.');let item;if(store.settings().outlookConnected){const folder=await graph('/me/mailFolders/inbox/childFolders',{method:'POST',body:JSON.stringify({displayName:name,isHidden:false})});item=store.put('mailFolders',{id:'outlook-'+folder.id,graphId:folder.id,name:folder.displayName,parentGraphId:folder.parentFolderId,source:'Outlook'});}else item=store.put('mailFolders',{name,source:'Local',graphId:''});store.log('Created inbox folder: '+name);store.emit('ui',{action:'records_changed',collection:'mailFolders'});return item;},
    async moveEmail(emailId,folderId){const email=store.get('emails',emailId),folder=store.get('mailFolders',folderId);if(!email||!folder)throw new Error('Choose an email and folder.');if(email.graphId){if(!folder.graphId)throw new Error('This folder is local only. Create an Outlook folder while connected to move Outlook messages.');const moved=await graph(`/me/messages/${encodeURIComponent(email.graphId)}/move`,{method:'POST',body:JSON.stringify({destinationId:folder.graphId})});store.put('emails',{...store.get('emails',emailId),graphId:moved.id,folderId:folder.id,deletedAt:folder.isDeletedItems?email.deletedAt||new Date().toISOString():null});}else store.put('emails',{...email,folderId:folder.id,deletedAt:folder.isDeletedItems?email.deletedAt||new Date().toISOString():null});store.emit('ui',{action:'records_changed',collection:'emails'});return {moved:true};},
    async sync(folderId='') {
      await syncFolders();let contactError='';try{await syncContacts();}catch(error){contactError=error.message;store.setting('contactsSyncError',contactError);}
      const folder=folderId?store.get('mailFolders',folderId):store.list('mailFolders').find(f=>f.isInbox);if(folderId&&!folder?.graphId)return {count:0,contactError,localOnly:true};
      const graphId=folder?.graphId||'inbox';const data=await graph(`/me/mailFolders/${encodeURIComponent(graphId)}/messages?$top=100&$orderby=receivedDateTime%20desc&$select=id,subject,body,bodyPreview,from,toRecipients,receivedDateTime,isRead,webLink,parentFolderId`);
      for(const mail of data.value){
        const from=mail.from?.emailAddress?.address||'';const client=store.list('clients').find(c=>c.email?.toLowerCase()===from.toLowerCase());
        const old=store.list('emails').find(e=>e.graphId===mail.id)||store.get('emails',`outlook-${mail.id}`);
        const id=old?.id||`outlook-${mail.id}`,content=saveContent(id,mail.body||{content:mail.bodyPreview||''});
        store.put('emails',{...old,id,graphId:mail.id,subject:mail.subject||'(No subject)',...content,from,fromName:mail.from?.emailAddress?.name||from,to:store.settings().email,status:'Received',receivedAt:mail.receivedDateTime,isRead:mail.isRead,webLink:mail.webLink,folderId:'outlook-'+(mail.parentFolderId||graphId),deletedAt:store.get('mailFolders','outlook-'+(mail.parentFolderId||graphId))?.isDeletedItems?(old?.deletedAt||new Date().toISOString()):null,clientId:old?.clientId||client?.id||''});
      }
      store.setting('outlookLastSync',new Date().toISOString());if(!contactError)store.setting('contactsSyncError','');store.log('Synced Outlook mail and contacts');return {count:data.value.length,contactError};
    },
    async send(email,attachments=[]) {
      if(!email.to||!email.subject)throw new Error('Add a recipient and subject first.');
      const message=graphEmail(email,store.settings(),attachments);
      if(email.replyToId){const original=store.get('emails',email.replyToId);if(!original?.graphId)throw new Error('Original Outlook message not found');await graph(`/me/messages/${encodeURIComponent(original.graphId)}/reply`,{method:'POST',body:JSON.stringify({message})});}
      else await graph('/me/sendMail',{method:'POST',body:JSON.stringify({message,saveToSentItems:true})});
      return {accepted:true};
    },
    async disconnect(){await deleteSecret('outlook');store.setting('outlookConnected',false);}
  };
}
