import sanitizeHtml from 'sanitize-html';
export const escapeHTML=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanEmailHTML(html=''){
  return sanitizeHtml(html,{allowedTags:['p','div','span','br','b','strong','i','em','u','s','strike','ul','ol','li','blockquote','a','img','table','tbody','thead','tr','td','th','h1','h2','h3','h4','hr','font'],allowedAttributes:{'*':['style','align'],a:['href','title','target','rel'],img:['src','alt','width','height'],table:['width','cellpadding','cellspacing','border'],td:['width','colspan','rowspan'],th:['colspan','rowspan'],font:['color','face','size']},allowedSchemes:['https','http','mailto','tel','cid'],allowedSchemesByTag:{img:['https','cid','data']},allowedStyles:{'*':{'color':[/^#[a-f\d]{3,8}$/i,/^rgb\([\d,\s.]+\)$/,/^[a-z]+$/i],'background-color':[/^#[a-f\d]{3,8}$/i,/^rgb\([\d,\s.]+\)$/,/^[a-z]+$/i],'font-family':[/^[\w\s,"'-]+$/],'font-size':[/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],'font-weight':[/^(?:normal|bold|[1-9]00)$/],'font-style':[/^(?:normal|italic)$/],'text-decoration':[/^[a-z\s-]+$/],'text-align':[/^(?:left|right|center|justify)$/],'line-height':[/^[\d.]+(?:px|pt|em|%)?$/],'margin':[/^[\d.\s]+(?:px|pt|em|%)?$/],'padding':[/^[\d.\s]+(?:px|pt|em|%)?$/],'border':[/^[\d.]+px\s+(?:solid|dashed)\s+#[a-f\d]{3,8}$/i],'width':[/^\d+(?:px|%)$/],'height':[/^\d+(?:px|%)$/]}},exclusiveFilter:frame=>frame.tag==='img'&&frame.attribs.src?.startsWith('data:')&&!/^data:image\/(?:png|jpeg|gif);base64,[a-z\d+/=]+$/i.test(frame.attribs.src),transformTags:{a:(tag,attrs)=>({tagName:'a',attribs:{...attrs,rel:'noopener noreferrer',target:'_blank'}})}});
}
export function buildEmailHTML(email,settings,{requireSignature=true}={}) {
  const signature=cleanEmailHTML(settings.emailSignatureHtml||'');
  if(requireSignature&&((!signature.replace(/<[^>]*>/g,'').trim()&&!signature.includes('<img '))||!settings.emailSignatureConfirmed))throw new Error('Set up and confirm your Outlook signature in Email branding before sending. Every app email includes that signature.');
  let body=email.bodyHtml?cleanEmailHTML(email.bodyHtml):`<div>${escapeHTML(email.body).replace(/\n/g,'<br>')}</div>`;
  if(signature)body=body.split(signature).join('');
  return cleanEmailHTML(`<div style="font-family:Arial,sans-serif;font-size:14px;color:#222222;line-height:1.6">${body}${signature?`<br><div>${signature}</div>`:''}</div>`);
}
export function graphEmail(email,settings,attachments=[]) {
  let html=buildEmailHTML(email,settings);const files=[...attachments];
  html=html.replace(/src="data:(image\/(?:png|jpeg|gif));base64,([a-z\d+/=]+)"/gi,(_,type,content)=>{const id=`inline-${files.length}@vareonhq`;files.push({'@odata.type':'#microsoft.graph.fileAttachment',name:`inline-${files.length}.${type.split('/')[1]}`,contentType:type,contentId:id,isInline:true,contentBytes:content});return `src="cid:${id}"`;});
  const bytes=files.reduce((sum,f)=>sum+Buffer.from(f.contentBytes||'','base64').length,0);if(bytes>2500000)throw new Error('Keep combined attachments and inline images under 2.5 MB for this app’s direct-send connection.');
  const recipients=values=>values.filter(Boolean).map(address=>({emailAddress:{address}}));
  return {subject:email.subject,body:{contentType:'HTML',content:html},toRecipients:recipients([email.to]),ccRecipients:recipients(email.cc||[]),bccRecipients:recipients(email.bcc||[]),importance:email.importance||'normal',...(files.length?{attachments:files}:{})};
}
