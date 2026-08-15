const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizePayload,payloadHash,validatePayload}=require("./netlify/functions/lib/inventory-contract");

function fixture(){
  const base={schemaVersion:1,sourceSystem:"better-mood-inventory",sourceRevision:42,sourceUpdatedAt:"2026-08-14T10:00:00.000Z",generatedAt:"2026-08-14T10:01:00.000Z",branchId:"upaep",branchName:"UPAEP",products:[{itemId:"cake-1",name:"Pastel Ferrero",unit:"pieza",active:true,category:"Postres Panera",supplier:"Panera"}],stocks:[{itemId:"cake-1",stock:3,minimum:2,maximum:8,projectedStock:3,confirmedInbound:0,status:"OK"}],movements:[{movementId:"mov-1",date:"2026-08-14",occurredAt:"2026-08-14T09:00:00.000Z",itemId:"cake-1",productName:"Pastel Ferrero",type:"venta",quantity:-1,sourceRef:"UP-1",responsible:"Yayo",stockBefore:4,stockAfter:3,note:""}],purchases:[],counts:[],reconciliation:{products:1,negativeStocks:0,movements:1,purchases:0,counts:0}};
  return {...base,payloadHash:payloadHash(base)};
}

test("normaliza y valida una instantanea de inventario",()=>{
  const row=normalizePayload(fixture());
  assert.deepEqual(validatePayload(row),[]);
  assert.equal(row.branchId,"upaep");
  assert.equal(row.movements[0].movementId,"mov-1");
});

test("detecta alteraciones en el contenido",()=>{
  const row=normalizePayload(fixture());
  row.stocks[0].stock=99;
  assert.ok(validatePayload(row).includes("payloadHash"));
});
