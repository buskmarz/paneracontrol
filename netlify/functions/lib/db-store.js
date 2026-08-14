const STORE_NAME = "panera-db";
const KEY = "db";
const POS_SALES_PREFIX = "integrations/better-pos-sales/";
const POS_SALES_DELTA_PREFIX = "integrations/better-pos-sales-delta/";
const POS_SALES_SNAPSHOT_KEY = "integrations/better-pos-sales-snapshot";
const POS_RECONCILIATION_KEY = "integrations/better-pos-sales-reconciliation";
const { sourceKey, compareRevision } = require("./pos-sale-contract");

function getStoreConfig(){
  const siteID = String(
    process.env.NETLIFY_SITE_ID ||
    process.env.SITE_ID ||
    process.env.PANERA_BLOBS_SITE_ID ||
    ""
  ).trim();
  const token = String(
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_ACCESS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_PERSONAL_ACCESS_TOKEN ||
    process.env.PERSONAL_ACCESS_TOKEN ||
    process.env.PANERA_BLOBS_TOKEN_2026 ||
    ""
  ).trim();
  return siteID && token ? { siteID, token } : null;
}

async function openStore(){
  const { getStore } = await import("@netlify/blobs");
  const hasInjected = !!(process.env.NETLIFY_BLOBS_URL && process.env.NETLIFY_BLOBS_TOKEN);
  if(hasInjected) return getStore({ name:STORE_NAME, consistency:"strong" });
  const cfg = getStoreConfig();
  return cfg ? getStore({ name:STORE_NAME, consistency:"strong", ...cfg }) : null;
}

function parseDb(raw){
  if(!raw) return null;
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  try{ return JSON.parse(text); }catch(error){ return null; }
}

async function readDbRaw(store){
  const raw = await store.get(KEY);
  return parseDb(raw);
}

async function listKeys(store, prefix){
  const keys = [];
  const pages = store.list({ prefix, paginate:true });
  for await (const page of pages){
    for(const blob of page.blobs || []) keys.push(blob.key);
  }
  return keys;
}

async function readImportedSales(store){
  const snapshot = await store.get(POS_SALES_SNAPSHOT_KEY, { type:"json", consistency:"strong" }).catch(()=>null);
  const snapshotSales = Array.isArray(snapshot?.sales) ? snapshot.sales : [];
  const coveredDeltaKeys = new Set(Array.isArray(snapshot?.coveredDeltaKeys) ? snapshot.coveredDeltaKeys : []);
  const keys = (await listKeys(store, snapshotSales.length ? POS_SALES_DELTA_PREFIX : POS_SALES_PREFIX))
    .filter(key=>!coveredDeltaKeys.has(key));
  const records = (await Promise.all(keys.map(key=>store.get(key, { type:"json", consistency:"strong" }).catch(()=>null)))).filter(Boolean);
  const bySource = new Map();
  for(const record of [...snapshotSales, ...records]){
    const key = sourceKey(record);
    const current = bySource.get(key);
    if(!current || compareRevision(current, record) > 0) bySource.set(key, record);
  }
  return Array.from(bySource.values());
}

async function readImportedSale(store, branchId, sourceOrderId){
  const branch = String(branchId || "").trim().toLowerCase();
  const order = encodeURIComponent(String(sourceOrderId || "").trim());
  if(!branch || !order) return null;
  const keys = await listKeys(store, `${POS_SALES_PREFIX}${branch}/${order}/`);
  const records = (await Promise.all(keys.map(key=>store.get(key, { type:"json", consistency:"strong" }).catch(()=>null)))).filter(Boolean);
  return records.reduce((current, record)=>!current || compareRevision(current, record) > 0 ? record : current, null);
}

function combineDbWithImports(rawDb, imported, reconciliation){
  const db = rawDb && typeof rawDb === "object" ? rawDb : {};
  const manualSales = (Array.isArray(db.ventas) ? db.ventas : []).filter(sale=>sale?.sourceSystem !== "better-mood-pos");
  return {
    ...db,
    ventas:[...(imported || []), ...manualSales],
    meta:{ ...(db.meta || {}), ...(reconciliation ? { posIntegration:reconciliation } : {}) }
  };
}

async function readDb(store){
  const [rawDb, imported, reconciliation] = await Promise.all([
    readDbRaw(store),
    readImportedSales(store),
    store.get(POS_RECONCILIATION_KEY, { type:"json", consistency:"strong" }).catch(()=>null)
  ]);
  return combineDbWithImports(rawDb, imported, reconciliation);
}

function importedSaleRecordKey(sale){
  const branch = String(sale.sourceBranchId || "").trim().toLowerCase();
  const order = encodeURIComponent(String(sale.sourceOrderId || "").trim());
  const revision = String(Number(sale.sourceRevision || 0)).padStart(12, "0");
  const hash = String(sale.payloadHash || "").slice(0, 24);
  return `${POS_SALES_PREFIX}${branch}/${order}/${revision}-${hash}.json`;
}

function importedSaleDeltaKey(sale){
  return importedSaleRecordKey(sale).replace(POS_SALES_PREFIX, POS_SALES_DELTA_PREFIX);
}

async function writeImportedSale(store, sale){
  const key = importedSaleRecordKey(sale);
  const deltaKey = importedSaleDeltaKey(sale);
  const existing = await store.get(key, { type:"json", consistency:"strong" }).catch(()=>null);
  if(existing){
    await store.setJSON(deltaKey, existing);
    return { modified:false, key, sale:existing };
  }
  await store.setJSON(key, sale);
  await store.setJSON(deltaKey, sale);
  return { modified:true, key, sale };
}

async function writeImportedSalesSnapshot(store, sales){
  const rows = Array.isArray(sales) ? sales : [];
  const createdAt = new Date().toISOString();
  const coveredDeltaKeys = await listKeys(store, POS_SALES_DELTA_PREFIX);
  await store.setJSON(POS_SALES_SNAPSHOT_KEY, { createdAt, coveredDeltaKeys, sales:rows });
  return { createdAt, sales:rows.length, coveredDeltas:coveredDeltaKeys.length };
}

async function writeReconciliation(store, summary){
  await store.setJSON(POS_RECONCILIATION_KEY, summary);
  return summary;
}

module.exports = {
  KEY, STORE_NAME, POS_SALES_PREFIX, POS_SALES_DELTA_PREFIX, POS_SALES_SNAPSHOT_KEY, POS_RECONCILIATION_KEY,
  openStore, readDb, readDbRaw, readImportedSales, readImportedSale, combineDbWithImports,
  importedSaleRecordKey, importedSaleDeltaKey, writeImportedSale, writeImportedSalesSnapshot, writeReconciliation
};
