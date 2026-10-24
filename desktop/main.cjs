const { app,BrowserWindow,Menu,dialog,shell }=require('electron');
const { spawn }=require('node:child_process');
const { join,resolve }=require('node:path');
const { existsSync,mkdirSync,cpSync,appendFileSync }=require('node:fs');
app.setName('VareonHQ');
let window,backend,ownsBackend=false;
const dashboardPort='4320';
const baseUrl='http://localhost:'+dashboardPort;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
async function ensureServer(){
  try{const response=await fetch(baseUrl,{signal:AbortSignal.timeout(1500)});const html=await response.text();if(response.ok&&html.includes('VareonHQ'))return;}catch{}
  const root=app.isPackaged?join(process.resourcesPath,'app'):resolve(__dirname,'..');
  const metadata=require(join(root,'package.json'));
  const data=join(app.getPath('userData'),'business-data');
  if(!existsSync(data)){mkdirSync(data,{recursive:true,mode:0o700});const legacy=metadata.vareonLegacyDataDir;if(legacy&&existsSync(legacy))cpSync(legacy,data,{recursive:true,errorOnExist:false});}
  const node=app.isPackaged?join(process.resourcesPath,'node'):metadata.vareonNodePath;
  if(!node||!existsSync(node))throw new Error('The app’s bundled Node runtime is missing. Rebuild VareonHQ.');
  const log=join(app.getPath('userData'),'app.log');
  backend=spawn(node,[join(root,'server/server.mjs')],{cwd:root,env:{...process.env,PORT:dashboardPort,VAREON_DATA_DIR:data,VAREON_KEYCHAIN_HELPER:app.isPackaged?join(process.resourcesPath,'keychain-helper'):join(root,'build-resources/keychain-helper')},stdio:['ignore','pipe','pipe']});ownsBackend=true;
  backend.stdout.on('data',value=>appendFileSync(log,value));backend.stderr.on('data',value=>appendFileSync(log,value));
  backend.on('error',error=>dialog.showErrorBox('VareonHQ could not start',error.message));
  for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(baseUrl,{signal:AbortSignal.timeout(500)});if(response.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}
  throw new Error('The local dashboard did not start. Open VareonHQ/app.log in Application Support for details.');
}
async function createWindow(){
  await ensureServer();
  window=new BrowserWindow({title:'VareonHQ',width:1512,height:980,minWidth:900,minHeight:650,backgroundColor:'#f3f5f7',titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:15},webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==baseUrl){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>{callback(permission==='media'&&new URL(contents.getURL()).origin===baseUrl&&details.mediaTypes?.every(type=>type==='audio'));});
  window.webContents.on('did-finish-load',()=>window.webContents.insertCSS('body{--desktop-titlebar:36px;padding-top:36px}.desktop-titlebar{height:36px;position:fixed;top:0;left:0;right:0;z-index:200;background:#f3f5f7;-webkit-app-region:drag}body:before{content:"";height:36px;position:fixed;top:0;left:0;right:0;z-index:200;background:#f3f5f7;-webkit-app-region:drag}'));
  await window.loadURL(baseUrl);window.on('closed',()=>window=null);
}
app.whenReady().then(async()=>{
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'VareonHQ',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'forceReload'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},{role:'windowMenu'}]));
  try{await createWindow();}catch(error){dialog.showErrorBox('VareonHQ',error.message);app.quit();}
});
app.on('activate',()=>{if(window){window.show();window.focus();}else createWindow().catch(error=>dialog.showErrorBox('VareonHQ',error.message));});
app.on('before-quit',()=>{if(ownsBackend)backend?.kill('SIGTERM');});
