const { isAuthorized } = require("./lib/session-auth");
const { openStore } = require("./lib/db-store");
const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const response=(statusCode,body)=>({statusCode,headers:HEADERS,body:JSON.stringify(body)});

exports.handler=async event=>{
  if(!isAuthorized(event)) return response(401,{ok:false,error:"unauthorized"});
  if(event.httpMethod!=="GET") return response(405,{ok:false,error:"method_not_allowed"});
  const store=await openStore().catch(()=>null);
  if(!store) return response(503,{ok:false,error:"blobs_not_configured"});
  const [upaep,cholula]=await Promise.all(["upaep","cholula"].map(branch=>store.get(`integrations/better-inventory/current/${branch}.json`,{type:"json",consistency:"strong"}).catch(()=>null)));
  const snapshots=[upaep,cholula].filter(Boolean);
  if(!snapshots.length) return response(200,{ok:true,status:"empty",snapshots:[]});
  return response(200,{ok:true,status:snapshots.length===2?"ready":"partial",snapshots});
};
