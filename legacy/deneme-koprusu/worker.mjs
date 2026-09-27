const enginePromise=import('./parser.mjs');
let cat;
self.onmessage=async ({data})=>{try{const {parsePDF,importPack,renderPNG}=await enginePromise;cat??=(await (await fetch('/bridge/engine/catalog.json')).json()).outcomes;let result;if(data.kind==='png')result=renderPNG(data.bytes);else if(data.kind==='json')result=importPack(JSON.parse(data.text),cat);else result=await parsePDF(data.bytes,data.name,cat,(page,total)=>self.postMessage({id:data.id,progress:{page,total}}));self.postMessage({id:data.id,result})}catch(e){self.postMessage({id:data.id,error:e.message||'Dosya işlenemedi.'})}};
