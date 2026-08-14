const crypto = require("node:crypto");
const { isAuthorized } = require("./lib/session-auth");
const { openStore, readImportedSales, readImportedSale, writeImportedSale, writeReconciliation } = require("./lib/db-store");
const { clean, sourceKey, validatePayload, normalizePayload, compareRevision } = require("./lib/pos-sale-contract");

const HEADERS = { "Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
const response = (statusCode, body)=>({ statusCode, headers:HEADERS, body:JSON.stringify(body) });
const secret = ()=>clean(process.env.PANERA_POS_IMPORT_SECRET);

function safeEqual(left, right){
  const a = Buffer.from(clean(left));
  const b = Buffer.from(clean(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(event){
  const headers = event.headers || {};
  const provided = headers["x-panera-pos-secret"] || headers["X-Panera-Pos-Secret"];
  return (secret() && safeEqual(provided, secret())) || isAuthorized(event);
}

function importedFolio(candidate){
  const branch = candidate.sourceBranchId === "cholula" ? "CH" : "UP";
  const source = clean(candidate.sourceFolioNumber || candidate.sourceOrderNumber || candidate.sourceOrderId)
    .toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `POS-${branch}-${source}`;
}

function findImportedSale(db, key){
  return (db?.ventas || []).find(sale=>sourceKey(sale) === key) || null;
}

exports.handler = async event=>{
  if(!authorized(event)) return response(401, { ok:false, error:"unauthorized" });
  let store;
  try{ store = await openStore(); }catch(error){ return response(503, { ok:false, error:"blobs_not_configured" }); }
  if(!store) return response(503, { ok:false, error:"blobs_not_configured" });

  if(event.httpMethod === "GET"){
    const params = event.queryStringParameters || {};
    const key = params.sourceOrderId ? `better-mood-pos:${clean(params.branchId).toLowerCase()}:${clean(params.sourceOrderId)}` : "";
    if(key){
      const sale = await readImportedSale(store, params.branchId, params.sourceOrderId).catch(()=>null);
      return response(sale ? 200 : 404, { ok:!!sale, sale:sale || null });
    }
    const imported = await readImportedSales(store).catch(()=>null);
    if(!imported) return response(503, { ok:false, error:"blobs_unavailable" });
    return response(200, {
      ok:true,
      summary:{
        imported:imported.length,
        total:Math.round(imported.reduce((sum,sale)=>sum + Number(sale.total || 0), 0) * 100) / 100,
        lastSyncedAt:imported.map(sale=>sale.lastSyncedAt || "").sort().at(-1) || null
      }
    });
  }

  if(event.httpMethod !== "POST") return response(405, { ok:false, error:"method_not_allowed" });
  let body;
  try{ body = JSON.parse(event.body || "{}"); }catch(error){ return response(400, { ok:false, error:"invalid_json" }); }
  if(body.action === "record_reconciliation"){
    const summary = body.summary && typeof body.summary === "object" ? body.summary : {};
    try{
      const record = await writeReconciliation(store, {
        eligible:Number(summary.eligible || 0), imported:Number(summary.imported || 0),
        pending:Number(summary.pending || 0), conflicts:Number(summary.conflicts || 0),
        expectedTotal:Number(summary.expectedTotal || 0), importedTotal:Number(summary.importedTotal || 0),
        from:clean(summary.from), to:clean(summary.to), cursor:clean(summary.cursor),
        lastBackfillAt:new Date().toISOString()
      });
      return response(200, { ok:true, modified:true, action:"reconciliation_recorded", summary:record });
    }catch(error){
      return response(503, { ok:false, error:"reconciliation_unavailable" });
    }
  }
  const candidate = normalizePayload(body.sale || body);
  const errors = validatePayload(candidate);
  if(errors.length) return response(400, { ok:false, error:"invalid_sale", details:errors });
  const requestedKey = clean(event.headers?.["idempotency-key"] || event.headers?.["Idempotency-Key"]);
  if(requestedKey && requestedKey !== sourceKey(candidate)) return response(409, { ok:false, error:"idempotency_key_mismatch" });
  if(body.dryRun === true) return response(200, { ok:true, dryRun:true, sourceKey:sourceKey(candidate), payloadHash:candidate.payloadHash });

  try{
    const key = sourceKey(candidate);
    const existing = await readImportedSale(store, candidate.sourceBranchId, candidate.sourceOrderId);
    if(existing && existing.sourcePayloadHash && existing.sourcePayloadHash === candidate.sourcePayloadHash) return response(200, { ok:true, modified:false, action:"unchanged", sale:existing });
    if(existing && compareRevision(existing, candidate) < 0) return response(200, { ok:true, modified:false, action:"stale", sale:existing });
    const sale = {
      ...existing, ...candidate,
      id:existing?.id || `pos_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      folio:existing?.folio || importedFolio(candidate),
      importedAt:existing?.importedAt || new Date().toISOString()
    };
    const written = await writeImportedSale(store, sale);
    return response(existing ? 200 : 201, { ok:true, modified:written.modified, action:existing ? "updated" : "created", sale:written.sale });
  }catch(error){
    console.error("pos-sale-import failed", { error:clean(error?.message) });
    return response(503, { ok:false, error:"import_unavailable" });
  }
};
