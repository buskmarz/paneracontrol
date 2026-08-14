const crypto = require("node:crypto");

const clean = value => String(value ?? "").trim();
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const finiteNonNegative = value => Number.isFinite(Number(value)) && Number(value) >= 0;

function stableStringify(value){
  if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if(value && typeof value === "object"){
    return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(payload){
  const comparable = { ...payload };
  delete comparable.payloadHash;
  delete comparable.importedAt;
  delete comparable.lastSyncedAt;
  delete comparable.syncStatus;
  delete comparable.syncError;
  return crypto.createHash("sha256").update(stableStringify(comparable)).digest("hex");
}

function sourceKey(payload){
  return `better-mood-pos:${clean(payload.sourceBranchId).toLowerCase()}:${clean(payload.sourceOrderId)}`;
}

function validatePayload(payload){
  const errors = [];
  if(!payload || typeof payload !== "object") return ["payload_required"];
  if(clean(payload.sourceSystem) !== "better-mood-pos") errors.push("invalid_source_system");
  if(!clean(payload.sourceOrderId)) errors.push("source_order_id_required");
  if(!["upaep", "cholula"].includes(clean(payload.sourceBranchId).toLowerCase())) errors.push("invalid_branch");
  if(!clean(payload.sourceClosedAt || payload.fecha)) errors.push("source_closed_at_required");
  if(!Array.isArray(payload.items) || payload.items.length === 0) errors.push("items_required");
  for(const item of payload.items || []){
    if(!clean(item.sourceLineId || item.id)) errors.push("line_id_required");
    if(!clean(item.prod)) errors.push("line_product_required");
    if(!finiteNonNegative(item.cant) || Number(item.cant) <= 0) errors.push("invalid_line_quantity");
    if(!finiteNonNegative(item.precio)) errors.push("invalid_line_price");
  }
  for(const field of ["subtotal", "descuento", "total", "sourceOrderTotal", "sourcePaneraTotal"]){
    if(!finiteNonNegative(payload[field])) errors.push(`invalid_${field}`);
  }
  return [...new Set(errors)];
}

function normalizePayload(payload, now=new Date().toISOString()){
  const normalized = {
    ...payload,
    sourceSystem:"better-mood-pos",
    sourceOrderId:clean(payload.sourceOrderId),
    sourceOrderNumber:clean(payload.sourceOrderNumber),
    sourceFolioNumber:clean(payload.sourceFolioNumber),
    sourceBranchId:clean(payload.sourceBranchId).toLowerCase(),
    sourceRevision:Number(payload.sourceRevision || 0),
    sourceClosedAt:clean(payload.sourceClosedAt || payload.fecha),
    sourceMutationAt:clean(payload.sourceMutationAt || payload.sourceClosedAt || payload.fecha),
    sourceEventType:clean(payload.sourceEventType || "closed"),
    integrationEventId:clean(payload.integrationEventId || sourceKey(payload)),
    canal:clean(payload.canal || "Panera General"),
    clienteNombre:clean(payload.clienteNombre || "Mostrador"),
    subtotal:money(payload.subtotal),
    descuento:money(payload.descuento),
    total:money(payload.total),
    saldo:money(payload.saldo),
    sourceOrderTotal:money(payload.sourceOrderTotal),
    sourcePaneraTotal:money(payload.sourcePaneraTotal ?? payload.total),
    tipExcludedAmount:money(payload.tipExcludedAmount),
    mixedSale:Boolean(payload.mixedSale),
    historical:Boolean(payload.historical),
    items:(payload.items || []).map(item=>({
      ...item,
      id:clean(item.id || item.sourceLineId),
      sourceLineId:clean(item.sourceLineId || item.id),
      prod:clean(item.prod),
      talla:clean(item.talla),
      precio:money(item.precio),
      cant:Number(item.cant),
      total:money(item.total ?? Number(item.precio || 0) * Number(item.cant || 0))
    })),
    pagos:(payload.pagos || []).map(payment=>({
      fecha:clean(payment.fecha || payload.sourceClosedAt || payload.fecha),
      metodo:clean(payment.metodo || "Por definir"),
      monto:money(payment.monto)
    })),
    fecha:clean(payload.fecha || payload.sourceClosedAt),
    origen:"POS Better Mood",
    syncStatus:"synced",
    syncError:"",
    lastSyncedAt:now
  };
  normalized.payloadHash = payloadHash(normalized);
  return normalized;
}

function compareRevision(existing, candidate){
  const left = Number(existing?.sourceRevision || 0);
  const right = Number(candidate?.sourceRevision || 0);
  if(right !== left) return right - left;
  return Date.parse(candidate?.sourceMutationAt || candidate?.sourceClosedAt || candidate?.fecha || 0) - Date.parse(existing?.sourceMutationAt || existing?.sourceClosedAt || existing?.fecha || 0);
}

module.exports = { clean, money, payloadHash, sourceKey, validatePayload, normalizePayload, compareRevision };
