// Parse partial tool arguments for a read-only form preview. Never execute them.
export function partialJSON(source) {
  let i=0;
  const whitespace=()=>{while(/\s/.test(source[i]||'')&&i<source.length)i++;};
  function string(){i++;let value='';while(i<source.length){const c=source[i++];if(c==='"')return value;if(c==='\\'){if(i>=source.length)return value;const escape=source[i++];if(escape==='u'){const digits=source.slice(i,i+4);if(!/^[a-f\d]{4}$/i.test(digits))return value;value+=String.fromCharCode(parseInt(digits,16));i+=4;}else value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','"':'"','\\':'\\','/':'/'})[escape]??escape;}else value+=c;}return value;}
  function value(){whitespace();const c=source[i];if(c==='"')return string();if(c==='{'){i++;const result={};while(i<source.length){whitespace();if(source[i]==='}'){i++;break;}if(source[i]!== '"')break;const key=string();whitespace();if(source[i++]!==':')break;const item=value();if(!['__proto__','constructor','prototype'].includes(key)&&item!==undefined)result[key]=item;whitespace();if(source[i]!==',')break;i++;}return result;}if(c==='['){i++;const result=[];while(i<source.length){whitespace();if(source[i]===']'){i++;break;}const item=value();if(item!==undefined)result.push(item);whitespace();if(source[i]!==',')break;i++;}return result;}const match=source.slice(i).match(/^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(match){i+=match[0].length;return JSON.parse(match[0]);}return undefined;}
  try{return value();}catch{return undefined;}
}
export async function readResponseStream(response,onEvent) {
  function fail(detail={}){
    const code=detail.code||'',messages={
      subscription_sharing_usage_limit_exceeded:'Your ChatGPT plan-sharing allowance has been reached. Check ChatGPT Settings → Usage (https://chatgpt.com/#settings/Usage) and try again when allowance is available. Your sign-in is still connected. You can also select Codex, which has its own usage limits.',
      subscription_sharing_usage_unavailable:'ChatGPT cannot check your plan-sharing allowance right now. Your sign-in is saved. Try again later.',
      subscription_sharing_user_not_eligible:'ChatGPT plan usage is unavailable for this account or workspace. Check your ChatGPT account settings. Your sign-in is saved.',
      subscription_sharing_unsupported_capability:'This ChatGPT connection does not support part of the request'+(detail.param?' ('+detail.param+')':'')+'. Try another available model or use Codex.'
    };
    const error=new Error(messages[code]||detail.message||`GPT request failed (${response.status})`);error.code=code;error.status=response.status;error.requestId=response.headers.get('x-request-id')||'';throw error;
  }
  // Detect the body itself: proxies can omit or mislabel the stream Content-Type.
  // In particular, an event stream labelled application/json is still an event stream.
  const reader=response.body.getReader(),decoder=new TextDecoder(),items=new Map();
  let buffer='',mode='',completed,eventName='',dataLines=[];
  function dispatch(){
    if(!dataLines.length){eventName='';return;}
    const text=dataLines.join('\n');dataLines=[];
    if(text.trim()==='[DONE]'){eventName='';return;}
    let event;try{event=JSON.parse(text);}catch{throw new Error('ChatGPT returned an unreadable stream event. Your saved work is preserved. Try again.');}
    if(!event.type&&eventName)event.type=eventName;eventName='';onEvent(event);
    if(event.type==='response.output_item.done'&&event.item)items.set(event.output_index,event.item);
    if(event.type==='response.failed'||event.type==='error'||event.error)fail(event.response?.error||event.error||event);
    if(event.type==='response.incomplete')throw new Error('GPT stopped before finishing. Review the open draft before continuing.');
    if(event.type==='response.completed')completed=event.response;
  }
  function line(value){
    if(value===''){dispatch();return;}
    if(value.startsWith('event:'))eventName=value.slice(6).trim();
    if(value.startsWith('data:'))dataLines.push(value.slice(5).replace(/^ /,''));
  }
  function drain(){let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);}}
  function ingest(text){buffer+=text;if(!mode){buffer=buffer.replace(/^\uFEFF/,'');const start=buffer.trimStart();if(!start)return;
      if(start[0]==='{'||start[0]==='[')mode='json';
      else if(/^(event:|data:|:|id:|retry:)/.test(start)){mode='sse';buffer=start;}
      else if(start.length>256)throw new Error('ChatGPT returned an unexpected response. Your sign-in and saved work are preserved. Try again later.');
    }if(mode==='sse')drain();if(buffer.length>8000000)throw new Error('The ChatGPT response was too large to read safely.');}
  try{
    while(!completed){const {done,value}=await reader.read();if(done)break;ingest(decoder.decode(value,{stream:true}));}
    ingest(decoder.decode());
    if(mode==='json'){
      let result;try{result=JSON.parse(buffer);}catch{throw new Error('ChatGPT returned unreadable response data. Your saved work is preserved. Try again.');}
      if(!response.ok||result.error)fail(result.error||{message:typeof result.detail==='string'?result.detail:''});return result;
    }
    if(buffer.trim())line(buffer.trimEnd());dispatch();
    if(!completed)throw new Error('The GPT connection ended before the response completed. Your saved records are intact.');
    return {...completed,output:completed.output?.length?completed.output:[...items.entries()].sort((a,b)=>a[0]-b[0]).map(([,item])=>item)};
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
