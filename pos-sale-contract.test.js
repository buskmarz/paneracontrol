const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePayload, sourceKey, validatePayload, compareRevision } = require("./netlify/functions/lib/pos-sale-contract");

function fixture(overrides={}){
  return normalizePayload({
    sourceSystem:"better-mood-pos", sourceOrderId:"order-1", sourceBranchId:"upaep",
    sourceRevision:1, sourceClosedAt:"2026-08-13T18:00:00.000Z", fecha:"2026-08-13T18:00:00.000Z",
    sourceOrderTotal:115, sourcePaneraTotal:115, subtotal:115, descuento:0, total:115, saldo:0,
    items:[{ sourceLineId:"line-1", prod:"Pastel", talla:"", precio:115, cant:1 }], pagos:[], ...overrides
  }, "2026-08-13T18:01:00.000Z");
}

test("normaliza una venta y genera clave estable", ()=>{
  const sale = fixture();
  assert.equal(sourceKey(sale), "better-mood-pos:upaep:order-1");
  assert.deepEqual(validatePayload(sale), []);
  assert.equal(sale.payloadHash.length, 64);
});

test("rechaza una venta sin lineas", ()=>{
  assert.ok(validatePayload(fixture({ items:[] })).includes("items_required"));
});

test("una revision nueva gana y una vieja no", ()=>{
  assert.ok(compareRevision(fixture({ sourceRevision:1 }), fixture({ sourceRevision:2 })) > 0);
  assert.ok(compareRevision(fixture({ sourceRevision:2 }), fixture({ sourceRevision:1 })) < 0);
});

test("con la misma revision gana la mutacion mas reciente", ()=>{
  const older = fixture({ sourceMutationAt:"2026-08-13T18:00:00.000Z" });
  const newer = fixture({ sourceMutationAt:"2026-08-13T18:05:00.000Z" });
  assert.ok(compareRevision(older, newer) > 0);
});
