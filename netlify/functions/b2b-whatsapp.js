const { getStore } = require("@netlify/blobs");

const STORE_NAME = "panera-b2b-orders";
const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function json(statusCode, payload, headers = {}){
  return {
    statusCode,
    headers:{ ...BASE_HEADERS, ...headers },
    body:JSON.stringify(payload)
  };
}

function clean(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanProducts(value){
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("; ");
}

function whatsappUrl(message){
  const phone = clean(process.env.B2B_WHATSAPP_PHONE || process.env.WHATSAPP_PHONE).replace(/[^\d]/g, "");
  const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

async function saveOrder(order){
  try{
    const store = getStore(STORE_NAME);
    const key = `${new Date().toISOString().slice(0,10)}/${order.id}.json`;
    await store.setJSON(key, order);
    return true;
  }catch(error){
    return false;
  }
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS"){
    return json(204, {}, { Allow:"POST, OPTIONS" });
  }

  if(event.httpMethod !== "POST"){
    return json(405, { ok:false, error:"method_not_allowed" }, { Allow:"POST, OPTIONS" });
  }

  let payload;
  try{
    payload = JSON.parse(event.body || "{}");
  }catch(error){
    return json(400, { ok:false, error:"invalid_json" });
  }

  const nombre = clean(payload.nombre);
  const negocio = clean(payload.negocio);
  const telefono = clean(payload.telefono);
  const productos = cleanProducts(payload.productos);

  if(!nombre || !negocio || !productos){
    return json(400, { ok:false, error:"missing_required_fields" });
  }

  const message = `Hola, soy ${nombre} de ${negocio}. Quiero pedir: ${productos}`;
  const order = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    nombre,
    negocio,
    telefono,
    productos,
    message,
    createdAt: new Date().toISOString()
  };
  const saved = await saveOrder(order);

  return json(200, {
    ok:true,
    message,
    url:whatsappUrl(message),
    saved
  });
};
