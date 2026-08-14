const test = require("node:test");
const assert = require("node:assert/strict");
const { combineDbWithImports } = require("./netlify/functions/lib/db-store");

const imported = revision=>({
  id:"pos-1", sourceSystem:"better-mood-pos", sourceBranchId:"upaep", sourceOrderId:"order-1",
  sourceRevision:revision, sourceClosedAt:"2026-08-13T18:00:00.000Z", folio:"PAN-0010"
});

test("un guardado del navegador no elimina ventas POS importadas", ()=>{
  const merged = combineDbWithImports({ ventas:[{ id:"manual-1" }] }, [imported(2)]);
  assert.equal(merged.ventas.length, 2);
  assert.ok(merged.ventas.some(sale=>sale.id === "pos-1"));
});

test("un frontend viejo no puede restaurar una revision importada anterior", ()=>{
  const merged = combineDbWithImports({ ventas:[imported(1)] }, [imported(3)]);
  assert.equal(merged.ventas.length, 1);
  assert.equal(merged.ventas[0].sourceRevision, 3);
});
