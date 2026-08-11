const { getStore } = require("@netlify/blobs");
const { randomUUID } = require("node:crypto");
const { isAuthorized } = require("./lib/session-auth");

const STORE_NAME = "panera-documents";
const INDEX_KEY = "__index__";
const MAX_BYTES = 6 * 1024 * 1024;

function storeConfig(){
  const siteID = (process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.PANERA_BLOBS_SITE_ID || "").trim();
  const token = (process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_ACCESS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_PERSONAL_ACCESS_TOKEN || process.env.PERSONAL_ACCESS_TOKEN || process.env.PANERA_BLOBS_TOKEN_2026 || "").trim();
  return siteID && token ? { siteID, token } : null;
}
function openStore(){
  if(process.env.NETLIFY_BLOBS_URL && process.env.NETLIFY_BLOBS_TOKEN) return getStore(STORE_NAME);
  const cfg = storeConfig();
  return cfg ? getStore({ name:STORE_NAME, ...cfg }) : null;
}
function json(statusCode, payload, extraHeaders={}){
  return { statusCode, headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extraHeaders}, body:JSON.stringify(payload) };
}
function parseBody(event){
  try{ return event.body ? JSON.parse(event.body) : null; }catch(e){ return null; }
}
async function readIndex(store){
  const raw = await store.get(INDEX_KEY);
  if(!raw) return [];
  try{ return JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")); }catch(e){ return []; }
}
async function writeIndex(store, docs){
  await store.set(INDEX_KEY, JSON.stringify(docs));
}
function safeName(name){ return String(name || "documento").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0,120); }

exports.handler = async (event) => {
  if(!isAuthorized(event)) return json(401, {ok:false,error:"unauthorized"});
  let store;
  try{ store = openStore(); }catch(e){ return json(503,{ok:false,error:"blobs_not_configured"}); }
  if(!store) return json(503,{ok:false,error:"blobs_not_configured"});

  try{
    if(event.httpMethod === "GET"){
      const docs = await readIndex(store);
      const id = event.queryStringParameters?.id;
      if(!id) return json(200,{ok:true,documents:docs});
      const doc = docs.find(x=>x.id===id);
      if(!doc) return json(404,{ok:false,error:"not_found"});
      const content = await store.get(doc.key, {type:"arrayBuffer"});
      if(!content) return json(404,{ok:false,error:"file_not_found"});
      return { statusCode:200, isBase64Encoded:true, headers:{"Content-Type":doc.contentType || "application/octet-stream","Content-Disposition":`attachment; filename="${safeName(doc.fileName)}"`,"Cache-Control":"private, no-store"}, body:Buffer.from(content).toString("base64") };
    }
    if(event.httpMethod === "POST"){
      const payload = parseBody(event);
      if(!payload || payload.action !== "upload" || !payload.contentBase64) return json(400,{ok:false,error:"invalid_upload"});
      const buffer = Buffer.from(payload.contentBase64, "base64");
      if(!buffer.length || buffer.length > MAX_BYTES) return json(413,{ok:false,error:"file_too_large",maxBytes:MAX_BYTES});
      const id = randomUUID();
      const fileName = safeName(payload.fileName || "documento");
      const key = `files/${id}-${fileName}`;
      await store.set(key, buffer);
      const docs = await readIndex(store);
      const doc = { id, key, fileName, contentType:String(payload.contentType||"application/octet-stream"), size:buffer.length, title:String(payload.title||fileName).slice(0,160), date:String(payload.date||"").slice(0,10), category:String(payload.category||"Otro").slice(0,80), reference:String(payload.reference||"").slice(0,160), createdAt:new Date().toISOString() };
      docs.unshift(doc);
      await writeIndex(store, docs);
      return json(201,{ok:true,document:doc});
    }
    if(event.httpMethod === "DELETE"){
      const payload = parseBody(event);
      const docs = await readIndex(store);
      const doc = docs.find(x=>x.id===payload?.id);
      if(!doc) return json(404,{ok:false,error:"not_found"});
      await store.delete(doc.key);
      await writeIndex(store, docs.filter(x=>x.id!==doc.id));
      return json(200,{ok:true});
    }
    return json(405,{ok:false,error:"method_not_allowed"},{Allow:"GET, POST, DELETE"});
  }catch(e){
    return json(503,{ok:false,error:"documents_unavailable"});
  }
};
