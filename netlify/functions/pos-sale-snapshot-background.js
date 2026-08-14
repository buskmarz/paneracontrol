const crypto = require("node:crypto");
const { openStore, readImportedSales, writeImportedSalesSnapshot } = require("./lib/db-store");

function clean(value){ return String(value || "").trim(); }
function safeEqual(left, right){
  const a = Buffer.from(clean(left));
  const b = Buffer.from(clean(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async event=>{
  const provided = event.headers?.["x-panera-pos-secret"] || event.headers?.["X-Panera-Pos-Secret"];
  if(event.httpMethod !== "POST" || !safeEqual(provided, process.env.PANERA_POS_IMPORT_SECRET)){
    console.warn("Panera snapshot rebuild rejected");
    return;
  }
  const store = await openStore();
  if(!store) throw new Error("blobs_not_configured");
  const sales = await readImportedSales(store);
  const snapshot = await writeImportedSalesSnapshot(store, sales);
  console.log("Panera snapshot rebuilt", { sales:snapshot.sales });
};
