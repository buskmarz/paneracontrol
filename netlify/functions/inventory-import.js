const crypto = require("node:crypto");
const { isAuthorized } = require("./lib/session-auth");
const { openStore } = require("./lib/db-store");
const { clean, normalizePayload, validatePayload } = require("./lib/inventory-contract");

const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const response=(statusCode,body)=>({statusCode,headers:HEADERS,body:JSON.stringify(body)});
function safeEqual(a,b){ const x=Buffer.from(clean(a)); const y=Buffer.from(clean(b)); return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y); }
function authorized(event){
  const provided=event.headers?.["x-panera-pos-secret"]||event.headers?.["X-Panera-Pos-Secret"];
  return safeEqual(provided,process.env.PANERA_POS_IMPORT_SECRET)||isAuthorized(event);
}
const keyFor=branch=>`integrations/better-inventory/current/${branch}.json`;

exports.handler=async event=>{
  if(!authorized(event)) return response(401,{ok:false,error:"unauthorized"});
  if(event.httpMethod==="GET"){
    const store=await openStore().catch(()=>null);
    if(!store) return response(503,{ok:false,error:"blobs_not_configured"});
    const branch=clean(event.queryStringParameters?.branchId).toLowerCase();
    if(!["upaep","cholula"].includes(branch)) return response(400,{ok:false,error:"invalid_branch"});
    const snapshot=await store.get(keyFor(branch),{type:"json",consistency:"strong"}).catch(()=>null);
    return response(snapshot?200:404,{ok:!!snapshot,snapshot:snapshot?{
      branchId:snapshot.branchId,sourceRevision:snapshot.sourceRevision,sourceUpdatedAt:snapshot.sourceUpdatedAt,
      payloadHash:snapshot.payloadHash,products:snapshot.products.length,stocks:snapshot.stocks.length,
      movements:snapshot.movements.length,purchases:snapshot.purchases.length,counts:snapshot.counts.length
    }:null});
  }
  if(event.httpMethod!=="POST") return response(405,{ok:false,error:"method_not_allowed"});
  let body; try{body=JSON.parse(event.body||"{}");}catch{return response(400,{ok:false,error:"invalid_json"});}
  const candidate=normalizePayload(body.snapshot||body);
  const errors=validatePayload(candidate);
  if(errors.length) return response(400,{ok:false,error:"invalid_snapshot",details:errors});
  if(body.dryRun===true) return response(200,{ok:true,dryRun:true,branchId:candidate.branchId,payloadHash:candidate.payloadHash});
  const store=await openStore().catch(()=>null);
  if(!store) return response(503,{ok:false,error:"blobs_not_configured"});
  const current=await store.get(keyFor(candidate.branchId),{type:"json",consistency:"strong"}).catch(()=>null);
  if(current?.payloadHash===candidate.payloadHash) return response(200,{ok:true,modified:false,action:"unchanged",snapshot:candidate});
  if(Number(current?.sourceRevision||-1)>candidate.sourceRevision) return response(409,{ok:false,error:"stale_revision",currentRevision:current.sourceRevision});
  await store.setJSON(keyFor(candidate.branchId),candidate);
  await store.setJSON(`integrations/better-inventory/receipts/${candidate.branchId}/${String(candidate.sourceRevision).padStart(12,"0")}-${candidate.payloadHash.slice(0,20)}.json`,{
    branchId:candidate.branchId,sourceRevision:candidate.sourceRevision,sourceUpdatedAt:candidate.sourceUpdatedAt,payloadHash:candidate.payloadHash,
    products:candidate.products.length,movements:candidate.movements.length,purchases:candidate.purchases.length,counts:candidate.counts.length,receivedAt:new Date().toISOString()
  });
  const confirmed=await store.get(keyFor(candidate.branchId),{type:"json",consistency:"strong"});
  if(!confirmed||confirmed.payloadHash!==candidate.payloadHash) return response(503,{ok:false,error:"confirmation_failed"});
  return response(current?200:201,{ok:true,modified:true,action:current?"updated":"created",snapshot:confirmed});
};
