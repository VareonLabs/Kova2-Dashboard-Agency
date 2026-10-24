import sanitizeHtml from 'sanitize-html';
import { escapeHTML } from './email-html.mjs';

export function contentId(value='') {
  try { value=decodeURIComponent(value); } catch {}
  return String(value).replace(/^cid:/i,'').replace(/^<|>$/g,'').trim();
}
export function imageData(file) {
  const type=String(file.contentType||'').toLowerCase();
  if(!/^image\/(png|jpeg|gif|webp)$/.test(type)||!file.contentBytes||file.contentBytes.length>7_000_000)return '';
  const bytes=Buffer.from(file.contentBytes,'base64');
  const valid=type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/gif'?/^GIF8[79]a/.test(bytes.subarray(0,6).toString()):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  return valid&&bytes.length<=5_000_000?`data:${type};base64,${bytes.toString('base64')}`:'';
}
export function cleanReceivedHTML(html='',images={}) {
  return sanitizeHtml(html,{
    allowedTags:['p','div','span','br','b','strong','i','em','u','s','strike','ul','ol','li','blockquote','a','img','table','tbody','thead','tfoot','tr','td','th','h1','h2','h3','h4','h5','h6','hr','font','center','pre','code','sub','sup'],
    allowedAttributes:{'*':['style','align','dir'],a:['href','title','target','rel'],img:['src','alt','width','height','title'],table:['width','cellpadding','cellspacing','border','bgcolor','role'],td:['width','height','colspan','rowspan','valign','bgcolor'],th:['width','colspan','rowspan','valign','bgcolor'],font:['color','face','size']},
    allowedSchemes:['https','http','mailto','tel'],allowedSchemesByTag:{img:['https','http','data']},allowProtocolRelative:false,
    allowedStyles:{'*':{
      'color':[/^#[a-f\d]{3,8}$/i,/^rgba?\([\d.,\s%]+\)$/,/^[a-z]+$/i],
      'background-color':[/^#[a-f\d]{3,8}$/i,/^rgba?\([\d.,\s%]+\)$/,/^[a-z]+$/i],
      'font-family':[/^[\w\s,"'-]+$/],'font-size':[/^[\d.]+(?:px|pt|em|rem|%)$/],
      'font-weight':[/^(?:normal|bold|[1-9]00)$/],'font-style':[/^(?:normal|italic)$/],
      'text-decoration':[/^[a-z\s-]+$/],'text-align':[/^(?:left|right|center|justify)$/],
      'line-height':[/^[\d.]+(?:px|pt|em|%)?$/],
      'margin':[/^(?:(?:[\d.]+(?:px|pt|em|%)?|auto)\s*){1,4}$/],
      'padding':[/^(?:[\d.]+(?:px|pt|em|%)?\s*){1,4}$/],
      'border':[/^[\d.]+px\s+(?:solid|dashed)\s+#[a-f\d]{3,8}$/i],
      'border-radius':[/^[\d.]+(?:px|%)$/],'border-collapse':[/^(collapse|separate)$/],
      'width':[/^[\d.]+(?:px|%)$/],'max-width':[/^[\d.]+(?:px|%)$/],
      'height':[/^[\d.]+(?:px|%)$/],'vertical-align':[/^(top|middle|bottom|baseline)$/],
      'display':[/^(block|inline|inline-block|none)$/]
    }},
    transformTags:{
      a:(tag,attrs)=>({tagName:tag,attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}}),
      img:(tag,attrs)=>{let src=attrs.src||'';if(/^cid:/i.test(src))src=images[contentId(src)]||'';if(src.startsWith('//'))src='https:'+src;return {tagName:tag,attribs:{...attrs,src,alt:attrs.alt||'Email image'}};}
    },
    exclusiveFilter:frame=>frame.tag==='img'&&(!frame.attribs.src||frame.attribs.src.startsWith('data:')&&!/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(frame.attribs.src))
  });
}
export function emailText(html='') {
  return sanitizeHtml(String(html).replace(/<(?:br\s*\/?|\/p|\/div|\/tr|\/li)>/gi,'\n'),{allowedTags:[],allowedAttributes:{}}).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
}
export function receivedDocument(html='',text='') {
  const body=html||`<div style="white-space:pre-wrap">${escapeHTML(text||'This message has no text content.')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><base target="_blank"><style>html{color-scheme:light;background:#fff;color:#222;font:14px/1.55 Arial,sans-serif}body{margin:0;padding:24px;overflow-wrap:anywhere}img{max-width:100%!important;object-fit:contain;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}a{color:#1466b8}blockquote{margin-left:12px;padding-left:12px;border-left:2px solid #ddd}@media(max-width:500px){body{padding:16px}}</style></head><body>${body}</body></html>`;
}
