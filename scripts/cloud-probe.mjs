// GitHub-hosted scheduled probe. Secrets and inventory history stay in Cloudflare.
const base=process.env.TRACKER_URL;
if(!base||new URL(base).protocol!=='https:')throw Error('Set TRACKER_URL.');
let token=process.env.PROBE_TOKEN;
if(!token) {
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
 const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!endpoint||!requestToken)throw Error('GitHub job needs id-token: write permission.');
 const oidc=new URL(endpoint);if(oidc.protocol!=='https:'||!oidc.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Unexpected GitHub identity endpoint');
 oidc.searchParams.set('audience',new URL(base).origin);
 const r=await fetch(oidc,{headers:{Authorization:'Bearer '+requestToken},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('GitHub identity token request failed');token=(await r.json()).value;
 if(!token)throw Error('Missing GitHub identity token');
}

const call=async(path,payload)=>{
 const r=await fetch(new URL(path,base),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(`Tracker control HTTP ${r.status}`);return r.json();
};
const lease=await call('/probe/lease',{verify:process.env.VERIFY_ONLY==='true'});
if(!lease.id){console.log('No request needed:',lease.reason);process.exit(0);}
const url=new URL(lease.url);
if(url.origin!=='https://www.apple.com'||url.pathname!=='/jp/shop/retail/pickup-message')throw Error('Unexpected pickup origin/path');
let result;
try {
 const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'PersonalPickupMonitor/1.1'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!r.ok) {
  const ra=r.headers.get('Retry-After');const numeric=Number(ra);
  const retry=ra?Math.max(0,Number.isFinite(numeric)?numeric*1000:(Date.parse(ra)-Date.now())||0):0;
  await r.body?.cancel();result={id:lease.id,error:{code:r.status,retry}};
 }else{
  const reader=r.body.getReader();const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw Error('Oversized pickup response');}chunks.push(value);}
  const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}
  result={id:lease.id,data:JSON.parse(new TextDecoder().decode(bytes))};
 }
}catch {result={id:lease.id,error:{code:'network-or-json',retry:0}};}
const accepted=await call('/probe/result',result);
console.log(JSON.stringify({accepted:accepted.accepted,stores:accepted.stores,checked:accepted.checked,error:accepted.error}));
if(!accepted.accepted)process.exitCode=1;

for(const delivery of accepted.deliveries||[]) {
 const target=new URL(delivery.url);
 if(target.protocol!=='https:'||target.hostname!=='ntfy.sh')throw Error('Unexpected ntfy destination; use authenticated Cloudflare delivery for custom servers.');
 let report={id:delivery.id,ok:false};
 try {
  const r=await fetch(target,{method:'POST',headers:{'Content-Type':'text/plain; charset=utf-8',Title:'iPhone Duo tracker'},body:delivery.message,redirect:'manual',signal:AbortSignal.timeout(12000)});
  const data=await r.json();const ra=r.headers.get('Retry-After');const seconds=Number(ra);
  report={id:delivery.id,ok:r.ok&&Boolean(data.id),code:r.status,providerCode:Number.isInteger(data.code)?data.code:null,retry:ra?Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(ra)-Date.now()):0};
 }catch{}
 await call('/probe/ack',report);
 console.log('ntfy delivery:',report.ok?'accepted':(report.code||'network failure'));
 if(!report.ok)break;
}
