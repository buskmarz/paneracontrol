const test = require("node:test");
const assert = require("node:assert/strict");
const { importedSaleRecordKey, writeImportedSale, readImportedSale, readImportedSales } = require("./netlify/functions/lib/db-store");

function memoryStore(){
  const rows = new Map();
  return {
    rows,
    async setJSON(key, value){ rows.set(key, structuredClone(value)); },
    async get(key){ return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    list({ prefix }){
      return (async function*(){
        yield { blobs:Array.from(rows.keys()).filter(key=>key.startsWith(prefix)).map(key=>({ key })) };
      })();
    }
  };
}

const sale = (revision, mutationAt, hash)=>({
  sourceSystem:"better-mood-pos", sourceBranchId:"upaep", sourceOrderId:"order-1",
  sourceRevision:revision, sourceMutationAt:mutationAt, sourceClosedAt:"2026-08-13T18:00:00.000Z",
  payloadHash:hash, total:100
});

test("cada revision se guarda en un registro append-only e idempotente", async()=>{
  const store = memoryStore();
  const first = sale(1, "2026-08-13T18:00:00.000Z", "a".repeat(64));
  const next = sale(2, "2026-08-13T18:05:00.000Z", "b".repeat(64));
  assert.match(importedSaleRecordKey(first), /000000000001/);
  assert.equal((await writeImportedSale(store, first)).modified, true);
  assert.equal((await writeImportedSale(store, first)).modified, false);
  await writeImportedSale(store, next);
  const visible = await readImportedSales(store);
  assert.equal(store.rows.size, 2);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].sourceRevision, 2);
  const direct = await readImportedSale(store, "upaep", "order-1");
  assert.equal(direct.sourceRevision, 2);
  assert.equal(await readImportedSale(store, "cholula", "order-1"), null);
});
