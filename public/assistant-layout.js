export function assistantBounds(viewport){
  return {min:Math.min(300,viewport-60),max:Math.max(Math.min(300,viewport-60),Math.min(680,viewport-(viewport>=1200?200:60)-(viewport>=950?420:0)))};
}
export function clampAssistantWidth(value,viewport){const {min,max}=assistantBounds(viewport);return Math.round(Math.max(min,Math.min(max,Number.isFinite(value)?value:380)));}
export function bindAssistantLayout(){
  // The composer grows on both the side panel and the chat page; only the side panel can be resized.
  const input=document.querySelector('#chat-input');if(input){const grow=()=>{input.style.height='auto';input.style.height=Math.min(128,Math.max(64,input.scrollHeight))+'px';};input.addEventListener('input',grow);grow();}
  const handle=document.querySelector('.assistant-resize-handle'),panel=document.querySelector('.assistant');if(!handle||!panel)return;
  const stored=Number(localStorage.getItem('vareon-assistant-width'))||380;
  const apply=(width,save=false)=>{width=clampAssistantWidth(width,innerWidth);document.documentElement.style.setProperty('--assistant-width',width+'px');const bounds=assistantBounds(innerWidth);handle.setAttribute('aria-valuemin',bounds.min);handle.setAttribute('aria-valuemax',bounds.max);handle.setAttribute('aria-valuenow',width);if(save)localStorage.setItem('vareon-assistant-width',width);};
  apply(stored);
  let startX,startWidth;
  handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();startX=e.clientX;startWidth=panel.getBoundingClientRect().width;handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-assistant');};
  handle.onpointermove=e=>{if(handle.hasPointerCapture(e.pointerId))apply(startWidth+startX-e.clientX);};
  handle.onpointerup=e=>{if(!handle.hasPointerCapture(e.pointerId))return;handle.releasePointerCapture(e.pointerId);apply(panel.getBoundingClientRect().width,true);document.body.classList.remove('resizing-assistant');};
  handle.onlostpointercapture=handle.onpointercancel=()=>document.body.classList.remove('resizing-assistant');
  handle.ondblclick=()=>apply(380,true);
  handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();apply(e.key==='Home'?300:e.key==='End'?assistantBounds(innerWidth).max:panel.getBoundingClientRect().width+(e.key==='ArrowLeft'?1:-1)*(e.shiftKey?40:16),true);};
}
