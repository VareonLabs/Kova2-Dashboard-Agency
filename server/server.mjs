import {createBackups} from './backups.mjs';
import {privateAccess} from './private-access.mjs';
import {createSearch,searchTypes} from './search.mjs';
import {createFollowUps} from './follow-ups.mjs';
import {schemas} from './domain.mjs';
import {createReviews} from './reviews.mjs';
import {todaySummary,clientWorkspace} from '../public/operations-data.js';
import {createChatFiles} from './chat-files.mjs';
import {createAnalytics} from './analytics.mjs';
import express from 'express';
import { resolve, dirname,basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync,watch,readFileSync,writeFileSync } from 'node:fs';
import { randomBytes,timingSafeEqual,randomUUID } from 'node:crypto';
import { createStore, defaults } from './store.mjs';
import { snapshot, saveRecord, deleteRecord, approvePrdRevision, approveStandardRevision, approveDesignRevision, acceptProposal, invoiceUnbilledTime, invoiceRetainer } from './domain.mjs';
import { createActions } from './actions.mjs';
import { createAssistant } from './assistant.mjs';
import { createOutlook } from './outlook.mjs';
import { createMailSync } from './mail-sync.mjs';
import { createScheduler } from './scheduler.mjs';
import { readSecret, writeSecret } from './secrets.mjs';
import { createChatGPTAuth } from './chatgpt-auth.mjs';
import { financeSummary } from './finance.mjs';
import { saveMedia } from './media.mjs';
import { createUsageReader } from './usage.mjs';
import { createCodexModelReader } from './models.mjs';
import { createClaudeEngine } from './claude-engine.mjs';
import { createGitHub } from './github.mjs';
import { createDelivery } from './delivery.mjs';
import { createDeliveryRuns } from './delivery-runs.mjs';
import { portfolio } from './portfolio.mjs';
import { dryRun, scanRules } from './rules.mjs';
import { publishTemplate, winProspect, templateUpdate, applyTemplateUpdate } from './templates.mjs';
import { cleanEmailHTML,buildEmailHTML,graphEmail } from './email-html.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function createApp(options={}) {
  const directory=options.directory||process.env.VAREON_DATA_DIR||resolve(root,'data');
  mkdirSync(resolve(directory,'codex-workspace'),{recursive:true,mode:0o700});
  mkdirSync(resolve(directory,'claude-workspace'),{recursive:true,mode:0o700});
  const store=createStore(directory);for(const[k,v]of Object.entries(defaults))if(store.settings()[k]===undefined)store.setting(k,v);
  const port=Number(options.port||process.env.PORT||4317),baseUrl=`http://localhost:${port}`;
  const analytics=createAnalytics(store,port,options.analyticsDeps||{}),actions=createActions(store,undefined,undefined,analytics),chatgpt=createChatGPTAuth(store,port),claude=createClaudeEngine(store,directory),assistant=createAssistant(store,actions,directory,{chatgpt,claude}),outlook=createOutlook(store,baseUrl),scheduler=createScheduler(store,assistant);
  const chatFiles=createChatFiles(store,directory),reviews=createReviews(store);
  const {planning,history:actionHistory,reports,businessOps}=actions;
  let meetingAnalysis=false;const idle=()=>!meetingAnalysis&&!store.get('assistantState','current')?.busy&&!store.list('automations').some(j=>j.running)&&!store.list('clientReports').some(j=>j.status==='Generating');
  const backups=createBackups(store,{idle});
  for(const r of store.list('clientReports'))if(r.status==='Generating')store.put('clientReports',{...r,status:'Interrupted',error:'Generation was interrupted. Generate the report again.'});
  const mailSync=createMailSync(store,outlook),search=createSearch(store,actions.memory),followUps=createFollowUps(store);
  const usage=createUsageReader(root),codexModels=createCodexModelReader(root),connectors=actions.connectors;
  const deliveryRuns=createDeliveryRuns(store,assistant);
  const github=createGitHub(store,options.githubDeps||{}),delivery=createDelivery(store,github,options.githubDeps||{});
  const app=express(),session=randomBytes(32).toString('hex');
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Cache-Control':'no-store'});next();});
  let privateConfig={};try{privateConfig=JSON.parse(readFileSync(resolve(directory,'private-access.json'),'utf8'));}catch{}
  const access=privateAccess(port,privateConfig),localHost=access.allowed;
  const cookieName=`vareon_session_${port}`;
  const cookieOK=req=>{const value=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';return value.length===session.length&&timingSafeEqual(Buffer.from(value),Buffer.from(session));};
  // Dashboard access accepts loopback or the explicitly configured Tailscale owner.
  // All API calls still require the session cookie and same-origin verification.
  app.use('/api',(req,res,next)=>{
    if(backups.busy&&!['GET','HEAD'].includes(req.method))return res.status(503).json({error:'A backup or restore is in progress. Try again shortly.'});
    if(!localHost(req)||!cookieOK(req))return res.status(403).json({error:'Open the dashboard on this Mac to use this action.'});
    if(!['GET','HEAD'].includes(req.method)){
      if(req.headers['x-vareon-local']!=='1')return res.status(403).json({error:'Local request verification failed'});
      if(req.headers.origin && !access.originAllowed(req,req.headers.origin))return res.status(403).json({error:'Cross-origin requests are not allowed'});
    }
    next();
  });
  app.use(express.json({limit:'8mb'}));
  app.get('/api/state',async(req,res)=>{
    const settings=store.settings(),chatgptSession=await chatgpt.status(),claudeSession=await claude.status();
    res.json({...snapshot(store),notifications:businessOps.notifications(new Date(),{gpt:chatgptSession.sharing}),onboardingProgress:businessOps.onboardings(),backupStatus:backups.config(),analytics:analytics.state(),reportList:reports.list(),followUps:followUps.summary(),conversations:store.list('conversations'),chatScopes:store.list('chatScopes'),messages:assistant.conversations.activeMessages(),finance:financeSummary(store),contactCount:store.list('contacts').length,settings,mcpConnections:connectors.list(),attachments:store.list('attachments').map(({id,name,contentType,size})=>({id,name,contentType,size})),assistantState:store.get('assistantState','current'),memoryFiles:actions.memory.list(),connections:{gpt:chatgptSession.sharing,chatgpt:chatgptSession,claude:claudeSession,outlook:!!settings.outlookConnected},oauthRequests:store.list('oauthRequests').filter(r=>r.status==='Pending'&&Date.parse(r.expiresAt)>Date.now()).map(({id,clientName,scope,expiresAt})=>({id,clientName,scope,expiresAt}))});
  });
  app.get('/api/operations',(req,res)=>res.json({onboardings:businessOps.onboardings(),renewals:businessOps.renewals(),profitability:businessOps.profitability({start:req.query.start||'',end:req.query.end||'',clientId:req.query.clientId||''}),notifications:businessOps.notifications(),backups:backups.list(),backupSettings:backups.config(),timer:store.get('timeTimers','current')}));
  app.post('/api/onboarding/start',(req,res)=>res.json(businessOps.startOnboarding(req.body)));
  app.post('/api/renewals/:id/complete',(req,res)=>res.json(businessOps.completeRenewal(req.params.id,req.body.date)));
  app.post('/api/time/start',(req,res)=>res.json(businessOps.timerStart(req.body)));
  app.post('/api/time/stop',(req,res)=>res.json(businessOps.timerStop()));
  app.post('/api/time/discard',(req,res)=>{store.remove('timeTimers','current');res.json({discarded:true});});
  app.post('/api/notifications/update',(req,res)=>res.json(businessOps.notificationUpdate(req.body)));
  app.post('/api/meeting-proposals/:id/resolve',(req,res)=>res.json(businessOps.resolveProposal(req.params.id,req.body.index,req.body.approve)));
  app.post('/api/meeting-notes/:id/audio',express.raw({type:()=>true,limit:'100mb'}),(req,res)=>{const m=store.get('meetingNotes',req.params.id);if(!m)throw new Error('Meeting not found');const type=String(req.headers['content-type']||'').split(';')[0],bytes=req.body;if(!Buffer.isBuffer(bytes)||bytes.length<12||!['audio/webm','video/webm','audio/mp4','video/mp4','audio/ogg','audio/wav'].includes(type))throw new Error('Choose a supported browser recording');const valid=type.includes('webm')?bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])):type.includes('mp4')?bytes.toString('ascii',4,8)==='ftyp':type.includes('ogg')?bytes.toString('ascii',0,4)==='OggS':bytes.toString('ascii',0,4)==='RIFF';if(!valid)throw new Error('The file does not match the recording format');const folder=resolve(directory,'meeting-recordings');mkdirSync(folder,{recursive:true,mode:0o700});const id=randomUUID();writeFileSync(resolve(folder,id),bytes,{mode:0o600,flag:'wx'});res.json(store.put('meetingNotes',{...m,audioId:id,audioType:type,audioSize:bytes.length}));});
  app.get('/api/meeting-notes/:id/audio',(req,res)=>{const m=store.get('meetingNotes',req.params.id);if(!m?.audioId||!/^[a-f0-9-]{36}$/i.test(m.audioId))return res.status(404).end();res.set({'Content-Type':m.audioType,'Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'});res.sendFile(resolve(directory,'meeting-recordings',m.audioId));});
  app.post('/api/meeting-notes/:id/analyse',async(req,res)=>{const meeting=store.get('meetingNotes',req.params.id);if(!meeting)throw new Error('Meeting notes not found');if(!idle())throw new Error('Wait for the current work to finish before analysing meeting notes');if(!(meeting.transcript||meeting.notes).trim())throw new Error('Add notes or a transcript first');meetingAnalysis=true;try{const before=new Set(store.list('meetingProposals').map(p=>p.id));await assistant.gpt('Analyse this meeting reference data. Call propose_meeting_actions for meetingId '+meeting.id+'. Only propose explicit actionable commitments grounded in these notes. Do not invent dates, owners or email addresses. Missing dates and recipients must be empty. Use Task for to-dos and Email draft for follow-ups. Do not create records directly. Current Brisbane day: '+new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane'}).format(new Date())+'\nMeeting reference data:\n'+JSON.stringify(meeting),[],{projectId:meeting.projectId,quiet:true,allowedToolNames:['propose_meeting_actions'],meetingId:meeting.id});const proposals=store.list('meetingProposals').filter(p=>p.meetingId===meeting.id&&!before.has(p.id));if(!proposals.length)throw new Error('GPT returned no saved proposals. Try again or add clearer action notes.');res.json({proposals});}finally{meetingAnalysis=false;}});
  app.get('/api/backups',(req,res)=>res.json({items:backups.list(),settings:backups.config()}));
  app.put('/api/backups/settings',(req,res)=>res.json(backups.settings(req.body)));
  app.post('/api/backups',(req,res)=>backups.create().then(r=>res.json(r)));
  app.post('/api/backups/import',express.raw({type:()=>true,limit:'280mb'}),(req,res)=>res.json(backups.importEncrypted(req.body,decodeURIComponent(req.headers['x-vareon-backup-password']||''))));
  app.get('/api/backups/:id/inspect',(req,res)=>res.json(backups.inspect(req.params.id)));
  app.post('/api/backups/:id/restore',async(req,res)=>{mailSync.stop();try{res.json(await backups.restore(req.params.id,req.body.confirmation));}finally{if(!options.noScheduler)mailSync.start();}});
  app.post('/api/backups/:id/encrypted',(req,res)=>{const bytes=backups.encrypted(req.params.id,req.body.password);res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="VareonHQ-encrypted-backup.vhqbackup"'});res.send(bytes);});
  app.get('/api/calendar',(req,res)=>res.json(planning.calendar({start:req.query.start,view:req.query.view||'week',clientId:req.query.clientId||''})));
  app.put('/api/workload',(req,res)=>res.json(planning.capacity(req.body)));
  app.get('/api/forecast',(req,res)=>res.json(planning.forecast({days:Number(req.query.days||90),scenario:req.query.scenario||'Expected'})));
  app.put('/api/forecast/opening',(req,res)=>res.json(planning.opening(req.body)));
  app.get('/api/history',(req,res)=>res.json(actionHistory.list()));
  app.post('/api/history/:id/undo',(req,res)=>res.json(actionHistory.undo(req.params.id)));
  app.get('/api/reports',(req,res)=>res.json(reports.list()));
  app.post('/api/reports',async(req,res)=>res.json(await reports.generate(req.body)));
  app.get('/api/reports/:id',(req,res)=>{const r=store.get('clientReports',req.params.id);if(!r)throw new Error('Report not found');res.json(r);});
  app.get('/api/reports/:id/document',(req,res)=>{res.set({'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"});if(req.query.download==='true')res.set('Content-Disposition','attachment; filename="VareonHQ-client-report.html"');res.send(reports.html(req.params.id));});
  app.get('/api/search',(req,res)=>res.json(search.query({query:req.query.q||'',type:req.query.type||'all',offset:Number(req.query.offset||0),limit:Number(req.query.limit||40)})));
  app.get('/api/search/resolve',(req,res)=>{
    const type=String(req.query.type||''),id=String(req.query.id||'');if(!searchTypes.includes(type)||!id||id.length>300)throw new Error('Choose a saved search result');
    if(type==='memory'){const scope=id.split(':')[0],filename=id.slice(scope.length+1);return res.json(actions.memory.read(filename,scope==='workspace'?'':scope));}
    if(type==='files'){const file=store.get('chatFiles',id)||store.get('media',id)||store.get('attachments',id);if(!file)throw new Error('File no longer exists');return res.json({id:file.id,name:file.name});}
    const record=store.get(type,id);if(!record||record.deletedAt)throw new Error('This result is no longer available');
    if(type==='messages')return res.json({record,conversation:store.get('conversations',record.conversationId)});
    if(!['approvals','clientReports'].includes(type)&&!schemas[type])throw new Error('This result cannot be opened');res.json({record});
  });
  app.get('/api/follow-ups',(req,res)=>res.json(followUps.summary()));
  app.get('/api/prospects/:id/follow-up',(req,res)=>res.json(followUps.context(req.params.id)));
  app.post('/api/prospects/:id/follow-up',(req,res)=>res.json(followUps.update(req.params.id,req.body)));
  app.get('/api/today',(req,res)=>res.json(todaySummary({...snapshot(store),finance:financeSummary(store),followUps:followUps.summary()})));
  app.get('/api/clients/:id/workspace',(req,res)=>res.json({...clientWorkspace({...snapshot(store,Infinity),messages:store.list('messages'),attachments:store.list('attachments')},req.params.id),finance:financeSummary(store,{clientId:req.params.id})}));
  app.get('/api/approvals/:id/preview',(req,res)=>{const a=store.get('approvals',req.params.id);if(!a||a.kind!=='email')throw new Error('Email review not found');res.json({html:buildEmailHTML(a.payload,store.settings(),{requireSignature:false})});});
  app.post('/api/reviews',(req,res)=>res.json(reviews.request(req.body,'You')));
  app.post('/api/reviews/email/:id',async(req,res)=>res.json(await actions.execute('request_email_send',{emailId:req.params.id},'You')));
  app.post('/api/analytics/google/setup',async(req,res)=>res.json(await analytics.google.configure(req.body)));
  app.post('/api/analytics/google/authorize',async(req,res)=>res.json(await analytics.google.authorize()));
  app.post('/api/analytics/google/disconnect',async(req,res)=>res.json(await analytics.google.disconnect()));
  app.get('/api/analytics/properties',async(req,res)=>res.json(await analytics.google.properties()));
  app.get('/api/analytics/:id/report',async(req,res)=>res.json(await analytics.report(req.params.id,Number(req.query.days||28),req.query.refresh==='true')));
  app.post('/api/analytics/:id/audit',async(req,res)=>res.json(await analytics.audit(req.params.id)));
  app.get('/auth/google/callback',async(req,res)=>{if(!localHost(req))return res.status(403).send('Finish sign-in on this Mac');try{await analytics.google.callback(req.query);}catch(error){store.setting('googleAnalyticsError',error.message.slice(0,1000));}res.redirect(baseUrl+'/#analytics');});
  app.get('/api/usage',async(req,res)=>res.json(await usage.read(req.query.refresh==='true')));
  app.post('/api/connectors',async(req,res)=>res.json(await connectors.add(req.body)));
  app.post('/api/connectors/:id/connect',async(req,res)=>res.json(await connectors.connect(req.params.id)));
  app.post('/api/connectors/:id/disconnect',async(req,res)=>{await connectors.disconnect(req.params.id);res.json({ok:true});});
  app.get('/api/connectors/:id/tools',async(req,res)=>res.json(await connectors.tools(req.params.id)));
  app.get('/auth/mcp/callback',async(req,res,next)=>{if(!localHost(req))return res.status(403).send('Finish sign-in on this Mac');try{await connectors.callback(req.query);res.redirect('/#connections');}catch(error){next(error);}});
  app.put('/api/email-branding',(req,res)=>{const{signatureHtml,confirmed}=req.body;if(typeof signatureHtml!=='string'||signatureHtml.length>100000)throw new Error('Keep the signature under 100,000 characters');store.setting('emailSignatureHtml',cleanEmailHTML(signatureHtml));store.setting('emailSignatureConfirmed',confirmed===true);store.log('Updated Outlook email signature');res.json({ok:true});});
  app.get('/api/emails/:id/preview',(req,res)=>{const email=store.get('emails',req.params.id);if(!email)throw new Error('Email not found');res.json({html:buildEmailHTML(email,store.settings(),{requireSignature:false}),signatureConfirmed:!!store.settings().emailSignatureConfirmed});});
  app.get('/api/emails/:id/content',async(req,res)=>res.json(await outlook.content(req.params.id)));
  app.post('/api/chat-files',express.raw({type:()=>true,limit:'25mb'}),async(req,res)=>res.json(await chatFiles.save({relativePath:decodeURIComponent(req.headers['x-vareon-file-path']||''),groupId:req.headers['x-vareon-file-group'],bytes:req.body})));
  app.get('/api/chat-files/:id',(req,res)=>res.json(chatFiles.get(req.params.id)));
  app.get('/api/chat-files/:id/text',(req,res)=>res.json(chatFiles.read(req.params.id,Number(req.query.offset||0),Number(req.query.limit||16000))));
  app.get('/api/chat-files/:id/preview',(req,res)=>{const file=chatFiles.get(req.params.id);if(file.kind!=='image')return res.status(400).json({error:'Only image files have inline previews.'});res.set({'Content-Type':file.contentType,'Content-Security-Policy':"default-src 'none'; sandbox"});res.sendFile(chatFiles.path(file.id));});
  app.get('/api/chat-files/:id/download',(req,res)=>{const file=chatFiles.get(req.params.id);res.set({'Content-Type':'application/octet-stream','Content-Security-Policy':"default-src 'none'; sandbox"});res.download(chatFiles.path(file.id),file.name);});
  app.get('/api/email-attachments/:id/download',(req,res)=>{const file=store.get('attachments',req.params.id);if(!file||!/^[a-f0-9-]{36}$/i.test(file.id))throw new Error('Attachment not found');res.set({'Content-Type':'application/octet-stream','Content-Security-Policy':"default-src 'none'; sandbox"});res.download(resolve(directory,'attachments',file.id),file.name);});
  app.post('/api/email-attachments',express.raw({type:()=>true,limit:'2mb'}),(req,res)=>{const name=basename(decodeURIComponent(req.headers['x-vareon-filename']||'attachment')).slice(0,200);if(!Buffer.isBuffer(req.body)||!req.body.length)throw new Error('Choose a file under 2 MB');const id=randomUUID(),folder=resolve(directory,'attachments');mkdirSync(folder,{recursive:true,mode:0o700});writeFileSync(resolve(folder,id),req.body,{mode:0o600,flag:'wx'});const file=store.put('attachments',{id,name,contentType:req.headers['content-type']||'application/octet-stream',size:req.body.length});res.json(file);});
  app.post('/api/automation-rules/:id/dry-run',(req,res)=>res.json(dryRun(store,req.params.id)));
  app.post('/api/automation-alerts/:id/dismiss',(req,res)=>{const alert=store.get('automationAlerts',req.params.id);if(!alert)throw new Error('Alert not found.');res.json(store.put('automationAlerts',{...alert,dismissed:true,dismissedAt:new Date().toISOString()}));});
  app.put('/api/modules',async(req,res)=>{const {MODULES}=await import('../public/modules.js');const keys=MODULES.map(m=>m.key),input=req.body||{};for(const [k,v] of Object.entries(input))if(!keys.includes(k)||typeof v!=='boolean')throw new Error('Unknown module setting.');const modules={...(store.settings().modules||{}),...input};store.setting('modules',modules);store.log('Changed workspace modules','You');res.json(modules);});
  app.get('/api/portfolio',(req,res)=>res.json(portfolio(store)));
  app.post('/api/project-templates/:id/publish',(req,res)=>res.json(publishTemplate(store,req.params.id,req.body||{})));
  app.post('/api/prospects/:id/win',(req,res)=>{const result=winProspect(store,req.params.id,req.body||{});store.emit('ui',{action:'records_changed',collection:'projects'});res.json(result);});
  app.get('/api/projects/:id/template-update',(req,res)=>res.json(templateUpdate(store,req.params.id)));
  app.post('/api/projects/:id/template-update',(req,res)=>res.json(applyTemplateUpdate(store,req.params.id,req.body?.versionId)));
  app.post('/api/delivery-runs',(req,res)=>res.json(deliveryRuns.start(req.body||{})));
  app.post('/api/delivery-runs/:id/resume',(req,res)=>res.json(deliveryRuns.resume(req.params.id)));
  app.post('/api/delivery-runs/:id/cancel',(req,res)=>res.json(deliveryRuns.cancel(req.params.id)));
  app.post('/api/delivery-runs/:id/complete',(req,res)=>res.json(deliveryRuns.complete(req.params.id)));
  app.post('/api/delivery-runs/:id/plans/:planId/approve',(req,res)=>res.json(deliveryRuns.approve(req.params.id,req.params.planId)));
  app.post('/api/delivery-runs/:id/plans/:planId/reject',(req,res)=>res.json(deliveryRuns.reject(req.params.id,req.params.planId,req.body?.reason)));
  app.get('/api/github/status',async(req,res)=>res.json(await github.status()));
  app.put('/api/github/token',async(req,res)=>res.json(await github.saveToken(req.body?.token)));
  app.delete('/api/github/token',async(req,res)=>res.json(await github.removeToken()));
  app.post('/api/repositories/:id/verify',async(req,res)=>res.json(await delivery.verifyRepository(req.params.id)));
  app.post('/api/ticket-links/:id/sync',async(req,res)=>res.json(await delivery.syncLink(req.params.id)));
  app.post('/api/ticket-links/:id/evidence',(req,res)=>res.json(delivery.importEvidence(req.params.id)));
  app.post('/api/environments/:id/check',async(req,res)=>res.json(await delivery.checkEnvironment(req.params.id)));
  app.post('/api/environments/:id/deployment',async(req,res)=>res.json(await delivery.syncDeployment(req.params.id)));
  app.post('/api/projects/:id/standard/revisions',(req,res)=>res.json(approveStandardRevision(store,req.params.id,req.body||{})));
  app.post('/api/prds/:id/revisions',(req,res)=>res.json(approvePrdRevision(store,req.params.id,req.body||{})));
  app.post('/api/clients/:id/invoice-time',(req,res)=>res.json(invoiceUnbilledTime(store,req.params.id)));
  app.post('/api/retainers/:id/invoice',(req,res)=>res.json(invoiceRetainer(store,req.params.id,(req.body||{}).month||'')));
  app.post('/api/proposals/:id/accept',(req,res)=>res.json(acceptProposal(store,req.params.id)));
  app.post('/api/designs/:id/revisions',(req,res)=>res.json(approveDesignRevision(store,req.params.id,req.body||{})));
  app.post('/api/records/:collection',(req,res)=>res.json(saveRecord(store,req.params.collection,req.body)));
  app.put('/api/records/:collection/:id',(req,res)=>res.json(saveRecord(store,req.params.collection,req.body,req.params.id)));
  app.delete('/api/records/:collection/:id',(req,res)=>{deleteRecord(store,req.params.collection,req.params.id);res.json({ok:true});});
  app.put('/api/favourites',(req,res)=>{const {kind,id,on}=req.body||{};if(!['projects','clients'].includes(kind)||typeof id!=='string'||!store.get(kind,id))throw new Error('Choose an existing project or client.');const current=(store.settings().favourites||[]).filter(f=>store.get(f.kind,f.id)&&!(f.kind===kind&&f.id===id));if(on===true){if(current.length>=12)throw new Error('Pin up to 12 favourites.');current.unshift({kind,id});}store.setting('favourites',current);res.json(current);});
  app.put('/api/settings',(req,res)=>{
    for(const key of Object.keys(req.body))if(!['microsoftClientId','microsoftTenant','publicBaseUrl'].includes(key))return res.status(400).json({error:'Unsupported setting'});
    if(req.body.microsoftClientId&&!/^[a-f0-9-]{36}$/i.test(req.body.microsoftClientId))throw new Error('Enter a valid Microsoft application ID');
    if(req.body.microsoftTenant&&!/^[a-z0-9.-]+$/i.test(req.body.microsoftTenant))throw new Error('Enter a valid Microsoft tenant');
    if(req.body.publicBaseUrl){const url=new URL(req.body.publicBaseUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Use an HTTPS base URL without a path or credentials');req.body.publicBaseUrl=url.origin;}
    for(const[k,v]of Object.entries(req.body))store.setting(k,v);res.json({ok:true});
  });
  app.post('/api/chatgpt/authorize',async(req,res)=>res.json(await chatgpt.authorize()));
  app.get('/api/chatgpt/models',async(req,res)=>res.json(await chatgpt.models()));
  app.put('/api/chatgpt/model',async(req,res)=>{if(typeof req.body.model!=='string')throw new Error('Choose an available model');const models=await chatgpt.models();if(!models.some(m=>m.slug===req.body.model))throw new Error('Choose a model available to your account');store.setting('gptModel',req.body.model);res.json({ok:true});});
  app.get('/api/claude/usage',async(req,res)=>{const live=await claude.usage(req.query.refresh==='true');if(live.available)return res.json(live);const value=store.get('claudeUsage','current');res.json(value?{available:true,source:'Claude plan',note:'Last figures Claude reported while replying.',fiveHour:value.five_hour||null,weekly:value.seven_day||null,updatedAt:value.updatedAt,reason:live.reason}:live);});
  app.post('/api/claude/sign-in',async(req,res)=>res.json(await claude.signIn({switchAccount:req.body?.switchAccount===true})));
  app.post('/api/claude/sign-out',async(req,res)=>res.json(await claude.signOut()));
  app.post('/api/chatgpt/disconnect',async(req,res)=>res.json(await chatgpt.disconnect()));
  app.get('/api/assistant/models',async(req,res)=>{if(!['GPT','Codex','Claude'].includes(req.query.engine))throw new Error('Choose GPT, Claude or Codex');if(req.query.engine==='Claude')return res.json(claude.models());res.json(req.query.engine==='Codex'?await codexModels.read(req.query.refresh==='true'):await chatgpt.models());});
  app.put('/api/assistant/model',async(req,res)=>{
    const {engine,model}=req.body;if(!['GPT','Codex','Claude'].includes(engine)||typeof model!=='string')throw new Error('Choose an available model');
    if(store.get('assistantState','current')?.busy)throw new Error('Wait for the current reply before changing models.');
    const models=engine==='Claude'?claude.models():engine==='Codex'?await codexModels.read():await chatgpt.models();if(!(engine!=='GPT'&&model==='')&&!models.some(m=>m.slug===model))throw new Error('Choose a model available to this connection');
    store.setting(engine==='Codex'?'codexModel':engine==='Claude'?'claudeModel':'gptModel',model);res.json({ok:true,model});
  });
  app.get('/auth/chatgpt/callback',async(req,res,next)=>{if(!localHost(req))return res.status(403).send('Finish sign-in on this Mac');try{await chatgpt.callback(req.query);store.setting('chatgptError','');res.redirect(baseUrl+'/#connections');}catch(error){store.setting('chatgptError',error.message.slice(0,2000));res.redirect(baseUrl+'/#connections');}});
  app.get('/api/contacts',(req,res)=>{const query=String(req.query.query||'').toLowerCase();const contacts=[...store.list('contacts'),...store.list('clients').filter(c=>c.email).map(c=>({...c,source:'Client'}))];res.json(contacts.filter(c=>[c.name,c.email,c.company].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)).filter((c,i,list)=>list.findIndex(v=>v.email.toLowerCase()===c.email.toLowerCase())===i).slice(0,50));});
  app.get('/api/finance',(req,res)=>res.json(financeSummary(store,{clientId:String(req.query.clientId||''),projectId:String(req.query.projectId||'')})));
  app.post('/api/prospects/:id/convert',async(req,res)=>res.json(await actions.execute('convert_prospect_to_client',{prospectId:req.params.id},'You')));
  app.post('/api/media',express.raw({type:()=>true,limit:'100mb'}),(req,res)=>res.json(saveMedia(store,directory,{name:decodeURIComponent(req.headers['x-vareon-filename']||'Media'),type:req.headers['content-type'],role:req.headers['x-vareon-role'],bytes:req.body})));
  app.get('/api/media/:id/file',(req,res)=>{const item=store.get('media',req.params.id);if(!item||!/^[a-f0-9-]{36}$/i.test(item.id))return res.status(404).end();res.set({'Content-Type':item.contentType,'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'Content-Disposition':'inline'});res.sendFile(resolve(directory,'media',item.id));});
  app.post('/api/previews',async(req,res)=>res.json(actions.previews.open(req.body)));
  app.get('/build-preview/:id/:token/{*path}',(req,res,next)=>{if(!localHost(req)||!actions.previews.authorised(req.params.id,req.params.token))return res.status(403).send('Open this preview from your local dashboard');try{res.set({'Content-Security-Policy':`default-src 'none'; script-src http://localhost:${port} http://127.0.0.1:${port} 'unsafe-inline'; style-src http://localhost:${port} http://127.0.0.1:${port} 'unsafe-inline'; img-src http://localhost:${port} http://127.0.0.1:${port} data: https:; font-src http://localhost:${port} http://127.0.0.1:${port} data:; media-src http://localhost:${port} http://127.0.0.1:${port} blob:; connect-src 'none'; form-action 'none'; sandbox allow-scripts`});res.sendFile(actions.previews.resolve(req.params.id,(req.params.path||[]).join('/')));}catch(error){next(error);}});
  app.post('/api/assistant',async(req,res)=>{const{prompt,engine='GPT',projectId='',conversationId='',uiContext={},fileIds=[]}=req.body;if(typeof prompt!=='string'||!prompt.trim()||prompt.length>20000||!['GPT','Codex','Claude'].includes(engine)||typeof projectId!=='string'||typeof conversationId!=='string'||conversationId.length>100||JSON.stringify(uiContext).length>5000||!Array.isArray(fileIds)||fileIds.length>100||fileIds.some(id=>typeof id!=='string'||id.length>100))throw new Error('Enter a valid assistant message');res.json(await assistant.chat(prompt.trim(),engine,{projectId,conversationId,uiContext,fileIds}));});
  app.post('/api/conversations',(req,res)=>{if(store.get('assistantState','current')?.busy)throw new Error('Wait for the current reply or stop it before starting a new chat.');res.json(assistant.conversations.create(req.body.engine,req.body.projectId||''));});
  app.post('/api/conversations/:id/select',(req,res)=>{if(store.get('assistantState','current')?.busy)throw new Error('Wait for the current reply or stop it before switching chats.');res.json(assistant.conversations.select(req.params.id));});
  app.post('/api/assistant/stop',(req,res)=>{assistant.cancel();res.json({ok:true});});
  app.get('/api/memory',(req,res)=>{const projectId=String(req.query.projectId||'');res.json(req.query.filename?actions.memory.read(String(req.query.filename),projectId):actions.memory.list(projectId));});
  app.put('/api/memory',(req,res)=>{const{filename,content,projectId='',expectedRevision}=req.body;const result=actions.memory.write(filename,content,projectId,expectedRevision);store.emit('ui',{action:'memory_changed',filename,projectId});res.json(result);});
  app.post('/api/editor/:id/take-over',(req,res)=>{const draft=store.get('liveDrafts',req.params.id);if(!draft||draft.status!=='Open')throw new Error('The editor is no longer active');store.put('liveDrafts',{...draft,status:'Handed over'});assistant.cancel();store.emit('ui',{action:'editor_handed_over',draftId:draft.id});res.json({ok:true});});
  app.post('/api/outlook/authorize',async(req,res)=>res.json({url:await outlook.authorize()}));
  app.get('/auth/outlook/callback',async(req,res,next)=>{if(!localHost(req))return res.status(403).send('Open this sign-in from your Mac.');try{await outlook.callback(req.query);store.setting('outlookError','');res.redirect(baseUrl+'/#inbox');}catch(error){store.setting('outlookError',error.message.slice(0,2000));res.redirect(baseUrl+'/#connections');}});
  app.post('/api/outlook/sync',async(req,res)=>res.json(await mailSync.sync(req.body.folderId||'')));
  app.post('/api/outlook/auto-sync',async(req,res)=>res.json(await mailSync.automatic(req.body.reason==='due'?'due':'load')));
  app.post('/api/outlook/disconnect',async(req,res)=>{await outlook.disconnect();res.json({ok:true});});
  app.post('/api/outlook/contacts/sync',async(req,res)=>res.json(await outlook.syncContacts()));
  app.post('/api/outlook/folders',async(req,res)=>res.json(await outlook.createFolder(req.body.name)));
  app.post('/api/outlook/move',async(req,res)=>res.json(await outlook.moveEmail(req.body.emailId,req.body.folderId)));
  app.patch('/api/emails/:id/read',async(req,res)=>res.json(await outlook.markRead(req.params.id,req.body.isRead)));
  app.post('/api/emails/:id/trash',async(req,res)=>res.json(await outlook.trash(req.params.id)));
  async function sendEmail(id,payload) {
    const email=store.get('emails',id);if(!email||email.status!=='Draft')throw new Error('This email is no longer a draft');
    if(!store.settings().outlookConnected)throw new Error('Connect Outlook before sending emails. Your draft is saved.');
    if(!email.to)throw new Error('Add a recipient before sending.');
    buildEmailHTML(email,store.settings());
    if(payload && ['to','cc','bcc','subject','body','bodyHtml','attachmentIds'].some(key=>JSON.stringify(email[key])!==JSON.stringify(payload[key])))throw new Error('The draft changed since the approval was requested. Review the updated draft first.');
    const attachments=(email.attachmentIds||[]).map(id=>{const file=store.get('attachments',id);if(!file||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('An attachment is missing');return {'@odata.type':'#microsoft.graph.fileAttachment',name:file.name,contentType:file.contentType,contentBytes:readFileSync(resolve(directory,'attachments',id)).toString('base64')};});
    graphEmail(email,store.settings(),attachments); // Validate the complete message before locking the draft.
    // Persist before making the request: ambiguous network failures cannot be auto-retried.
    store.put('emails',{...email,status:'Sending'});
    try{await outlook.send(email,attachments);const sentAt=new Date().toISOString();store.put('emails',{...email,status:'Sent',sentAt});store.log(`Sent email: ${email.subject}`);if(email.prospectId&&!['Won','Lost'].includes(store.get('prospects',email.prospectId)?.status)){try{followUps.update(email.prospectId,{action:'log',kind:'Followed up',occurredAt:sentAt,note:'Follow-up email accepted by Outlook.'},'Outlook');}catch(error){store.log('Email sent; prospect reminder needs updating: '+error.message);}}return {accepted:true};}
    catch(error){store.put('emails',{...email,status:'Send uncertain',sendError:error.message});throw new Error(`${error.message} Check Outlook Sent Items before sending again. This draft is locked to prevent a duplicate.`);}
  }
  app.post('/api/emails/:id/send',async(req,res)=>res.json(await sendEmail(req.params.id)));
  app.post('/api/approvals/:id',async(req,res)=>res.json(await reviews.resolve(req.params.id,req.body,{
    email:a=>sendEmail(a.entityId,a.payload),undo:a=>actionHistory.undo(a.payload.changeId),
    connector:async a=>{const result=await connectors.runApproved(a.connectorId,a.payload.toolName,a.payload.arguments);store.put('messages',{role:'assistant',engine:'GPT',conversationId:assistant.conversations.ensure('GPT').id,content:`Connector action completed: ${a.title}\n${JSON.stringify(result).slice(0,12000)}`});return result;}
  })));
  app.post('/api/automations/:id/run',(req,res)=>{const job=store.get('automations',req.params.id);if(!job||job.running)throw new Error('Automation unavailable or already running');scheduler.runJob(job.id,true).catch(error=>console.error('Automation failed:',error.message));res.status(202).json({started:true});});
  app.get('/api/export',(req,res)=>res.json({version:3,planning:{workload:store.get('workloadSettings','current'),forecast:store.get('forecastSettings','current')},reports:store.list('clientReports'),history:store.list('changes'),exportedAt:new Date().toISOString(),business:snapshot(store),memory:{workspace:actions.memory.list().map(f=>actions.memory.read(f.filename)),projects:store.list('projects').map(p=>({projectId:p.id,files:actions.memory.list(p.id).map(f=>actions.memory.read(f.filename,p.id))}))}}));
  const {mountMcp}=await import('./mcp.mjs');await mountMcp(app,store,actions,{localHost,baseUrl});
  app.get('/api/health',(req,res)=>res.json({ok:true}));
  const listeners=new Set();
  app.get('/api/events',(req,res)=>{res.set({'Content-Type':'text/event-stream','Connection':'keep-alive'});res.flushHeaders();res.write('data: ready\n\n');const previous=Number(req.headers['last-event-id']);res.vareonCursor=Number.isSafeInteger(previous)&&previous>0?Math.min(previous,store.latestSequence()):store.latestSequence();listeners.add(res);req.on('close',()=>listeners.delete(res));});
  let heartbeat=0;const eventPump=setInterval(()=>{for(const res of listeners){for(const event of store.eventsAfter(res.vareonCursor)){res.write(`id: ${event.sequence}\nevent: workspace\ndata: ${JSON.stringify({type:event.type,data:event.data})}\n\n`);res.vareonCursor=event.sequence;}if(heartbeat%80===0)res.write(': heartbeat\n\n');}heartbeat++;},200);
  const watcher=watch(resolve(root,'public'),()=>{for(const res of listeners)res.write('data: reload\n\n');});
  app.use((req,res,next)=>{if(!localHost(req))return res.status(403).send('This dashboard is accessible only on its Mac.');if(!cookieOK(req))res.cookie(cookieName,session,{httpOnly:true,sameSite:'strict',secure:access.remote(req),path:'/'});next();});
  app.use(express.static(resolve(root,'public'),{etag:false}));
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const message=error.issues?error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):error.message;res.status(400).json({error:message||'Request failed'});});
  let timer;if(!options.noScheduler){const tick=async()=>{if(backups.busy||meetingAnalysis)return;try{await backups.tick();if(backups.busy||meetingAnalysis)return;await scheduler.tick();await reports.tick();scanRules(store);}catch(e){console.error(e.message);}};timer=setInterval(tick,15000);reports.tick().catch(e=>console.error(e.message));backups.tick().catch(e=>console.error(e.message));mailSync.start();}
  return {app,store,actions,scheduler,mailSync,backups,close(){mailSync.stop();clearInterval(timer);clearInterval(eventPump);watcher.close();for(const res of listeners)res.end();connectors.close();store.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const runtime=await createApp();const port=Number(process.env.PORT||4317);
  const server=runtime.app.listen(port,'127.0.0.1',()=>console.log(`VareonHQ is ready at http://localhost:${port}`));
  server.on('error',error=>{console.error(error.message);runtime.close();process.exitCode=1;});
  const shutdown=()=>{runtime.close();server.close(()=>process.exit(0));};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
