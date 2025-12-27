const { getStore } = require("@netlify/blobs");

const STORE_NAME = "panera-db";
const KEY = "db";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

// PANERA_AUTH can be "panera:panque" or its base64 value.
function isAuthorized(event){
  const expected = process.env.PANERA_AUTH;
  if(!expected) return true;
  const auth = (event.headers.authorization || event.headers.Authorization || "").trim();
  if(!auth.startsWith("Basic ")) return false;
  const incoming = auth.slice(6).trim();
  if(incoming === expected) return true;
  try{
    const decoded = Buffer.from(incoming, "base64").toString("utf8");
    return decoded === expected;
  }catch(e){
    return false;
  }
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

  const store = getStore(STORE_NAME);

  if(event.httpMethod === "GET"){
    const raw = await store.get(KEY);
    if(!raw) return jsonResponse(200, { ok:true, db:null });
    const text = (typeof raw === "string") ? raw : Buffer.from(raw).toString("utf8");
    let db = null;
    try{ db = JSON.parse(text); }catch(e){ db = null; }
    return jsonResponse(200, { ok:true, db });
  }

  if(event.httpMethod === "POST" || event.httpMethod === "PUT"){
    if(!event.body) return jsonResponse(400, { ok:false, error:"missing_body" });
    let payload = null;
    try{ payload = JSON.parse(event.body); }catch(e){ return jsonResponse(400, { ok:false, error:"invalid_json" }); }
    const db = (payload && payload.db) ? payload.db : payload;
    if(!db || typeof db !== "object") return jsonResponse(400, { ok:false, error:"invalid_db" });
    await store.set(KEY, JSON.stringify(db));
    return jsonResponse(200, { ok:true });
  }

  return jsonResponse(405, { ok:false, error:"method_not_allowed" }, { Allow: "GET, POST, PUT" });
};
