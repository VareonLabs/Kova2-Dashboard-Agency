import {createHash,randomBytes,randomUUID,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {saveIndustryProfile,industryProfileSchema} from './industry-profile.mjs';

const scrypt=promisify(rawScrypt),HASH_BYTES=64,SESSION_DAYS=30,SHORT_SESSION_HOURS=12;
const digest=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>{const left=Buffer.from(String(a||''),'hex'),right=Buffer.from(String(b||''),'hex');return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);};
const emailValue=value=>String(value||'').trim().toLowerCase();
const display=value=>({id:value.id,name:value.name,email:value.email});
const authError=(message,status=400)=>Object.assign(new Error(message),{status});

async function passwordHash(password,salt){return (await scrypt(password,salt,HASH_BYTES,{N:16384,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
function validPassword(password){return typeof password==='string'&&password.length>=10&&password.length<=128;}
function recoveryCode(){const chars=randomBytes(16).toString('hex').toUpperCase();return `VHQ-${chars.match(/.{1,4}/g).join('-')}`;}
function normalizeRecovery(value){return String(value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();}

export function createLocalAuth(store){
  const attempts=new Map();
  const accounts=()=>store.list('localAccounts');
  const account=()=>accounts()[0]||null;

  function sessionFor(token){
    if(!token||token.length>200)return null;
    const session=store.get('authSessions',digest(token));
    if(!session||Date.parse(session.expiresAt)<=Date.now()){
      if(session)store.remove('authSessions',session.id);
      return null;
    }
    const owner=store.get('localAccounts',session.accountId);
    return owner?{session,owner}:null;
  }
  function status(token){
    const owner=account(),active=sessionFor(token);
    return {accountExists:!!owner,authenticated:!!active,account:active?display(active.owner):null};
  }
  function startSession(owner,rememberMe){
    const raw=randomBytes(32).toString('base64url'),now=Date.now(),hours=rememberMe?SESSION_DAYS*24:SHORT_SESSION_HOURS;
    const value={id:digest(raw),tokenHash:digest(raw),accountId:owner.id,rememberMe:!!rememberMe,expiresAt:new Date(now+hours*60*60*1000).toISOString()};
    store.put('authSessions',value);
    return {token:raw,maxAge:rememberMe?SESSION_DAYS*24*60*60:undefined};
  }
  function checkRate(key){const item=attempts.get(key);if(item&&item.blockedUntil>Date.now())throw authError('Too many attempts. Wait 15 minutes, then try again.',429);}
  function failed(key){const item=attempts.get(key)||{count:0,blockedUntil:0};item.count++;if(item.count>=5){item.count=0;item.blockedUntil=Date.now()+15*60*1000;}attempts.set(key,item);}
  function succeeded(key){attempts.delete(key);}
  function credentialError(){return authError('That email and password do not match.',401);}

  return {
    status,
    async signup(input={}){
      if(account())throw authError('An owner account already exists on this workspace.',409);
      const name=String(input.name||'').trim(),email=emailValue(input.email),businessName=String(input.businessName||'').trim(),password=input.password;
      if(name.length<2||name.length>100)throw authError('Enter your name.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw authError('Enter a valid email address.');
      if(businessName.length<2||businessName.length>120)throw authError('Enter your business name.');
      if(!validPassword(password))throw authError('Use a password between 10 and 128 characters.');
      if(password!==input.confirmPassword)throw authError('The passwords do not match.');
      const profile={...(input.profile||{}),modules:input.profile?.modules||{sales:true,inbox:true,marketing:true,finance:true,meetings:true,software:true,automation:true}};
      const parsed=industryProfileSchema.safeParse(profile);
      if(!parsed.success)throw authError(parsed.error.issues[0]?.message||'Check your industry setup.');
      if(accounts().some(item=>item.email===email))throw authError('An account with this email already exists.',409);
      const salt=randomBytes(16).toString('hex'),recoverySalt=randomBytes(16).toString('hex'),code=recoveryCode(),id=randomUUID();
      const [hash,recoveryHash]=await Promise.all([passwordHash(password,salt),passwordHash(normalizeRecovery(code),recoverySalt)]);
      const owner={id,name,email,passwordSalt:salt,passwordHash:hash,recoverySalt,recoveryHash,createdAt:new Date().toISOString()};
      store.db.exec('SAVEPOINT local_signup');
      try{
        saveIndustryProfile(store,parsed.data,{completeSetup:true});
        const current=store.settings().profile||{};
        store.setting('profile',{...current,businessName});
        store.setting('businessName',businessName);
        store.put('localAccounts',owner);
        store.db.exec('RELEASE local_signup');
      }catch(error){store.db.exec('ROLLBACK TO local_signup');store.db.exec('RELEASE local_signup');throw error;}
      return {account:display(owner),recoveryCode:code,session:startSession(owner,!!input.rememberMe)};
    },
    async login(input={},attemptKey='local'){
      checkRate(attemptKey);
      const owner=account(),email=emailValue(input.email),password=String(input.password||'');
      if(!owner||owner.email!==email||!same(await passwordHash(password,owner.passwordSalt||''),owner.passwordHash||'')){failed(attemptKey);throw credentialError();}
      succeeded(attemptKey);
      return {account:display(owner),session:startSession(owner,!!input.rememberMe)};
    },
    async reset(input={}){
      const owner=account(),email=emailValue(input.email),password=input.password,recovery=normalizeRecovery(input.recoveryCode);
      if(!owner||owner.email!==email||!recovery){throw authError('The email or recovery key does not match.',401);}
      if(!validPassword(password))throw authError('Use a password between 10 and 128 characters.');
      if(password!==input.confirmPassword)throw authError('The passwords do not match.');
      const hash=await passwordHash(recovery,owner.recoverySalt||'');
      if(!same(hash,owner.recoveryHash||''))throw authError('The email or recovery key does not match.',401);
      const salt=randomBytes(16).toString('hex'),nextHash=await passwordHash(password,salt);
      const updated={...owner,passwordSalt:salt,passwordHash:nextHash};
      store.put('localAccounts',updated);
      for(const session of store.list('authSessions'))if(session.accountId===owner.id)store.remove('authSessions',session.id);
      return {account:display(updated),session:startSession(updated,true)};
    },
    logout(token){const active=sessionFor(token);if(active)store.remove('authSessions',active.session.id);return {ok:true};},
    tokenAccount:sessionFor
  };
}
