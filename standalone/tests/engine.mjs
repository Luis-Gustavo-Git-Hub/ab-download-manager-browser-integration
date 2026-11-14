import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const context=vm.createContext({fetch,Response,AbortController,setTimeout,clearTimeout});
new vm.Script(await fs.readFile(new URL('../parallel-engine.js',import.meta.url),'utf8')+';globalThis.Engine=ParallelEngine;').runInContext(context);
const {Engine}=context;
const original=Uint8Array.from({length:100},(_,i)=>i);
let requests=0;
async function fetcher(url,options){
  requests++;const [,a,b]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);const start=+a,end=+b;
  return new Response(original.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/100`,ETag:'"v1"'}});
}
const engine=new Engine(fetcher),meta=await engine.inspect('https://example.com/file');
const job={...meta,parts:[{start:0,end:49,done:false},{start:50,end:99,done:false}]};
const files=new Map();let checkpoints=0;
const disk={open:async part=>{const chunks=[];return{write:async chunk=>chunks.push(chunk),close:async()=>files.set(part.start,new Blob(chunks)),abort:async()=>{}}},read:async part=>files.get(part.start),checkpoint:async()=>checkpoints++};
await engine.run(job,disk);const chunks=[];let closed=false;
await engine.assemble(job,disk,{write:async c=>chunks.push(c),close:async()=>closed=true,abort:async()=>{}});
assert(closed);assert.equal(checkpoints,2);assert.deepEqual(new Uint8Array(await new Blob(chunks).arrayBuffer()),original);
const before=requests;await new Engine(fetcher).run(job,disk);assert.equal(requests,before+1);
for(const mode of ['ignored','changed','truncated','compressed']){
  const bad=async(url,options)=>{const response=await fetcher(url,options);if(mode==='ignored')return new Response(original,{status:200});if(mode==='changed')response.headers.set('ETag','"v2"');if(mode==='compressed')response.headers.set('Content-Encoding','gzip');if(mode==='truncated')return new Response(new Uint8Array(),{status:206,headers:response.headers});return response;};
  await assert.rejects(()=>new Engine(bad).run({...meta,parts:[{start:0,end:99,done:false}]},disk));
}
console.log('PASS: byte integrity, checkpoints, resume and invalid HTTP responses');
