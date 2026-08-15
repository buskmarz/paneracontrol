const crypto = require("node:crypto");

const clean = value=>String(value ?? "").trim();
const round3 = value=>Number(Number(value || 0).toFixed(3));

function stableStringify(value){
  if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if(value && typeof value === "object"){
    return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(payload){
  const clone = { ...payload };
  delete clone.payloadHash;
  return crypto.createHash("sha256").update(stableStringify(clone)).digest("hex");
}

function normalizePayload(input){
  const branchId = clean(input?.branchId).toLowerCase();
  return {
    schemaVersion:1,
    sourceSystem:"better-mood-inventory",
    sourceRevision:Number(input?.sourceRevision || 0),
    sourceUpdatedAt:clean(input?.sourceUpdatedAt),
    generatedAt:clean(input?.generatedAt),
    branchId,
    branchName:clean(input?.branchName),
    products:(input?.products || []).map(row=>({
      itemId:clean(row.itemId), name:clean(row.name), unit:clean(row.unit), active:row.active !== false,
      category:clean(row.category), supplier:clean(row.supplier)
    })),
    stocks:(input?.stocks || []).map(row=>({
      itemId:clean(row.itemId), stock:round3(row.stock), minimum:round3(row.minimum), maximum:round3(row.maximum),
      projectedStock:round3(row.projectedStock), confirmedInbound:round3(row.confirmedInbound), status:clean(row.status)
    })),
    movements:(input?.movements || []).map(row=>({
      movementId:clean(row.movementId), date:clean(row.date), occurredAt:clean(row.occurredAt), itemId:clean(row.itemId),
      productName:clean(row.productName), type:clean(row.type), quantity:round3(row.quantity), sourceRef:clean(row.sourceRef),
      responsible:clean(row.responsible), stockBefore:Number.isFinite(Number(row.stockBefore))?round3(row.stockBefore):null,
      stockAfter:Number.isFinite(Number(row.stockAfter))?round3(row.stockAfter):null, note:clean(row.note)
    })),
    purchases:(input?.purchases || []).map(row=>({
      purchaseId:clean(row.purchaseId), date:clean(row.date), occurredAt:clean(row.occurredAt), itemId:clean(row.itemId),
      productName:clean(row.productName), quantity:round3(row.quantity), unitCost:Number(row.unitCost || 0), supplier:clean(row.supplier),
      reference:clean(row.reference), responsible:clean(row.responsible), note:clean(row.note)
    })),
    counts:(input?.counts || []).map(row=>({
      countId:clean(row.countId), date:clean(row.date), occurredAt:clean(row.occurredAt), itemId:clean(row.itemId),
      productName:clean(row.productName), counted:round3(row.counted), previous:round3(row.previous), delta:round3(row.delta),
      responsible:clean(row.responsible), evidenceCount:Number(row.evidenceCount || 0)
    })),
    reconciliation:input?.reconciliation && typeof input.reconciliation === "object" ? input.reconciliation : {},
    payloadHash:clean(input?.payloadHash)
  };
}

function validatePayload(payload){
  const errors=[];
  if(payload.sourceSystem !== "better-mood-inventory") errors.push("sourceSystem");
  if(!["upaep","cholula"].includes(payload.branchId)) errors.push("branchId");
  if(!Number.isInteger(payload.sourceRevision) || payload.sourceRevision < 0) errors.push("sourceRevision");
  if(!payload.sourceUpdatedAt || !payload.generatedAt) errors.push("timestamps");
  if(payload.products.length > 1000 || payload.movements.length > 10000 || payload.counts.length > 10000) errors.push("limits");
  if(payload.products.some(row=>!row.itemId || !row.name)) errors.push("products");
  if(payload.stocks.some(row=>!row.itemId)) errors.push("stocks");
  if(payload.movements.some(row=>!row.movementId || !row.itemId || !row.date)) errors.push("movements");
  if(payload.payloadHash !== payloadHash(payload)) errors.push("payloadHash");
  return errors;
}

module.exports={ clean, normalizePayload, payloadHash, validatePayload };
