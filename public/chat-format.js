const escape=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanChatText(value=''){
  return String(value).replace(/\uE200[^\uE201]*\uE201/g,'').replace(/\uE200[^\uE201]*$/g,'').replace(/[\uE201-\uE203]/g,'');
}
function safeURL(value){try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function normaliseCitations(text='',annotations=[]){
  let content='',cursor=0;const citations=[],sources=[];
  const entries=annotations.filter(a=>a.type==='url_citation'&&safeURL(a.url)).sort((a,b)=>a.start_index-b.start_index);
  for(const entry of entries){
    const url=safeURL(entry.url);if(!sources.includes(url))sources.push(url);
    const start=entry.start_index,end=entry.end_index;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<cursor||end<=start||end>text.length)continue;
    content+=cleanChatText(text.slice(cursor,start));
    const title=cleanChatText(entry.title||new URL(url).hostname).slice(0,180),label=cleanChatText(text.slice(start,end)).trim()||`[${title}]`;
    const index=content.length;content+=label;citations.push({start_index:index,end_index:content.length,url,title});cursor=end;
  }
  content+=cleanChatText(text.slice(cursor));return {content,citations,sources};
}
function plainHTML(text){
  text=cleanChatText(text);let result='',cursor=0;
  const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"']+/g;
  for(const match of text.matchAll(pattern)){
    result+=escape(text.slice(cursor,match.index));const href=safeURL(match[2]||match[0]);
    result+=href?`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(match[1]||match[0])}</a>`:escape(match[0]);cursor=match.index+match[0].length;
  }
  return result+escape(text.slice(cursor));
}
function citationHTML(message=''){
  const text=typeof message==='string'?message:String(message.content||'');let result='',cursor=0;
  const citations=typeof message==='object'?message.citations||[]:[];
  for(const citation of [...citations].sort((a,b)=>a.start_index-b.start_index)){
    const {start_index:start,end_index:end}=citation,href=safeURL(citation.url);
    if(!href||!Number.isInteger(start)||!Number.isInteger(end)||start<cursor||end<=start||end>text.length)continue;
    result+=plainHTML(text.slice(cursor,start));result+=`<a class="chat-citation" href="${escape(href)}" title="${escape(citation.title||new URL(href).hostname)}" target="_blank" rel="noopener noreferrer">${escape(cleanChatText(text.slice(start,end))||citation.title||new URL(href).hostname)}</a>`;cursor=end;
  }
  return result+plainHTML(text.slice(cursor));
}

// Render a small, escaped presentation layer. Raw HTML is always displayed as text.
export function renderChatContent(message='') {
  if(typeof message==='object'&&message.role==='user')return citationHTML(message);
  const original=typeof message==='string'?message:String(message.content||'');
  const protectedHTML=[];
  const protect=html=>`\u0000${protectedHTML.push(html)-1}\u0000`;
  let text=original.replace(/\u0000/g,'');
  // Work from original citation positions before parsing any formatting.
  const annotations=typeof message==='object'?message.citations||[]:[];
  let cursor=0,parts='';
  for(const c of [...annotations].sort((a,b)=>a.start_index-b.start_index)){
    const start=c.start_index,end=c.end_index,url=safeURL(c.url);
    if(!url||!Number.isInteger(start)||!Number.isInteger(end)||start<cursor||end<=start||end>original.length)continue;
    parts+=original.slice(cursor,start).replace(/\u0000/g,'');
    parts+=protect(`<a class="chat-citation" href="${escape(url)}" title="${escape(c.title||new URL(url).hostname)}" target="_blank" rel="noopener noreferrer">${escape(cleanChatText(original.slice(start,end))||c.title||new URL(url).hostname)}</a>`);cursor=end;
  }
  if(cursor)text=parts+original.slice(cursor).replace(/\u0000/g,'');
  text=cleanChatText(text).replace(/\r\n?/g,'\n');
  const restore=value=>value.replace(/\u0000(\d+)\u0000/g,(_,i)=>protectedHTML[+i]||'');
  function inline(value){
    value=value.replace(/`([^`\n]+)`/g,(_,code)=>protect(`<code>${escape(code)}</code>`));
    value=value.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'\u0000]+/g,(match,label,raw)=>{const url=safeURL(raw||match);return url?protect(`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label||match)}</a>`):match;});
    value=escape(value).replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,(_,a,b)=>`<strong>${a||b}</strong>`).replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g,'$1<em>$2</em>').replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g,'$1<em>$2</em>').replace(/~~([^~\n]+)~~/g,'<s>$1</s>');
    return restore(value);
  }
  const lines=text.split('\n'),out=[];let i=0;
  const special=line=>/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>|```|~~~|[-*_]{3,}\s*$)/.test(line);
  while(i<lines.length){
    const line=lines[i];if(!line.trim()){i++;continue;}
    const fence=line.match(/^\s*(```|~~~)([\w+-]*)\s*$/);
    if(fence){i++;const code=[];while(i<lines.length&&!lines[i].trim().startsWith(fence[1]))code.push(lines[i++]);if(i<lines.length)i++;out.push(`<pre><code>${escape(restore(code.join('\n')))}</code></pre>`);continue;}
    const heading=line.match(/^\s*#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    if(heading){out.push(`<p class="chat-heading">${inline(heading[1])}</p>`);i++;continue;}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
    if(/^\s*>/.test(line)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*> ?/,''));out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);continue;}
    if(/^\s*([-*+] |\d+[.)] )/.test(line)){
      const ordered=/^\s*\d/.test(line),tag=ordered?'ol':'ul',pattern=ordered?/^\s*\d+[.)]\s+/:/^\s*[-*+]\s+/;const items=[];
      while(i<lines.length&&pattern.test(lines[i])){let item=lines[i++].replace(pattern,'');while(i<lines.length&&/^ {2,}\S/.test(lines[i])&&!special(lines[i]))item+='\n'+lines[i++].trim();items.push(`<li>${inline(item).replace(/\n/g,'<br>')}</li>`);}
      const start=ordered?Number(line.trim().match(/^\d+/)[0]):1;out.push(`<${tag}${ordered&&start!==1?` start="${start}"`:''}>${items.join('')}</${tag}>`);continue;
    }
    if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      const cells=value=>value.trim().replace(/^\||\|$/g,'').split('|').map(v=>inline(v.trim()));
      const headers=cells(line),rows=[];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));
      out.push(`<div class="chat-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map((_,j)=>`<td>${r[j]||''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
    }
    const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!special(lines[i])&&!(i+1<lines.length&&lines[i+1].includes('---')&&lines[i].includes('|')))paragraph.push(lines[i++]);
    out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
  }
  return `<div class="chat-prose">${out.join('')}</div>`;
}
