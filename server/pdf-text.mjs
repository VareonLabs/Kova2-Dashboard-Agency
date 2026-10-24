async function extract(bytes){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});let pdf;
  try{pdf=await task.promise;let text='';const pages=Math.min(pdf.numPages,100);for(let i=1;i<=pages&&text.length<500000;i++){const page=await pdf.getPage(i),content=await page.getTextContent();text+=`\n[Page ${i}]\n`+content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');page.cleanup();}return {text,pages:pdf.numPages,note:pdf.numPages>100?'Text preview covers the first 100 pages.':'PDF text extracted. Scanned pages may require visual reading.'};}finally{await task.destroy();}
}
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
try{const result=await extract(Buffer.concat(chunks));result.text=result.text.slice(0,500000);process.stdout.write(JSON.stringify(result));}catch{process.exitCode=1;}
