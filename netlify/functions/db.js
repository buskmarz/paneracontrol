const { getStore } = require("@netlify/blobs");

const STORE_NAME = "panera-db";
const KEY = "db";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function getStoreConfig(){
  const siteID = (process.env.NETLIFY_SITE_ID || process.env.PANERA_BLOBS_SITE_ID || "").trim();
  const token = (process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_ACCESS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.PANERA_BLOBS_TOKEN || "").trim();
  if(siteID && token) return { siteID, token };
  return null;
}
function openStore(){
  const hasInjected = !!(process.env.NETLIFY_BLOBS_URL && process.env.NETLIFY_BLOBS_TOKEN);
  if(hasInjected) return getStore(STORE_NAME);
  const cfg = getStoreConfig();
  if(cfg) return getStore(STORE_NAME, cfg);
  return null;
}

// PANERA_AUTH can be "panera:panque" or its base64 value.
function normalizeAuth(event){
  const auth = (event.headers.authorization || event.headers.Authorization || "").trim();
  if(auth.startsWith("Basic ")) return auth.slice(6).trim();
  const alt = (event.headers["x-panera-auth"] || event.headers["X-Panera-Auth"] || "").trim();
  return alt || "";
}
function authMatches(incoming, expected){
  if(!incoming) return false;
  if(incoming === expected) return true;
  try{
    const decoded = Buffer.from(incoming, "base64").toString("utf8");
    return decoded === expected;
  }catch(e){
    return false;
  }
}
function isAuthorized(event){
  const expected = process.env.PANERA_AUTH;
  if(!expected) return true;
  const incoming = normalizeAuth(event);
  return authMatches(incoming, expected);
}

function jsonResponse(statusCode, payload, extraHeaders={}){
  return {
    statusCode,
    headers: { ...BASE_HEADERS, ...extraHeaders },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if(!isAuthorized(event)){
    return jsonResponse(401, { ok:false, error:"unauthorized" });
  }

  let store = null;
  try{
    store = openStore();
  }catch(e){
    return jsonResponse(503, { ok:false, error:"blobs_not_configured", hint:"Enable Netlify Blobs or set PANERA_BLOBS_SITE_ID/PANERA_BLOBS_TOKEN." });
  }
  if(!store){
    return jsonResponse(503, { ok:false, error:"blobs_not_configured", hint:"Enable Netlify Blobs or set PANERA_BLOBS_SITE_ID/PANERA_BLOBS_TOKEN." });
  }

  if(event.httpMethod === "GET"){
    try{
      const raw = await store.get(KEY);
      if(!raw) return jsonResponse(200, { ok:true, db:null });
      const text = (typeof raw === "string") ? raw : Buffer.from(raw).toString("utf8");
      let db = null;
      try{ db = JSON.parse(text); }catch(e){ db = null; }
      return jsonResponse(200, { ok:true, db });
    }catch(e){
      return jsonResponse(503, { ok:false, error:"blobs_unavailable" });
    }
  }

  if(event.httpMethod === "POST" || event.httpMethod === "PUT"){
    if(!event.body) return jsonResponse(400, { ok:false, error:"missing_body" });
    let payload = null;
    try{ payload = JSON.parse(event.body); }catch(e){ return jsonResponse(400, { ok:false, error:"invalid_json" }); }
    const db = (payload && payload.db) ? payload.db : payload;
    if(!db || typeof db !== "object") return jsonResponse(400, { ok:false, error:"invalid_db" });
    try{
      await store.set(KEY, JSON.stringify(db));
      return jsonResponse(200, { ok:true });
    }catch(e){
      return jsonResponse(503, { ok:false, error:"blobs_unavailable" });
    }
  }

  return jsonResponse(405, { ok:false, error:"method_not_allowed" }, { Allow: "GET, POST, PUT" });
};
