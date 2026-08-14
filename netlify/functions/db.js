const { isAuthorized } = require("./lib/session-auth");
const { KEY, openStore, readDb } = require("./lib/db-store");

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

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
    store = await openStore();
  }catch(e){
    return jsonResponse(503, { ok:false, error:"blobs_not_configured", hint:"Enable Netlify Blobs or set PANERA_BLOBS_SITE_ID/PANERA_BLOBS_TOKEN_2026." });
  }
  if(!store){
    return jsonResponse(503, { ok:false, error:"blobs_not_configured", hint:"Enable Netlify Blobs or set PANERA_BLOBS_SITE_ID/PANERA_BLOBS_TOKEN_2026." });
  }

  if(event.httpMethod === "GET"){
    try{
      const db = await readDb(store);
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
      const manualDb = { ...db, ventas:(Array.isArray(db.ventas) ? db.ventas : []).filter(sale=>sale?.sourceSystem !== "better-mood-pos") };
      await store.setJSON(KEY, manualDb);
      return jsonResponse(200, { ok:true, protectedImports:true });
    }catch(e){
      return jsonResponse(503, { ok:false, error:"blobs_unavailable" });
    }
  }

  return jsonResponse(405, { ok:false, error:"method_not_allowed" }, { Allow: "GET, POST, PUT" });
};
