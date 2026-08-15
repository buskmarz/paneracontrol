/* ==============================
   Panera Signature · Control de Pasteles
   ============================== */

/*******************************
 * SEED Y CATÁLOGOS BÁSICOS
 *******************************/
const METODOS_DEFAULT_GASTOS = ["Efectivo","Tarjeta","Transferencia","Cortesía"]; // GASTOS (default)
const METODOS_DEFAULT_VENTAS = ["Por definir","Efectivo","Transferencia","Tarjeta"];     // VENTAS (default)
const GASTO_CATS = ["Ingredientes","Empaques","Nómina","Renta","Servicios","Publicidad","Transporte","Mantenimiento","Varios"];
const CANALES = ["Whatsapp","Facebook","Instagram","Telefono"];
const ESTATUS_ENTREGA = ["Por preparar","Listo","En camino","Entregado","Cancelado"];
const DOW_ES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const ABC_DAYS = [
  { value:1, label:"Lun" }, { value:2, label:"Mar" }, { value:3, label:"Mié" },
  { value:4, label:"Jue" }, { value:5, label:"Vie" }, { value:6, label:"Sáb" }, { value:0, label:"Dom" }
];
const ABC_SCHEDULE_DEFAULT = { days:[1,2,3,4,5,6], start:"07:30", end:"13:30" };

/* ==============================
   Tema (claro/oscuro) + Charts
   ============================== */
function getPreferredTheme(){
  try{
    const saved = localStorage.getItem('panera.theme');
    if(saved==='dark' || saved==='light') return saved;
  }catch(e){}
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function toRgba(hex, a){
  const m = (hex||'').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i); if(!m) return hex||'#000';
  const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16); return `rgba(${r},${g},${b},${a})`;
}
function chartPalette(){
  return [cssVar('--p-blue')||'#66B6CC', cssVar('--p-deep')||'#2B4E59', cssVar('--ok')||'#16a34a', cssVar('--warn')||'#f59e0b', cssVar('--err')||'#dc2626', '#8b5cf6'];
}
function themeCharts(){
  if(typeof Chart==='undefined') return;
  const ink = cssVar('--ink') || '#111827';
  const grid = cssVar('--p-light') || '#e5e7eb';
  Chart.defaults.color = ink;
  Chart.defaults.borderColor = grid;
  Chart.defaults.font = { family:'-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif' };
}
function updateThemeToggleIcon(){
  const isDark = (document.documentElement.getAttribute('data-theme')||'')==='dark';
  const sun = document.getElementById('icon-sun'); const moon = document.getElementById('icon-moon');
  if(sun&&moon){ sun.style.display = isDark? 'none':'inline-block'; moon.style.display = isDark? 'inline-block':'none'; }
}
function setTheme(theme){
  const t = (theme==='dark')? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('panera.theme', t); }catch(e){}
  themeCharts();
  updateThemeToggleIcon();
  refreshChartsForTheme();
}
function toggleTheme(){
  const curr = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  setTheme(curr==='dark' ? 'light' : 'dark');
}
window._charts = window._charts || [];
function refreshChartsForTheme(){
  if(typeof Chart==='undefined') return;
  const pal = chartPalette();
  const grid = toRgba(cssVar('--p-light')||'#e5e7eb', .6);
  (window._charts||[]).forEach(ch=>{
    try{
      const type = ch.config.type;
      const ds = (ch.data && ch.data.datasets && ch.data.datasets[0]) ? ch.data.datasets[0] : null;
      if(type==='line' && ds){ ds.borderColor = pal[0]; ds.backgroundColor = toRgba(pal[0], .15);
        if(ch.options?.scales?.y){ ch.options.scales.y.grid = ch.options.scales.y.grid || {}; ch.options.scales.y.grid.color = grid; }
        if(ch.options?.scales?.x){ ch.options.scales.x.grid = ch.options.scales.x.grid || {}; ch.options.scales.x.grid.display = false; }
      }
      if(type==='bar' && ds){ ds.backgroundColor = pal[1];
        if(ch.options?.scales?.y){ ch.options.scales.y.grid = ch.options.scales.y.grid || {}; ch.options.scales.y.grid.color = grid; }
        if(ch.options?.scales?.x){ ch.options.scales.x.grid = ch.options.scales.x.grid || {}; ch.options.scales.x.grid.display = false; }
      }
      if(type==='doughnut' && ds){ const len = (ds.data||[]).length; ds.backgroundColor = Array.from({length:len}, (_,i)=> pal[i%pal.length]); }
      ch.update('none');
    }catch(e){}
  });
}

const CHART_JS_PATH = "/vendor/chart.umd.js";
let chartLibraryPromise = null;
function ensureChartLibrary(){
  if(typeof Chart !== "undefined") return Promise.resolve(Chart);
  if(chartLibraryPromise) return chartLibraryPromise;
  chartLibraryPromise = new Promise((resolve, reject)=>{
    const script = document.createElement("script");
    script.src = appPath(CHART_JS_PATH);
    script.async = true;
    script.onload = ()=>{
      themeCharts();
      resolve(window.Chart);
    };
    script.onerror = ()=>reject(new Error("chart_library_unavailable"));
    document.head.appendChild(script);
  });
  return chartLibraryPromise;
}
function scheduleChartLibrary(){
  const load = ()=>ensureChartLibrary().then(()=>{
    renderDashboard();
    renderFinanzas();
    recalcReceta();
  }).catch(()=>{});
  if("requestIdleCallback" in window){
    window.requestIdleCallback(load, { timeout:1200 });
  }else{
    setTimeout(load, 80);
  }
}

/*******************************
 * AUTH (SESION SEGURA)
 *******************************/
let AUTHENTICATED = false;
let authenticatedStartPromise = null;

function isLocalPreview(){
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
function authEndpoint(){ return appPath("/.netlify/functions/auth"); }
function isAuthed(){ return AUTHENTICATED; }
function setAuth(ok){ AUTHENTICATED = Boolean(ok); }
function updateAuthUI(){
  const btn = document.getElementById("logout-btn");
  if(btn) btn.classList.toggle("hidden", !isAuthed());
}
function showAuth(){
  const screen = document.getElementById("auth-screen");
  if(screen){ screen.classList.remove("hidden"); screen.setAttribute("aria-hidden","false"); }
  document.body.classList.add("auth-locked");
  updateAuthUI();
  document.getElementById("auth-user")?.focus();
}
function hideAuth(){
  const screen = document.getElementById("auth-screen");
  if(screen){ screen.classList.add("hidden"); screen.setAttribute("aria-hidden","true"); }
  document.body.classList.remove("auth-locked");
  updateAuthUI();
}
async function handleLogin(e){
  e.preventDefault();
  const u = (document.getElementById("auth-user")?.value || "").trim();
  const p = document.getElementById("auth-pass")?.value || "";
  const err = document.getElementById("auth-error");
  const submit = e.currentTarget?.querySelector('button[type="submit"]');
  if(!u || !p){ if(err) err.textContent = "Captura usuario y contrasena."; return; }
  if(submit) submit.disabled = true;
  if(err) err.textContent = "Verificando acceso...";
  try{
    if(!isLocalPreview()){
      const response = await fetchWithTimeout(authEndpoint(), {
        method:"POST",
        credentials:"same-origin",
        headers:{ "Content-Type":"application/json", Accept:"application/json" },
        body:JSON.stringify({ username:u, password:p })
      });
      if(!response.ok){
        if(err) err.textContent = response.status === 401 ? "Usuario o contrasena incorrecta." : "No se pudo validar el acceso.";
        return;
      }
    }else{
      sessionStorage.setItem("panera.preview.auth", "ok");
    }
    setAuth(true);
    if(err) err.textContent = "";
    const pass = document.getElementById("auth-pass"); if(pass) pass.value = "";
    hideAuth();
    await startAuthenticatedApp();
  }catch(error){
    if(err) err.textContent = "No se pudo conectar. Revisa internet e intenta de nuevo.";
  }finally{
    if(submit) submit.disabled = false;
  }
}
async function logout(){
  setAuth(false);
  authenticatedStartPromise = null;
  closeQuickCapture();
  try{ sessionStorage.removeItem("panera.preview.auth"); }catch(error){}
  if(!isLocalPreview()){
    fetch(authEndpoint(), { method:"DELETE", credentials:"same-origin", keepalive:true }).catch(()=>{});
  }
  const p = document.getElementById("auth-pass");
  if(p) p.value = "";
  showAuth();
}
function handleSessionExpired(){
  if(!isAuthed()) return;
  setAuth(false);
  authenticatedStartPromise = null;
  closeQuickCapture();
  showAuth();
  toast("Tu sesion vencio. Ingresa nuevamente.", "warn");
}
async function initAuth(){
  try{ localStorage.removeItem("panera.auth.v1"); }catch(error){}
  const form = document.getElementById("auth-form");
  if(form && !form.dataset.initialized){
    form.dataset.initialized = "true";
    form.addEventListener("submit", handleLogin);
  }
  const err = document.getElementById("auth-error");
  document.getElementById("auth-user")?.addEventListener("input", ()=>{ if(err) err.textContent = ""; });
  document.getElementById("auth-pass")?.addEventListener("input", ()=>{ if(err) err.textContent = ""; });
  if(isLocalPreview() && sessionStorage.getItem("panera.preview.auth") === "ok"){
    setAuth(true);
    hideAuth();
    return true;
  }
  if(!isLocalPreview()){
    try{
      const response = await fetchWithTimeout(authEndpoint(), { credentials:"same-origin", headers:{ Accept:"application/json" }, cache:"no-store" });
      if(response.ok){ setAuth(true); hideAuth(); return true; }
    }catch(error){}
  }
  setAuth(false);
  showAuth();
  return false;
}
function fillSelectFiltro(id_, arr, labelAll="(todos)"){
  const s = document.getElementById(id_);
  if(!s) return;
  s.replaceChildren(new Option(labelAll, ""));
  (arr||[]).forEach(value=>s.add(new Option(String(value), String(value))));
}

function getMetodosVentas(){ return (DB.config && Array.isArray(DB.config.metodosVentas) ? DB.config.metodosVentas : METODOS_DEFAULT_VENTAS).slice(); }
function getMetodosGastos(){ return (DB.config && Array.isArray(DB.config.metodosGastos) ? DB.config.metodosGastos : METODOS_DEFAULT_GASTOS).slice(); }

const SEED = [
  {categoria:"Pasteles", producto:"Pastel Flores", variantes:{MINI:220, CH:390, G:620}},
  {categoria:"Pasteles", producto:"Pastel Tiramisú", variantes:{MINI:190, CH:390, G:620}},
  {categoria:"Pasteles", producto:"Cheesecake Oreo", variantes:{MINI:190, CH:370, G:590}},
  {categoria:"Pasteles", producto:"Pastel de Lotus", variantes:{MINI:190, CH:370, G:590}},
  {categoria:"Pasteles", producto:"Cheesecake Tortuga", variantes:{MINI:190, CH:370, G:590}},
  {categoria:"Pasteles", producto:"Cheesecake Lotus", variantes:{MINI:190, CH:370, G:590}},
  {categoria:"Pasteles", producto:"Pastel Ferrero", variantes:{MINI:190, CH:370, G:590}},
  {categoria:"Pasteles", producto:"Pastel Confeti", variantes:{MINI:170, CH:340, G:540}},
  {categoria:"Pasteles", producto:"Pastel Coco", variantes:{MINI:170, CH:340, G:540}},
  {categoria:"Pasteles", producto:"Pastel Baileys", variantes:{MINI:170, CH:340, G:540}},
  {categoria:"Pasteles", producto:"Pastel Conejito", variantes:{MINI:170, CH:340, G:540}},
  {categoria:"Pasteles", producto:"Pastel Red Velvet", variantes:{MINI:170, CH:340, G:540}},
  {categoria:"Pasteles", producto:"Pastel Nutella", variantes:{MINI:160, CH:320, G:520}},
  {categoria:"Pasteles", producto:"Pastel Kisses", variantes:{MINI:160, CH:320, G:520}},
  {categoria:"Pasteles", producto:"Pastel Zanahoria", variantes:{MINI:150, CH:300, G:500}},
  {categoria:"Pasteles", producto:"Pastel Naranja", variantes:{MINI:150, CH:300, G:500}},
  {categoria:"Pasteles", producto:"Pastel Elote", variantes:{MINI:150, CH:300, G:500}},
  {categoria:"Panqués", producto:"Panqué de Matcha", variantes:{UNIDAD:360}},
  {categoria:"Panqués", producto:"Panqué de Avena (choco/almendra/nuez)", variantes:{UNIDAD:260}},
  {categoria:"Panqués", producto:"Panqué Tradicional (choco/almendra/nuez/plátano)", variantes:{UNIDAD:260}},
  {categoria:"Brownies", producto:"Brownies caja 9 pzas (nuez/almendra/pistache/oreo/pretzel)", variantes:{"CAJA 9":450}},
  {categoria:"Gelatinas", producto:"Gelatina de mazapán", variantes:{CH:250, G:350}},
  {categoria:"Gelatinas", producto:"Gelatina de chocolate", variantes:{CH:250, G:350}},
  {categoria:"Gelatinas", producto:"Gelatina de fresa", variantes:{CH:250, G:350}},
  {categoria:"Gelatinas", producto:"Gelatina de piña", variantes:{CH:250, G:350}},
  {categoria:"Trufas", producto:"Trufas cocoa/oscuro/blanco/con leche (12 pzas)", variantes:{"CAJA 12":260}},
  {categoria:"Tortugas", producto:"Tortugas (nuez/almendra/oreo/pretzel) 12 pzas", variantes:{"CAJA 12":260}},
  {categoria:"Para Perritos", producto:"Pastel con galletas", variantes:{UNIDAD:350}},
  {categoria:"Para Perritos", producto:"Pastel de hueso", variantes:{UNIDAD:260}},
  {categoria:"Roscas", producto:"Rosca Lotus", variantes:{CHICA:470, GRANDE:660}},
  {categoria:"Roscas", producto:"Rosca Ferrero", variantes:{CHICA:470, GRANDE:660}},
  {categoria:"Roscas", producto:"Rosca Conejito", variantes:{CHICA:470, GRANDE:660}},
];

const ENVIO_DEFAULT = {
  origin: { name:"Atzala", lat:19.0476062, lon:-98.2794810 },
  zones: [
    { name:"Zona 1", min:0, max:3, price:40 },
    { name:"Zona 2", min:3, max:6, price:60 },
    { name:"Zona 3", min:6, max:9, price:80 },
    { name:"Zona 4", min:9, max:12, price:100 },
    { name:"Zona 5", min:12, max:15, price:150 },
  ],
  extra: { km:15, price:0 }
};

/*******************************
 * BASE DE DATOS LOCAL
 *******************************/
const DB = {
  config: { prefijo:"PAN", seriePorDia:true },
  clientes: [],
  proveedores: [],
  productos: [],
  ventas: [],
  gastos: [],
  gastosRecurrentes: [],
  eventos: [],
  costeo: { materiales: [], recetas: [] },
  meta: { updatedAt: null }
};

function normalizeEnvioConfig(){
  if(!DB.config) DB.config = { prefijo:"PAN" };
  const base = JSON.parse(JSON.stringify(ENVIO_DEFAULT));
  if(!DB.config.envioRings || typeof DB.config.envioRings !== "object"){
    DB.config.envioRings = base;
    return;
  }
  const cfg = DB.config.envioRings;
  if(!cfg.origin || typeof cfg.origin !== "object") cfg.origin = base.origin;
  if(!Array.isArray(cfg.zones) || cfg.zones.length !== 5) cfg.zones = base.zones;
  if(!cfg.extra || typeof cfg.extra !== "object") cfg.extra = base.extra;
  cfg.origin.name = String(cfg.origin.name || base.origin.name).trim();
  const lat = Number(cfg.origin.lat); cfg.origin.lat = Number.isFinite(lat) ? lat : base.origin.lat;
  const lon = Number(cfg.origin.lon); cfg.origin.lon = Number.isFinite(lon) ? lon : base.origin.lon;
  cfg.zones = cfg.zones.map((z,i)=>{
    const fallback = base.zones[i] || { name:`Zona ${i+1}`, min:0, max:0, price:0 };
    return {
      name: (z && z.name) ? z.name : fallback.name,
      min: Number.isFinite(Number(z?.min)) ? Number(z.min) : fallback.min,
      max: Number.isFinite(Number(z?.max)) ? Number(z.max) : fallback.max,
      price: Number.isFinite(Number(z?.price)) ? Number(z.price) : fallback.price
    };
  });
  const extraKm = Number(cfg.extra.km);
  const extraPrice = Number(cfg.extra.price);
  cfg.extra.km = Number.isFinite(extraKm) ? extraKm : base.extra.km;
  cfg.extra.price = Number.isFinite(extraPrice) ? extraPrice : base.extra.price;
}

function normalizeAbcSchedule(){
  if(!DB.config) DB.config = { prefijo:"PAN" };
  const raw = DB.config.abcSchedule;
  const days = Array.isArray(raw?.days) ? raw.days.map(Number).filter(day=>Number.isInteger(day) && day>=0 && day<=6) : ABC_SCHEDULE_DEFAULT.days.slice();
  const uniqueDays = [...new Set(days)];
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  const start = validTime(raw?.start) ? raw.start : ABC_SCHEDULE_DEFAULT.start;
  const end = validTime(raw?.end) ? raw.end : ABC_SCHEDULE_DEFAULT.end;
  DB.config.abcSchedule = {
    days: uniqueDays.length ? uniqueDays : ABC_SCHEDULE_DEFAULT.days.slice(),
    start,
    end: end > start ? end : ABC_SCHEDULE_DEFAULT.end
  };
}

function normalizeDB(){
  if(!DB.meta) DB.meta = { updatedAt: null };
  if(!Array.isArray(DB.clientes)) DB.clientes = [];
  if(!Array.isArray(DB.proveedores)) DB.proveedores = [];
  if(!Array.isArray(DB.productos)) DB.productos = [];
  if(!Array.isArray(DB.ventas)) DB.ventas = [];
  if(!Array.isArray(DB.gastos)) DB.gastos = [];
  if(!Array.isArray(DB.gastosRecurrentes)) DB.gastosRecurrentes = [];
  if(!Array.isArray(DB.eventos)) DB.eventos = [];
  if(!DB.costeo) DB.costeo = { materiales: [], recetas: [] };
  if(!Array.isArray(DB.costeo.materiales)) DB.costeo.materiales = [];
  if(!Array.isArray(DB.costeo.recetas)) DB.costeo.recetas = [];
  DB.costeo.materiales.forEach(m=>{
    if(!m || m.contenidoUnidad) return;
    const u = (m.unidad||'').toLowerCase();
    if(u==='kilogramo'){
      m.contenido = Number(m.contenido||0) * 1000;
      m.contenidoUnidad = 'g';
    }else if(u==='litro'){
      m.contenido = Number(m.contenido||0) * 1000;
      m.contenidoUnidad = 'ml';
    }else{
      m.contenidoUnidad = baseUnitLabel(u);
    }
    m.costoUnit = computeCostoUnit(m.unidad, Number(m.contenido||0), Number(m.costo||0));
  });
  if(!Array.isArray(DB.productos) || DB.productos.length===0){
    DB.productos = SEED.map(x => ({...x, activo:true}));
  }
  // Agregar roscas si no existen (sin afectar catálogo actual)
  const roscasSeed = SEED.filter(p => p.categoria === "Roscas");
  roscasSeed.forEach(r => {
    const exists = DB.productos.some(p => (p.producto || "").toLowerCase() === r.producto.toLowerCase());
    if(!exists){ DB.productos.push({ ...r, activo:true }); }
  });
  if(!DB.config) DB.config = { prefijo:"PAN" };
  // Defaults de nuevas configuraciones
  if(DB.config.seriePorDia!==undefined) delete DB.config.seriePorDia;
  if(!DB.config.nombreNegocio) DB.config.nombreNegocio = 'Panera Signature';
  if(DB.config.autoPrintTicket===undefined) DB.config.autoPrintTicket = false;
  if(!Array.isArray(DB.config.metodosVentas)) DB.config.metodosVentas = METODOS_DEFAULT_VENTAS.slice();
  if(!Array.isArray(DB.config.metodosGastos)) DB.config.metodosGastos = METODOS_DEFAULT_GASTOS.slice();
  normalizeEnvioConfig();
  normalizeAbcSchedule();
}

function loadDB(){
  const raw = localStorage.getItem("panera.db.v1");
  if(raw){ try{ Object.assign(DB, JSON.parse(raw)); }catch(e){ console.warn("DB corrupta, se regenera."); } }
  normalizeDB();
}
function saveDB(opts={}){
  if(!opts.skipMeta){
    if(!DB.meta) DB.meta = {};
    DB.meta.updatedAt = new Date().toISOString();
  }
  localStorage.setItem("panera.db.v1", JSON.stringify(DB));
  setSyncStatus(opts.skipRemote ? "saved" : "saving");
  if(!opts.skipRemote) scheduleRemoteSave();
}

/*******************************
 * SYNC BACKEND (NETLIFY)
 *******************************/
const APP_BASE_PATH = window.location.pathname === "/sistema" || window.location.pathname.startsWith("/sistema/") ? "/sistema" : "";
function appPath(path){
  const p = String(path || "");
  return `${APP_BASE_PATH}${p.startsWith("/") ? p : "/"+p}`;
}
const REMOTE = {
  endpoint: appPath("/.netlify/functions/db"),
  timeoutMs: 8000,
  saveDelay: 800,
  saveTimer: null,
  saving: false,
  pending: false,
  errorShown: false
};
const DOCUMENTS_ENDPOINT = appPath("/.netlify/functions/documents");
const INVENTORY_ENDPOINT = appPath("/.netlify/functions/inventory-feed");
let PANERA_INVENTORY = { status:"idle", snapshots:[], error:"" };

function remoteWarn(msg){
  if(REMOTE.errorShown) return;
  REMOTE.errorShown = true;
  setSyncStatus("local");
  toast(msg, "warn");
}
function parseTime(val){
  const t = Date.parse(val || "");
  return Number.isFinite(t) ? t : 0;
}
async function fetchWithTimeout(url, options={}, timeoutMs=REMOTE.timeoutMs){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    return await fetch(url, { ...options, signal: controller.signal });
  }finally{
    clearTimeout(id);
  }
}
async function fetchRemoteDB(){
  try{
    const res = await fetchWithTimeout(REMOTE.endpoint, { credentials:"same-origin", headers:{ "Accept":"application/json" }, cache:"no-store" });
    if(res.status === 401){
      handleSessionExpired();
      return null;
    }
    if(res.status === 503){
      const data = await res.json().catch(()=>null);
      if(data && data.error === "blobs_not_configured"){
        remoteWarn("Backend sin Blobs (faltan credenciales). Define PANERA_BLOBS_SITE_ID y PANERA_BLOBS_TOKEN_2026.");
      }else{
        remoteWarn("Backend no disponible; usando modo local.");
      }
      return null;
    }
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data && data.db) ? data.db : null;
  }catch(e){
    remoteWarn("Backend no disponible; usando modo local.");
    return null;
  }
}
async function pushRemoteDB(){
  if(!isAuthed()) return false;
  if(REMOTE.saving){ REMOTE.pending = true; return false; }
  REMOTE.saving = true;
  try{
    const res = await fetchWithTimeout(REMOTE.endpoint, {
      method: "POST",
      credentials:"same-origin",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ db: DB })
    });
    if(res.status === 401){
      handleSessionExpired();
      return false;
    }
    if(res.status === 503){
      const data = await res.json().catch(()=>null);
      if(data && data.error === "blobs_not_configured"){
        remoteWarn("Backend sin Blobs (faltan credenciales). Define PANERA_BLOBS_SITE_ID y PANERA_BLOBS_TOKEN_2026.");
      }else{
        remoteWarn("No se pudo guardar en backend. Se quedo en local.");
      }
      return false;
    }
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    setSyncStatus("saved");
    return true;
  }catch(e){
    setSyncStatus("local");
    remoteWarn("No se pudo guardar en backend. Se quedo en local.");
    return false;
  }finally{
    REMOTE.saving = false;
    if(REMOTE.pending){ REMOTE.pending = false; scheduleRemoteSave(); }
  }
}
function scheduleRemoteSave(){
  if(REMOTE.saveTimer) clearTimeout(REMOTE.saveTimer);
  if(!isAuthed()) return;
  REMOTE.saveTimer = setTimeout(pushRemoteDB, REMOTE.saveDelay);
}
function applyRemote(remote){
  if(!remote || typeof remote !== "object") return;
  Object.keys(DB).forEach(k=> delete DB[k]);
  Object.assign(DB, remote);
  normalizeDB();
  saveDB({ skipRemote: true, skipMeta: true });
}
function mergeRemotePosSales(remote){
  const imported = Array.isArray(remote?.ventas) ? remote.ventas.filter(v=>v?.sourceSystem === "better-mood-pos") : [];
  const manual = Array.isArray(DB.ventas) ? DB.ventas.filter(v=>v?.sourceSystem !== "better-mood-pos") : [];
  DB.ventas = [...imported, ...manual];
  if(remote?.meta?.posIntegration){
    DB.meta = { ...(DB.meta || {}), posIntegration:remote.meta.posIntegration };
  }
  normalizeDB();
  saveDB({ skipRemote:true, skipMeta:true });
}
async function syncRemoteDB(){
  setSyncStatus("saving");
  const remote = await fetchRemoteDB();
  if(!remote){ if(isAuthed()) scheduleRemoteSave(); return false; }
  const localAt = parseTime(DB.meta && DB.meta.updatedAt);
  const remoteAt = parseTime(remote.meta && remote.meta.updatedAt);
  if(remoteAt && (!localAt || remoteAt > localAt)){ applyRemote(remote); setSyncStatus("saved"); return true; }
  mergeRemotePosSales(remote);
  if(localAt && (!remoteAt || localAt > remoteAt)){ scheduleRemoteSave(); }
  else setSyncStatus("saved");
  return false;
}

/*******************************
 * UTILIDADES
 *******************************/
const fmt = n => (Number(n||0)).toLocaleString("es-MX", { style:"currency", currency:"MXN" });
const pad2 = n => String(n).padStart(2,'0');
const ymd = (d)=>{
  if(typeof d === "string"){
    const match = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const dt = d ? new Date(d) : new Date();
  if(Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
};
const hoyISO = ()=> ymd(new Date());
const nowLocalDateTime = ()=>{ const dt = new Date(); return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`; };
const fmtLocal = (d)=>{ try{ const dt=new Date(d); return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`; }catch(e){ return String(d).replace('T',' ').slice(0,16); } };
const id = () => Math.random().toString(36).slice(2,10);
const sum = (arr,sel) => arr.reduce((a,x)=>a+(sel?sel(x):x),0);
function setSyncStatus(state="saved"){
  const el = document.getElementById("sync-status");
  if(!el) return;
  const labels = { saved:"Guardado", saving:"Guardando", local:"Sólo local" };
  el.dataset.state = state;
  el.textContent = labels[state] || labels.saved;
}
function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function dataAttr(value){
  return escapeHtml(encodeURIComponent(String(value ?? "")));
}
function formatBytes(bytes){
  const size = Number(bytes || 0);
  if(size < 1024) return `${size} B`;
  if(size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function nextFolio(){
  const pf = DB.config.prefijo || "PAN";
  const key = `folio.consecutive`;
  let n = Number(localStorage.getItem(key)||0)+1;
  localStorage.setItem(key, String(n));
  return `${pf}-${String(n).padStart(4, "0")}`;
}

// Toast visual simple (success/warn/error)
function toast(msg, kind="ok", timeout=2400){
  try{
    let root = document.querySelector('.toast-wrap');
    if(!root){ root = document.createElement('div'); root.className='toast-wrap'; root.setAttribute('role','status'); root.setAttribute('aria-live','polite'); document.body.appendChild(root); }
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = msg;
    root.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; el.style.transition='all .2s ease'; }, timeout-200);
    setTimeout(()=>{ el.remove(); }, timeout);
  }catch(e){ console.log(msg); }
}

/*******************************
 * DOCUMENTOS PRIVADOS
 *******************************/
function setDocumentsStatus(message, kind="muted"){
  const el = document.getElementById('documents-status');
  if(!el) return;
  el.textContent = message || '';
  el.className = kind === 'err' ? 'status-error' : kind === 'ok' ? 'status-ok' : 'muted';
}
function arrayBufferToBase64(buffer){
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for(let i=0; i<bytes.length; i+=chunkSize){
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function clearDocumentForm(){
  ['doc-title','doc-reference'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const file = document.getElementById('doc-file'); if(file) file.value='';
  const date = document.getElementById('doc-date'); if(date) date.value=hoyISO();
  const category = document.getElementById('doc-category'); if(category) category.value='Bancario';
  setDocumentsStatus('');
}
function renderDocuments(documents){
  const tb = document.querySelector('#tabla-documentos tbody');
  if(!tb) return;
  const rows = (documents || []).map(doc=>`<tr>
    <td><b>${escapeHtml(doc.title || doc.fileName)}</b></td>
    <td>${escapeHtml(doc.category || 'Otro')}</td>
    <td>${escapeHtml(doc.date || '—')}</td>
    <td>${escapeHtml(doc.reference || '—')}</td>
    <td>${escapeHtml(doc.fileName || '—')} <span class="muted">(${formatBytes(doc.size)})</span></td>
    <td>
      <button class="btn alt sm" data-id="${dataAttr(doc.id)}" onclick="downloadDocument(decodeURIComponent(this.dataset.id))">Descargar</button>
      <button class="btn ghost sm" data-id="${dataAttr(doc.id)}" onclick="deleteDocument(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`).join('');
  tb.innerHTML = rows || '<tr><td colspan="6" class="muted">No hay documentos cargados.</td></tr>';
}
async function listDocuments(){
  try{
    const response = await fetchWithTimeout(DOCUMENTS_ENDPOINT, { credentials:'same-origin', headers:{ Accept:'application/json' }, cache:'no-store' });
    if(response.status === 401){ handleSessionExpired(); return; }
    const data = await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    renderDocuments(data?.documents || []);
    setDocumentsStatus(`${(data?.documents || []).length} documento(s) privado(s).`, 'muted');
  }catch(error){
    renderDocuments([]);
    setDocumentsStatus('El almacenamiento privado aún no está disponible en este deploy.', 'err');
  }
}
async function uploadDocument(){
  const file = document.getElementById('doc-file')?.files?.[0];
  if(!file){ setDocumentsStatus('Selecciona un PDF o imagen.', 'err'); return; }
  if(file.size > 6 * 1024 * 1024){ setDocumentsStatus('El archivo supera el límite de 6 MB.', 'err'); return; }
  const title = (document.getElementById('doc-title')?.value || '').trim() || file.name;
  const date = document.getElementById('doc-date')?.value || hoyISO();
  const category = document.getElementById('doc-category')?.value || 'Otro';
  const reference = (document.getElementById('doc-reference')?.value || '').trim();
  setDocumentsStatus('Subiendo documento privado...', 'muted');
  try{
    const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
    const response = await fetchWithTimeout(DOCUMENTS_ENDPOINT, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'upload', fileName:file.name, contentType:file.type || 'application/octet-stream', contentBase64, title, date, category, reference })
    });
    if(response.status === 401){ handleSessionExpired(); return; }
    const data = await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    clearDocumentForm();
    setDocumentsStatus('Documento guardado de forma privada.', 'ok');
    await listDocuments();
    toast('Documento privado guardado');
  }catch(error){
    setDocumentsStatus('No se pudo guardar el documento. Revisa la configuración de Netlify Blobs.', 'err');
  }
}
async function downloadDocument(docId){
  if(!docId) return;
  setDocumentsStatus('Preparando descarga...', 'muted');
  try{
    const response = await fetchWithTimeout(`${DOCUMENTS_ENDPOINT}?id=${encodeURIComponent(docId)}`, { credentials:'same-origin', cache:'no-store' });
    if(response.status === 401){ handleSessionExpired(); return; }
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href=url; link.download='documento-panera'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    setDocumentsStatus('Descarga iniciada.', 'ok');
  }catch(error){ setDocumentsStatus('No se pudo descargar el documento.', 'err'); }
}
async function deleteDocument(docId){
  if(!docId || !confirm('¿Eliminar este documento privado?')) return;
  try{
    const response = await fetchWithTimeout(DOCUMENTS_ENDPOINT, { method:'DELETE', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({id:docId}) });
    if(response.status === 401){ handleSessionExpired(); return; }
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    await listDocuments();
    toast('Documento eliminado');
  }catch(error){ setDocumentsStatus('No se pudo eliminar el documento.', 'err'); }
}

/*******************************
 * B2B INTEGRADO
 *******************************/
const B2B_STORAGE_KEY = "panera.b2b.order";
function getB2BProducts(){ return Array.isArray(window.PANERA_B2B_PRODUCTS) ? window.PANERA_B2B_PRODUCTS : []; }
function b2bAssetPath(path){
  const clean = String(path||'').replace(/^\/+/, '');
  return appPath('/'+clean);
}
function getB2BOrder(){
  try{
    const raw = localStorage.getItem(B2B_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    return [];
  }
}
function saveB2BOrder(items){ localStorage.setItem(B2B_STORAGE_KEY, JSON.stringify(items)); }
function findB2BProduct(id){ return getB2BProducts().find(product => product.id === id); }
function b2bProductLine(product){
  return `${product.name} (${Object.entries(product.prices || {}).map(([range, price]) => `${range}: ${price}`).join(", ")})`;
}
function renderB2B(){
  const products = getB2BProducts();
  const grid = document.querySelector("[data-b2b-catalog-grid]");
  if(grid){
    grid.innerHTML = products.map(product => `
      <article class="b2b-product">
        <img src="${escapeHtml(b2bAssetPath(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy">
        <div class="b2b-product-body">
          <h3>${escapeHtml(product.name)}</h3>
          <div class="b2b-prices">
            ${Object.entries(product.prices || {}).map(([range, price]) => `
              <div class="b2b-price-row"><span>${escapeHtml(range)}</span><strong>${escapeHtml(price)}</strong></div>
            `).join("")}
          </div>
          <button class="btn primary" type="button" data-id="${dataAttr(product.id)}" onclick="addB2BProduct(decodeURIComponent(this.dataset.id))">Agregar pedido</button>
        </div>
      </article>
    `).join("") || `<p class="muted">No hay productos B2B configurados.</p>`;
  }
  renderB2BSelected();
}
function selectedB2BProducts(){ return getB2BOrder().map(findB2BProduct).filter(Boolean); }
function selectedB2BText(){
  const selected = selectedB2BProducts();
  return selected.length ? selected.map(b2bProductLine).join("\n") : "";
}
function addB2BProduct(productId){
  if(!findB2BProduct(productId)) return;
  const items = getB2BOrder();
  if(!items.includes(productId)) items.push(productId);
  saveB2BOrder(items);
  renderB2BSelected();
  toast("Producto agregado a B2B");
}
function removeB2BProduct(productId){
  saveB2BOrder(getB2BOrder().filter(item => item !== productId));
  renderB2BSelected();
}
function clearB2BOrder(){
  saveB2BOrder([]);
  const textarea = document.querySelector("[data-b2b-products-field]");
  if(textarea){
    textarea.dataset.userEdited = "";
    textarea.value = "";
  }
  renderB2BSelected();
}
function renderB2BSelected(){
  const selected = selectedB2BProducts();
  const list = document.querySelector("[data-b2b-selected-list]");
  const textarea = document.querySelector("[data-b2b-products-field]");
  const counter = document.getElementById("b2b-selected-count");
  if(counter) counter.textContent = String(selected.length);
  if(textarea && !textarea.dataset.userEdited) textarea.value = selectedB2BText();
  if(!list) return;
  if(!selected.length){
    list.innerHTML = `<p class="muted">Aún no hay productos seleccionados. Agrega productos desde el catálogo B2B.</p>`;
    return;
  }
  list.innerHTML = selected.map(product => `
    <div class="b2b-selected-item">
      <span>${escapeHtml(product.name)}</span>
      <button class="btn ghost sm" type="button" data-id="${dataAttr(product.id)}" onclick="removeB2BProduct(decodeURIComponent(this.dataset.id))">Quitar</button>
    </div>
  `).join("");
}
async function submitB2BOrder(event){
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("[data-b2b-order-status]");
  const payload = {
    nombre: form.nombre.value.trim(),
    negocio: form.negocio.value.trim(),
    telefono: form.telefono.value.trim(),
    productos: form.productos.value.trim()
  };
  if(!payload.nombre || !payload.negocio || !payload.productos){
    if(status){
      status.textContent = "Completa nombre, negocio y productos para enviar el pedido.";
      status.className = "b2b-status error";
    }
    return;
  }
  if(status){
    status.textContent = "Preparando mensaje de WhatsApp...";
    status.className = "b2b-status";
  }
  try{
    const response = await fetch(appPath("/.netlify/functions/b2b-whatsapp"), {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const data = await response.json();
    if(!response.ok || !data.url) throw new Error(data.error || "No se pudo generar el mensaje.");
    window.location.href = data.url;
  }catch(error){
    const message = `Hola, soy ${payload.nombre} de ${payload.negocio}. Quiero pedir: ${payload.productos}`;
    window.location.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
}

function getSelectEstatus(){
  return document.getElementById("v-estatus-pago-top") || document.getElementById("v-estatus-pago");
}
function syncEstatusSelects(src){
  const top = document.getElementById("v-estatus-pago-top");
  const bottom = document.getElementById("v-estatus-pago");
  if(!src) return;
  const val = src.value;
  if(top && src!==top) top.value = val||"";
  if(bottom && src!==bottom) bottom.value = val||"";
  // Sugerir cubrir saldo si marcan "pagado"
  if(val === 'pagado'){
    const sub = sum(VENTA.items, it=>it.precio*it.cant);
    const desc = Number(document.getElementById("t-descuento").value||0);
    const total = Math.max(0, sub - desc);
    const pagado = sum(VENTA.pagos, p=>p.monto);
    const saldo = Math.max(0, total - pagado);
    if(saldo > 0){
      const inp = document.getElementById('pago-monto');
      if(inp){ inp.value = saldo; inp.focus(); }
      toast('Se llenó el monto con el saldo pendiente.', 'warn');
    }
  }
  recalc();
}

/*******************************
 * CAPTURA RÁPIDA Y ACCESIBILIDAD
 *******************************/
const QUICK_DELIVERY_METHODS = ["A domicilio","Recogen en Better","Recogen en Lomas","Recogen en Atzala"];
const QUICK_CAPTURE_COPY = {
  venta:"Registra una venta sin salir de tu módulo actual.",
  gasto:"Registra un egreso y actualiza finanzas al instante.",
  cliente:"Agrega o actualiza los datos básicos de un cliente.",
  evento:"Añade una fecha al calendario operativo.",
  material:"Agrega o actualiza un insumo para tus recetas."
};
let quickCaptureType = "venta";
let quickReturnFocus = null;
let quickProductLookup = new Map();

function replaceSelectOptions(selectId, values, selectedValue=""){
  const select = document.getElementById(selectId);
  if(!select) return;
  select.replaceChildren();
  values.forEach(value=>{
    const item = typeof value === "string" ? { value, label:value } : value;
    const option = new Option(item.label, item.value);
    if(item.disabled) option.disabled = true;
    if(item.selected || item.value === selectedValue) option.selected = true;
    select.add(option);
  });
}

function readQuickDefaults(){
  try{ return JSON.parse(localStorage.getItem("panera.quick.defaults") || "{}"); }
  catch(e){ return {}; }
}

function saveQuickDefaults(){
  const defaults = {
    canal:document.getElementById("qv-canal")?.value || "Whatsapp",
    envio:document.getElementById("qv-envio")?.value || "Recogen en Atzala",
    estatus:document.getElementById("qv-estatus")?.value || "por_cobrar",
    metodoVenta:document.getElementById("qv-metodo")?.value || "Por definir",
    categoriaGasto:document.getElementById("qg-categoria")?.value || "Ingredientes",
    metodoGasto:document.getElementById("qg-metodo")?.value || "Efectivo"
  };
  localStorage.setItem("panera.quick.defaults", JSON.stringify(defaults));
}

function renderQuickProductOptions(){
  const input = document.getElementById("qv-producto");
  const datalist = document.getElementById("qv-productos-list");
  if(!input || !datalist) return;
  quickProductLookup = new Map();
  datalist.replaceChildren();
  DB.productos.filter(product=>product.activo!==false).forEach(product=>{
    Object.entries(product.variantes || {}).forEach(([variant, price])=>{
      const label = `${product.producto} · ${variant} · ${fmt(price)}`;
      quickProductLookup.set(label, { product:product.producto, variant, price:Number(price || 0) });
      const option = document.createElement("option");
      option.value = label;
      datalist.appendChild(option);
    });
  });
  updateQuickSaleTotal();
}

function updateQuickSaleTotal(){
  const selected = quickProductLookup.get(document.getElementById("qv-producto")?.value || "");
  const quantity = Number(document.getElementById("qv-cantidad")?.value || 0);
  const total = Number(selected?.price || 0) * Math.max(0, quantity);
  const output = document.getElementById("qv-total");
  if(output) output.textContent = fmt(total);
}

function syncQuickMaterialUnit(){
  const unit = document.getElementById("qm-unidad")?.value || "pieza";
  const options = inputUnitOptions(unit).map(item=>({ value:item.value, label:item.label }));
  replaceSelectOptions("qm-contenido-unidad", options, defaultInputUnit(unit));
}

function initQuickCapture(){
  const defaults = readQuickDefaults();
  renderQuickProductOptions();
  replaceSelectOptions("qv-canal", CANALES, defaults.canal || "Whatsapp");
  replaceSelectOptions("qv-envio", QUICK_DELIVERY_METHODS, defaults.envio || "Recogen en Atzala");
  replaceSelectOptions("qv-metodo", getMetodosVentas(), defaults.metodoVenta || "Por definir");
  replaceSelectOptions("qg-categoria", GASTO_CATS, defaults.categoriaGasto || "Ingredientes");
  replaceSelectOptions("qg-metodo", getMetodosGastos(), defaults.metodoGasto || "Efectivo");
  const saleStatus = document.getElementById("qv-estatus"); if(saleStatus) saleStatus.value = defaults.estatus || "por_cobrar";
  const saleDate = document.getElementById("qv-fecha"); if(saleDate && !saleDate.value) saleDate.value = nowLocalDateTime();
  const expenseDate = document.getElementById("qg-fecha"); if(expenseDate && !expenseDate.value) expenseDate.value = hoyISO();
  const eventDate = document.getElementById("qe-fecha"); if(eventDate && !eventDate.value) eventDate.value = hoyISO();
  syncQuickMaterialUnit();

  const modal = document.getElementById("quick-capture");
  if(modal && !modal.dataset.initialized){
    modal.dataset.initialized = "true";
    modal.addEventListener("mousedown", event=>{ if(event.target === modal) closeQuickCapture(); });
    document.getElementById("qv-producto")?.addEventListener("input", updateQuickSaleTotal);
    document.getElementById("qv-cantidad")?.addEventListener("input", updateQuickSaleTotal);
  }
  const storedType = localStorage.getItem("panera.quick.type");
  setQuickCaptureType(QUICK_CAPTURE_COPY[storedType] ? storedType : "venta", false);
}

function setQuickCaptureType(type, focus=true){
  if(!QUICK_CAPTURE_COPY[type]) type = "venta";
  quickCaptureType = type;
  localStorage.setItem("panera.quick.type", type);
  document.querySelectorAll("[data-quick-type]").forEach(button=>{
    const active = button.dataset.quickType === type;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-quick-panel]").forEach(panel=>{
    const active = panel.dataset.quickPanel === type;
    panel.classList.toggle("hidden", !active);
    panel.setAttribute("aria-hidden", String(!active));
  });
  const subtitle = document.getElementById("quick-capture-subtitle");
  if(subtitle) subtitle.textContent = QUICK_CAPTURE_COPY[type];
  if(focus){
    setTimeout(()=>document.querySelector(`[data-quick-panel="${type}"] input:not([type="hidden"]), [data-quick-panel="${type}"] select`)?.focus(), 20);
  }
}

function openQuickCapture(type){
  if(!isAuthed()){ showAuth(); return; }
  initQuickCapture();
  quickReturnFocus = document.activeElement;
  const modal = document.getElementById("quick-capture");
  if(!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setQuickCaptureType(type || quickCaptureType || "venta");
}

function closeQuickCapture(){
  const modal = document.getElementById("quick-capture");
  if(!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if(quickReturnFocus && typeof quickReturnFocus.focus === "function") quickReturnFocus.focus();
}

function openFullCapture(tabId, sectionId=""){
  closeQuickCapture();
  document.querySelector(`nav button[data-tab="${tabId}"]`)?.click();
  if(sectionId) setTimeout(()=>scrollToSection(sectionId), 30);
}

function scrollToSection(sectionId){
  document.getElementById(sectionId)?.scrollIntoView({ behavior:"smooth", block:"start" });
}

function saveQuickSale(event){
  event.preventDefault();
  const selected = quickProductLookup.get(document.getElementById("qv-producto")?.value || "");
  const product = selected?.product || "";
  const variant = selected?.variant || "";
  const price = Number(selected?.price || 0);
  const quantity = Number(document.getElementById("qv-cantidad")?.value || 0);
  if(!product || !variant || price<=0 || quantity<=0){ toast("Selecciona un producto y una cantidad válida", "err"); return; }

  const customerName = (document.getElementById("qv-cliente")?.value || "").trim();
  const customer = upsertClientePorNombre(customerName);
  const channel = document.getElementById("qv-canal")?.value || "Whatsapp";
  const deliveryMethod = document.getElementById("qv-envio")?.value || "Recogen en Atzala";
  const paymentStatus = document.getElementById("qv-estatus")?.value || "por_cobrar";
  const paymentMethod = document.getElementById("qv-metodo")?.value || "Por definir";
  const saleDate = document.getElementById("qv-fecha")?.value || nowLocalDateTime();
  const total = price * quantity;
  const payments = paymentStatus === "pagado" ? [{ fecha:saleDate, metodo:paymentMethod, monto:total }] : [];
  const sale = {
    id:id(), folio:nextFolio(), fecha:saleDate,
    clienteId:customer.id, clienteNombre:customer.nombre,
    canal:channel, subtotal:total, descuento:0, total, saldo:paymentStatus === "pagado" ? 0 : total,
    estatusPago:paymentStatus === "pagado" ? "Pagado" : "Por Cobrar",
    estatusEntrega:"Por preparar", notas:"",
    entrega:{ metodo:deliveryMethod, fecha:"", dir:"" }, envioMetodo:deliveryMethod,
    items:[{ id:id(), prod:product, talla:variant, precio:price, cant:quantity }],
    pagos:payments
  };
  DB.ventas.unshift(sale);
  saveQuickDefaults();
  saveDB();
  renderVentasRecientes();
  renderClientes();
  scheduleDashboardRender();
  renderFinanzas();
  event.currentTarget.reset();
  document.getElementById("qv-cantidad").value = 1;
  document.getElementById("qv-fecha").value = nowLocalDateTime();
  initQuickCapture();
  closeQuickCapture();
  toast(`Venta guardada: ${sale.folio}`);
}

function saveQuickExpense(event){
  event.preventDefault();
  const date = document.getElementById("qg-fecha")?.value || hoyISO();
  const category = document.getElementById("qg-categoria")?.value || "";
  const amount = Number(document.getElementById("qg-monto")?.value || 0);
  const method = document.getElementById("qg-metodo")?.value || "";
  const provider = (document.getElementById("qg-proveedor")?.value || "").trim();
  const description = (document.getElementById("qg-descripcion")?.value || "").trim();
  if(!category || !method || amount<=0){ toast("Completa categoría, método y monto", "err"); return; }
  DB.gastos.unshift({ id:id(), fecha:date, categoria:category, proveedor:provider, metodo:method, monto:amount, desc:description });
  if(provider && !DB.proveedores.includes(provider)) DB.proveedores.push(provider);
  saveQuickDefaults();
  saveDB();
  renderProveedoresDatalist();
  renderGastos();
  scheduleDashboardRender();
  renderFinanzas();
  event.currentTarget.reset();
  document.getElementById("qg-fecha").value = hoyISO();
  initQuickCapture();
  closeQuickCapture();
  toast("Gasto guardado");
}

function saveQuickClient(event){
  event.preventDefault();
  const name = (document.getElementById("qc-nombre")?.value || "").trim();
  const phone = (document.getElementById("qc-telefono")?.value || "").trim();
  const address = (document.getElementById("qc-direccion")?.value || "").trim();
  const notes = (document.getElementById("qc-notas")?.value || "").trim();
  if(!name){ toast("Captura el nombre del cliente", "err"); return; }
  let customer = DB.clientes.find(item=>(item.nombre || "").toLowerCase() === name.toLowerCase());
  if(!customer){ customer = { id:id(), creadoEn:new Date().toISOString() }; DB.clientes.push(customer); }
  customer.nombre = name;
  if(phone || !customer.telefono) customer.telefono = phone;
  if(address || !customer.direccion) customer.direccion = address;
  if(notes || !customer.notas) customer.notas = notes;
  saveDB();
  renderClientesDatalist();
  renderClientes();
  event.currentTarget.reset();
  closeQuickCapture();
  toast("Cliente guardado");
}

function saveQuickEvent(event){
  event.preventDefault();
  const name = (document.getElementById("qe-nombre")?.value || "").trim();
  const date = document.getElementById("qe-fecha")?.value || "";
  const relevant = document.getElementById("qe-relevante")?.value === "si";
  if(!name || !date){ toast("Completa evento y fecha", "err"); return; }
  DB.eventos.push({ id:id_uniq(), nombre:name, fecha:date, relevante:relevant });
  saveDB();
  renderEventos();
  renderCalendario();
  event.currentTarget.reset();
  document.getElementById("qe-fecha").value = hoyISO();
  closeQuickCapture();
  toast("Evento guardado");
}

function saveQuickMaterial(event){
  event.preventDefault();
  const name = (document.getElementById("qm-nombre")?.value || "").trim();
  const unit = document.getElementById("qm-unidad")?.value || "pieza";
  const contentInput = Number(document.getElementById("qm-contenido")?.value || 0);
  const contentUnit = document.getElementById("qm-contenido-unidad")?.value || defaultInputUnit(unit);
  const content = toBaseAmount(contentInput, contentUnit);
  const cost = Number(document.getElementById("qm-costo")?.value || 0);
  if(!name || content<=0 || cost<=0){ toast("Completa nombre, contenido y costo", "err"); return; }
  const materialData = { nombre:name, unidad:unit, contenido:content, contenidoUnidad:baseUnitLabel(unit), costo:cost, costoUnit:computeCostoUnit(unit, content, cost) };
  const existing = DB.costeo.materiales.find(item=>(item.nombre || "").toLowerCase() === name.toLowerCase());
  if(existing) Object.assign(existing, materialData);
  else DB.costeo.materiales.push({ id:id_uniq(), ...materialData });
  saveDB();
  renderMateriales();
  renderSelectMateriales();
  recalcReceta();
  event.currentTarget.reset();
  syncQuickMaterialUnit();
  closeQuickCapture();
  toast(existing ? "Insumo actualizado" : "Insumo guardado");
}

function wireFormLabels(){
  let generated = 0;
  document.querySelectorAll("label:not([for])").forEach(label=>{
    let control = label.querySelector("input,select,textarea");
    if(!control){
      const next = label.nextElementSibling;
      if(next?.matches("input,select,textarea")) control = next;
      else if(next){
        const nested = next.querySelectorAll("input,select,textarea");
        if(nested.length === 1) control = nested[0];
      }
    }
    if(!control){
      const direct = label.parentElement?.querySelectorAll(":scope > input, :scope > select, :scope > textarea") || [];
      if(direct.length === 1) control = direct[0];
    }
    if(!control) return;
    if(!control.id){
      generated += 1;
      control.id = `panera-field-${generated}`;
    }
    label.htmlFor = control.id;
  });
}

function initKeyboardCapture(){
  if(document.documentElement.dataset.quickKeys === "true") return;
  document.documentElement.dataset.quickKeys = "true";
  document.addEventListener("keydown", event=>{
    const modal = document.getElementById("quick-capture");
    const modalOpen = modal && !modal.classList.contains("hidden");
    if(event.key === "Escape" && modalOpen){ event.preventDefault(); closeQuickCapture(); return; }
    if(event.key === "Tab" && modalOpen){
      const focusable = [...modal.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])")].filter(el=>!el.closest(".hidden"));
      if(!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length-1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
      return;
    }
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if(!typing && ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")){
      event.preventDefault();
      openQuickCapture();
    }
  });
}

/*******************************
 * INICIALIZACIÓN DE UI
 *******************************/
function initUI(){
  // Tabs: ocultar SOLO las secciones de pestaña (no todas las .card internas)
  document.querySelectorAll("nav button[data-tab]").forEach(btn => {
    const panel = document.getElementById(btn.dataset.tab);
    if(panel){
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-hidden", String(panel.classList.contains("hidden")));
      if(!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
    }
    btn.onclick = () => {
      document.querySelectorAll("nav button[data-tab]").forEach(b=>{
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      localStorage.setItem("panera.activeTab", btn.dataset.tab);
      document.querySelectorAll("section.tab").forEach(s=>{
        s.classList.add("hidden");
        s.setAttribute("aria-hidden", "true");
      });
      const activePanel = document.getElementById(btn.dataset.tab);
      activePanel.classList.remove("hidden");
      activePanel.setAttribute("aria-hidden", "false");
      if(btn.dataset.tab==="tab-dashboard") renderDashboard();
      if(btn.dataset.tab==="tab-finanzas") renderFinanzas();
      if(btn.dataset.tab==="tab-documentos") listDocuments();
      if(btn.dataset.tab==="tab-inventario") loadPaneraInventory();
      if(btn.dataset.tab==="tab-b2b") renderB2B();
      if(btn.dataset.tab==="tab-calendario"){ renderCalendario(); renderEventos(); }
      if(btn.dataset.tab==="tab-cotizador"){ renderMateriales(); renderRecetasList(); renderSelectMateriales(); renderIndirectos(); syncAbcForm(); recalcReceta(); initEnvioUI(); }
    };
  });

  // Selects base (desde config)
  fillSelect("pago-metodo", getMetodosVentas());
  fillSelect("v-metodo-pago-top", getMetodosVentas());
  fillSelect("g-metodo", getMetodosGastos());
  fillSelect("nom-metodo", getMetodosGastos());
  fillSelect("g-cat", GASTO_CATS);
  fillSelect("gr-metodo", getMetodosGastos());
  fillSelect("gr-cat", GASTO_CATS);

  // Filtros de ventas recientes
  fillSelectFiltro("f-canal", CANALES);
  fillSelectFiltro("f-envio", ["A domicilio","Recogen en Better","Recogen en Lomas","Recogen en Atzala"]);
  fillSelectFiltro("f-estatus", ["Pagado","Por Cobrar"]);
  fillSelectFiltro("f-mp", getMetodosVentas());
  fillSelectFiltro("f-entrega", ESTATUS_ENTREGA);

  // Filtros de gastos
  fillSelectFiltro("fg-cat", GASTO_CATS);
  fillSelectFiltro("fg-metodo", getMetodosGastos());

  // Productos
  renderCategorias();
  renderProductos();
  renderVariantes();
  syncPrecio();

  // Datalists
  renderClientesDatalist();
  renderProveedoresDatalist();

  // Listas
  renderVentasRecientes();
  renderClientes();
  renderTablaProductos();
  renderGastos(); renderGastosRecurrentes();
  renderDashboard();
  renderAbcScheduleConfig();
  renderB2B();
  renderMateriales(); renderRecetasList(); renderSelectMateriales(); syncMaterialContenidoUnidad(); syncAbcForm();
  initFinanzasUI(); renderFinanzas();
  renderCalendario();
  renderEventos();
  initEnvioUI();

  // Índice de productos para búsqueda rápida
  rebuildProductIndex();
  initQuickCapture();
  wireFormLabels();
  initKeyboardCapture();
  setSyncStatus("saved");

  // Defaults
  document.getElementById("g-fecha").value = hoyISO();
  const grInicio = document.getElementById("gr-inicio"); if(grInicio) grInicio.value = hoyISO();
  const grHasta = document.getElementById("gr-hasta"); if(grHasta) grHasta.value = hoyISO();
  // Footer brand
  const fb = document.getElementById('footer-brand'); if(fb) fb.textContent = DB.config.nombreNegocio || 'Panera Signature';
  // Config UI values
  const cfgNombre = document.getElementById('cfg-nombre'); if(cfgNombre) cfgNombre.value = DB.config.nombreNegocio || '';
  const cfgPref = document.getElementById('cfg-prefijo'); if(cfgPref) cfgPref.value = DB.config.prefijo || 'PAN';
  const cfgAuto = document.getElementById('cfg-autoprint'); if(cfgAuto) cfgAuto.value = DB.config.autoPrintTicket? 'si' : 'no';
  const cfgMPv = document.getElementById('cfg-mp-ventas'); if(cfgMPv) cfgMPv.value = (DB.config.metodosVentas||[]).join(',');
  const cfgMPg = document.getElementById('cfg-mp-gastos'); if(cfgMPg) cfgMPg.value = (DB.config.metodosGastos||[]).join(',');
  renderAbcScheduleConfig();

  // Fecha de venta por defecto
  const fv = document.getElementById("v-fecha-venta");
  if(fv && !fv.value){
    const now = new Date(); const pad = n => String(n).padStart(2,"0");
    fv.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  // Espejos / sincronizaciones
  espejoEnvioEnEntrega();
  document.getElementById("envio-metodo")?.addEventListener("change", espejoEnvioEnEntrega);
  document.getElementById("v-estatus-pago-top")?.addEventListener("change", (e)=>syncEstatusSelects(e.target));
  document.getElementById("v-estatus-pago")?.addEventListener("change", (e)=>syncEstatusSelects(e.target));
  document.getElementById("v-metodo-pago-top")?.addEventListener("change", (e)=>{
    const val = e.target.value; const pm = document.getElementById("pago-metodo"); if(pm){ pm.value = val; }
  });
  document.getElementById("v-estatus-entrega-top")?.addEventListener("change", (e)=>{
    const v = e.target.value || "Por preparar";
    const tag = document.getElementById("estatus-entrega");
    if(tag) tag.textContent = v;
  });
  const b2bForm = document.querySelector("[data-b2b-order-form]");
  if(b2bForm) b2bForm.onsubmit = submitB2BOrder;
  document.querySelector("[data-b2b-products-field]")?.addEventListener("input", (e)=>{
    e.target.dataset.userEdited = "true";
  });

  // Enter para agregar ítem
  document.getElementById("p-cant")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); addItem(); }});

  // Restaurar pestaña activa
  const requestedTab = new URLSearchParams(window.location.search).get("tab") || (window.location.hash ? window.location.hash.slice(1) : "");
  const savedTab = requestedTab || localStorage.getItem("panera.activeTab");
  if(savedTab){
    const btn = document.querySelector(`nav button[data-tab="${savedTab}"]`);
    if(btn){ btn.click(); }
    if(btn){ btn.scrollIntoView({ block:"nearest", inline:"center" }); }
  }

  // Autocomplete cliente (nombre / últimos 4 del tel / dirección)
  const cliInp = document.getElementById('v-cliente');
  cliInp?.addEventListener('input', renderSugerenciasCliente);
  cliInp?.addEventListener('focus', renderSugerenciasCliente);
  cliInp?.addEventListener('blur', ()=> setTimeout(()=> document.getElementById('v-cliente-suggest')?.classList.add('hidden'), 150));

  // Búsqueda rápida de producto
  const pr = document.getElementById('p-buscar-rapido');
  pr?.addEventListener('input', renderSugerenciasProducto);
  pr?.addEventListener('focus', renderSugerenciasProducto);
  pr?.addEventListener('blur', ()=> setTimeout(()=> document.getElementById('p-suggest')?.classList.add('hidden'), 150));
  pr?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addItemDesdeBusqueda(); }});

  // Calendario: set año por defecto
  const yInp = document.getElementById('ev-year');
  if(yInp){
    yInp.value = new Date().getFullYear();
    yInp.addEventListener('change', ()=>{ const yr = Number(yInp.value)||new Date().getFullYear(); CAL_NOW = new Date(yr, CAL_NOW.getMonth(), 1); renderCalendario(); });
  }
}

function refreshDataViews(){
  fillSelect("pago-metodo", getMetodosVentas());
  fillSelect("v-metodo-pago-top", getMetodosVentas());
  fillSelect("g-metodo", getMetodosGastos());
  fillSelect("nom-metodo", getMetodosGastos());
  fillSelect("gr-metodo", getMetodosGastos());
  fillSelectFiltro("f-mp", getMetodosVentas());
  fillSelectFiltro("fg-metodo", getMetodosGastos());
  renderCategorias(); renderProductos(); renderVariantes(); syncPrecio();
  renderClientesDatalist(); renderProveedoresDatalist();
  renderVentasRecientes(); renderClientes(); renderTablaProductos();
  renderGastos(); renderGastosRecurrentes(); renderDashboard();
  renderAbcScheduleConfig(); renderB2B();
  renderMateriales(); renderRecetasList(); renderSelectMateriales(); syncMaterialContenidoUnidad(); syncAbcForm();
  initFinanzasUI(); renderFinanzas(); renderCalendario(); renderEventos(); initEnvioUI();
  rebuildProductIndex();
  initQuickCapture();
  const fb = document.getElementById('footer-brand'); if(fb) fb.textContent = DB.config.nombreNegocio || 'Panera Signature';
  const cfgNombre = document.getElementById('cfg-nombre'); if(cfgNombre) cfgNombre.value = DB.config.nombreNegocio || '';
  const cfgPref = document.getElementById('cfg-prefijo'); if(cfgPref) cfgPref.value = DB.config.prefijo || 'PAN';
  const cfgAuto = document.getElementById('cfg-autoprint'); if(cfgAuto) cfgAuto.value = DB.config.autoPrintTicket ? 'si' : 'no';
  const cfgMPv = document.getElementById('cfg-mp-ventas'); if(cfgMPv) cfgMPv.value = (DB.config.metodosVentas||[]).join(',');
  const cfgMPg = document.getElementById('cfg-mp-gastos'); if(cfgMPg) cfgMPg.value = (DB.config.metodosGastos||[]).join(',');
  if(document.querySelector('[data-tab="tab-documentos"]')?.classList.contains('active')) listDocuments();
  if(document.querySelector('[data-tab="tab-inventario"]')?.classList.contains('active')) loadPaneraInventory();
}

async function loadPaneraInventory(force=false){
  if(PANERA_INVENTORY.status==="loading" || (!force && PANERA_INVENTORY.status==="ready")){ renderPaneraInventory(); return; }
  PANERA_INVENTORY={...PANERA_INVENTORY,status:"loading",error:""}; renderPaneraInventory();
  try{
    const res=await fetchWithTimeout(INVENTORY_ENDPOINT,{credentials:"same-origin",headers:{Accept:"application/json"},cache:"no-store"});
    if(res.status===401){ handleSessionExpired(); return; }
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.ok) throw new Error(data?.error||`HTTP ${res.status}`);
    PANERA_INVENTORY={status:data.status||"ready",snapshots:Array.isArray(data.snapshots)?data.snapshots:[],error:""};
  }catch(error){ PANERA_INVENTORY={...PANERA_INVENTORY,status:"error",error:"No fue posible cargar el inventario sincronizado."}; }
  renderPaneraInventory();
}

function inventoryFilters(){
  return {branch:document.getElementById("inv-branch")?.value||"all",search:(document.getElementById("inv-search")?.value||"").trim().toLowerCase(),from:document.getElementById("inv-from")?.value||"",to:document.getElementById("inv-to")?.value||"",type:document.getElementById("inv-type")?.value||"all"};
}
function inInventoryRange(row,f){ const d=String(row.date||row.occurredAt||"").slice(0,10); return (!f.from||d>=f.from)&&(!f.to||d<=f.to); }
function formatQty(value){ return Number(value||0).toLocaleString("es-MX",{maximumFractionDigits:3}); }
function inventoryStatus(stock,min,active){ if(!active)return"Inactivo"; if(stock<0)return"Revisar"; if(stock===0)return"Agotado"; if(stock<=min)return"Pedir"; return"OK"; }
function renderPaneraInventory(){
  const state=document.getElementById("inventory-state"); if(!state)return;
  if(PANERA_INVENTORY.status==="loading"){state.className="inventory-state loading";state.textContent="Cargando inventario confirmado…";return;}
  if(PANERA_INVENTORY.status==="error"){state.className="inventory-state error";state.textContent=PANERA_INVENTORY.error;return;}
  if(!PANERA_INVENTORY.snapshots.length){state.className="inventory-state empty";state.textContent="Todavía no hay una sincronización de Better Mood.";return;}
  const f=inventoryFilters();
  if(f.from&&f.to&&f.from>f.to){
    state.className="inventory-state error";state.textContent="La fecha Desde no puede ser posterior a Hasta.";
    document.getElementById("inventory-kpis").innerHTML="";
    document.getElementById("inventory-stock-list").innerHTML='<p class="empty-copy">Corrige el intervalo para consultar el inventario.</p>';
    document.getElementById("inventory-movements").innerHTML="";document.getElementById("inventory-purchases").innerHTML="";document.getElementById("inventory-reconciliation").innerHTML="";return;
  }
  const snapshots=PANERA_INVENTORY.snapshots.filter(s=>f.branch==="all"||s.branchId===f.branch);
  const rows=[]; const movements=[]; const purchases=[]; const counts=[];
  snapshots.forEach(snapshot=>{
    const products=new Map((snapshot.products||[]).map(p=>[p.itemId,p]));
    (snapshot.stocks||[]).forEach(stock=>{const product=products.get(stock.itemId)||{};if(!f.search||String(product.name||"").toLowerCase().includes(f.search))rows.push({...stock,...product,branchId:snapshot.branchId});});
    (snapshot.movements||[]).forEach(row=>{if((f.type==="all"||row.type===f.type)&&inInventoryRange(row,f)&&(!f.search||String(row.productName||"").toLowerCase().includes(f.search)))movements.push({...row,branchId:snapshot.branchId});});
    (snapshot.purchases||[]).forEach(row=>{if(inInventoryRange(row,f)&&(!f.search||String(row.productName||"").toLowerCase().includes(f.search)))purchases.push({...row,branchId:snapshot.branchId});});
    (snapshot.counts||[]).forEach(row=>{if(inInventoryRange(row,f)&&(!f.search||String(row.productName||"").toLowerCase().includes(f.search)))counts.push({...row,branchId:snapshot.branchId});});
  });
  movements.sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
  purchases.sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
  counts.sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
  const updated=snapshots.map(s=>s.sourceUpdatedAt).sort().at(-1);
  state.className=`inventory-state ${PANERA_INVENTORY.status}`;state.textContent=`Sincronizado con Better Mood · ${updated?fmtLocal(updated):"sin fecha"}${PANERA_INVENTORY.status==="partial"?" · falta una sucursal":""}`;
  document.getElementById("inventory-kpis").innerHTML=[
    ["Productos",rows.length],["Unidades visibles",formatQty(rows.reduce((n,r)=>n+Number(r.stock||0),0))],["Por revisar",rows.filter(r=>Number(r.stock)<0).length],["Movimientos",movements.length]
  ].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  document.getElementById("inventory-stock-list").innerHTML=rows.length?rows.sort((a,b)=>a.name.localeCompare(b.name,"es")).map(row=>{
    const status=inventoryStatus(Number(row.stock),Number(row.minimum),row.active);return `<button class="inventory-stock-row" type="button" onclick="focusInventoryProduct('${dataAttr(row.itemId)}')"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.branchId.toUpperCase())} · ${escapeHtml(row.unit||"pieza")}</small></span><b>${formatQty(row.stock)}</b><em class="inv-status ${status.toLowerCase()}">${status}</em></button>`;
  }).join(""):`<p class="empty-copy">Sin productos para estos filtros.</p>`;
  const ledger=(list,kind)=>list.slice(0,250).map(row=>`<article class="ledger-row"><div><strong>${escapeHtml(row.productName)}</strong><small>${escapeHtml(row.branchId.toUpperCase())} · ${escapeHtml(row.date)}${row.sourceRef?` · ${escapeHtml(row.sourceRef)}`:""}</small></div><b class="${Number(row.quantity)>=0?"positive":"negative"}">${kind==="purchase"?"+":""}${formatQty(row.quantity)}</b></article>`).join("")||`<p class="empty-copy">Sin registros para estos filtros.</p>`;
  document.getElementById("inventory-movements").innerHTML=ledger(movements,"movement");
  document.getElementById("inventory-purchases").innerHTML=ledger(purchases,"purchase");
  const negatives=rows.filter(r=>Number(r.stock)<0);
  document.getElementById("inventory-reconciliation").innerHTML=`<div class="reconciliation-summary"><strong>${negatives.length?`${negatives.length} existencia(s) negativa(s) requieren revisión`:"Sin diferencias negativas en la vista"}</strong><span>${counts.length} conteos físicos históricos visibles. No se realizan ajustes desde Panera.</span></div>${negatives.map(r=>`<div class="reconciliation-row"><span>${escapeHtml(r.name)} · ${escapeHtml(r.branchId.toUpperCase())}</span><b>${formatQty(r.stock)}</b></div>`).join("")}`;
}
function focusInventoryProduct(encoded){ const id=decodeURIComponent(encoded); const input=document.getElementById("inv-search"); const row=PANERA_INVENTORY.snapshots.flatMap(s=>s.products||[]).find(p=>p.itemId===id); if(input&&row){input.value=row.name;renderPaneraInventory();input.scrollIntoView({behavior:"smooth",block:"center"});} }

function fillSelect(id_, arr){
  const s = document.getElementById(id_);
  if(!s) return;
  const needsPH = s.hasAttribute('required');
  const ph = s.dataset.placeholder || '— Selecciona —';
  s.replaceChildren();
  if(needsPH){
    const placeholder = new Option(ph, "");
    placeholder.disabled = true;
    placeholder.selected = true;
    s.add(placeholder);
  }
  (arr||[]).forEach(value=>s.add(new Option(String(value), String(value))));
}

// Espejo visual del método de envío
function espejoEnvioEnEntrega(){
  const sel = document.getElementById("envio-metodo");
  const inputDisabled = document.querySelector('#tab-ventas input[disabled]');
  if(sel && inputDisabled){ inputDisabled.value = sel.value || "(selecciona arriba)"; }
}

/*******************************
 * PRODUCTOS
 *******************************/
function categoriasUnicas(){ return [...new Set(DB.productos.map(p=>p.categoria))]; }
function renderCategorias(){
  const cats = categoriasUnicas();
  fillSelect("p-cat", cats);
  fillSelect("fpcat", ["(todas)", ...cats]);
}
function renderProductos(){
  const cat = document.getElementById("p-cat").value;
  let prods = [];
  if(cat){
    prods = DB.productos.filter(p=>p.categoria===cat && p.activo!==false).map(p=>p.producto);
  }
  fillSelect("p-prod", prods);
  renderVariantes();
}
function renderVariantes(){
  const prodName = document.getElementById("p-prod").value;
  const prod = DB.productos.find(p=>p.producto===prodName);
  const vars = prod ? Object.keys(prod.variantes) : [];
  fillSelect("p-var", vars);
  syncPrecio();
}
function syncPrecio(){
  const prod = DB.productos.find(p=>p.producto===document.getElementById("p-prod").value);
  const talla = document.getElementById("p-var").value;
  const precio = prod?.variantes?.[talla] ?? 0;
  document.getElementById("p-precio").value = precio;
}

function renderTablaProductos(){
  const cat = document.getElementById("fpcat").value;
  const q = (document.getElementById("fpq").value||"").toLowerCase();
  const act = document.getElementById("fpact").value;
  const tb = document.querySelector("#tabla-productos tbody");
  let rows = [];
  DB.productos.forEach(p=>{
    if(cat!=="(todas)" && p.categoria!==cat) return;
    if(act==="activos" && p.activo===false) return;
    if(act==="inactivos" && p.activo!==false) return;
    Object.entries(p.variantes||{}).forEach(([nombre, precio])=>{
      const text = `${p.producto} ${nombre}`.toLowerCase();
      if(q && !text.includes(q)) return;
      rows.push(`<tr>
        <td>${escapeHtml(p.producto)}</td>
        <td>${escapeHtml(nombre)}</td>
        <td class="right">${fmt(precio)}</td>
        <td>
          <label><input type="checkbox" data-product="${dataAttr(p.producto)}" ${p.activo!==false?"checked":""} onchange="toggleProductoActivo(decodeURIComponent(this.dataset.product), this.checked)"> Activo</label>
        </td>
      </tr>`);
    });
  });
  tb.innerHTML = rows.join("") || `<tr><td colspan="4" class="muted">Sin resultados</td></tr>`;
}
function toggleProductoActivo(prodName, checked){
  const p = DB.productos.find(x=>x.producto===prodName);
  if(p){ p.activo = !!checked; saveDB(); rebuildProductIndex(); }
}

/*******************************
 * CLIENTES
 *******************************/
function upsertClientePorNombre(nombre){
  const nm = (nombre||"").trim();
  if(!nm) return { id:"MOSTRADOR", nombre:"Mostrador" };
  let c = DB.clientes.find(x=>x.nombre.toLowerCase()===nm.toLowerCase());
  if(!c){ c = { id:id(), nombre:nm, telefono:"", direccion:"", notas:"", creadoEn:new Date().toISOString()}; DB.clientes.push(c); saveDB(); renderClientesDatalist(); }
  return c;
}
function agregarClienteRapido(){
  const nm = (document.getElementById("v-cliente").value||"").trim();
  if(!nm){ alert("Escribe el nombre del cliente."); return; }
  upsertClientePorNombre(nm);
  toast("Cliente guardado");
  renderClientes();
}
function renderClientesDatalist(){
  const dl = document.getElementById("dl-clientes");
  if(!dl) return;
  dl.replaceChildren();
  DB.clientes.forEach(customer=>{
    const option = document.createElement("option");
    option.value = String(customer.nombre || "");
    dl.appendChild(option);
  });
}

/* =====================
   AUTOCOMPLETE CLIENTE
   ===================== */
function buscarCoincidenciasCliente(q){
  const term = (q||"").trim().toLowerCase();
  if(!term) return [];
  return DB.clientes.filter(c=>{
    const nom=(c.nombre||"").toLowerCase();
    const tel=String(c.telefono||"");
    const dir=(c.direccion||"").toLowerCase();
    const last4 = tel.slice(-4);
    return nom.includes(term) || dir.includes(term) || tel.includes(term) || (term.length>=3 && last4===term);
  }).slice(0,20);
}
function renderSugerenciasCliente(){
  const el = document.getElementById('v-cliente');
  const box = document.getElementById('v-cliente-suggest');
  if(!el||!box) return;
  const q = el.value;
  const arr = buscarCoincidenciasCliente(q);
  if(arr.length===0){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.innerHTML = arr.map(c=>`
    <div class="ac-item" data-id="${dataAttr(c.id)}" onclick="selectClienteDesdeAC(decodeURIComponent(this.dataset.id))">
      <div class="ac-name">${escapeHtml(c.nombre)}</div>
      <div class="ac-meta">${escapeHtml(c.telefono||'')}<br>${escapeHtml((c.direccion||'').slice(0,48))}</div>
    </div>`).join('');
  box.classList.remove('hidden');
}
function selectClienteDesdeAC(cid){
  const c = DB.clientes.find(x=>x.id===cid);
  const inp = document.getElementById('v-cliente');
  if(!c||!inp) return;
  inp.value = c.nombre;
  inp.dataset.cid = c.id;
  const dir = document.getElementById('entrega-dir');
  if(dir && c.direccion){ dir.value = c.direccion; }
  document.getElementById('v-cliente-suggest')?.classList.add('hidden');
}

function renderClientes(){
  const buscar = (document.getElementById("c-buscar")?.value||"").toLowerCase();
  const orden = document.getElementById("c-orden")?.value||"nombre";
  const stats = {};
  DB.ventas.forEach(v=>{
    const key = v.clienteNombre||"Mostrador";
    if(!stats[key]) stats[key] = { total:0, ultima:"", count:0 };
    stats[key].total += v.total;
    stats[key].count += 1;
    if(!stats[key].ultima || v.fecha > stats[key].ultima) stats[key].ultima = v.fecha;
  });
  const rows = DB.clientes
    .filter(c=>{
      if(!buscar) return true;
      const nom=(c.nombre||"").toLowerCase();
      const tel=String(c.telefono||"").toLowerCase();
      const dir=(c.direccion||"").toLowerCase();
      return nom.includes(buscar)||tel.includes(buscar)||dir.includes(buscar);
    })
    .map(c=>({ c, s: stats[c.nombre]||{total:0, ultima:"", count:0} }))
    .sort((a,b)=>{
      if(orden==="nombre") return a.c.nombre.localeCompare(b.c.nombre);
      if(orden==="total") return b.s.total - a.s.total;
      if(orden==="ultima") return (b.s.ultima||"").localeCompare(a.s.ultima||"");
      return 0;
    })
    .map(({c,s})=>`<tr>
      <td>${escapeHtml(c.nombre)}</td>
      <td>${escapeHtml(c.telefono||"")}</td>
      <td>${escapeHtml(c.direccion||"")}</td>
      <td class="right">${fmt(s.total)}</td>
      <td>${escapeHtml(s.ultima? s.ultima.slice(0,10):"")}</td>
      <td>
        <button class="btn alt" data-id="${dataAttr(c.id)}" onclick="editarCliente(decodeURIComponent(this.dataset.id))">Editar</button>
        <button class="btn ghost" data-id="${dataAttr(c.id)}" onclick="eliminarCliente(decodeURIComponent(this.dataset.id))">Eliminar</button>
      </td>
    </tr>`);
  document.querySelector("#tabla-clientes tbody").innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">Sin clientes</td></tr>`;
}
function guardarCliente(){
  const nombre = document.getElementById("c-nombre").value.trim();
  if(!nombre){ alert("Nombre requerido"); return; }
  const tel = document.getElementById("c-tel").value.trim();
  const dir = document.getElementById("c-dir").value.trim();
  const notas = document.getElementById("c-notas").value.trim();

  let c = DB.clientes.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(!c && (tel || dir)){
    c = DB.clientes.find(x=> (x.telefono||"")===tel && (x.direccion||"")===dir);
  }
  if(!c){ c = { id:id(), creadoEn:new Date().toISOString() }; DB.clientes.push(c); }
  c.nombre = nombre; c.telefono = tel; c.direccion = dir; c.notas = notas;
  saveDB(); renderClientesDatalist(); renderClientes();
  toast("Cliente guardado");
  limpiarCliente();
}
function limpiarCliente(){ ["c-nombre","c-tel","c-dir","c-notas"].forEach(id=>document.getElementById(id).value=""); }
function exportarCSVClientes(){
  const headers = ["Nombre","Telefono","Direccion","Notas"]; 
  const rows = DB.clientes.map(c=>[c.nombre,c.telefono||"",c.direccion||"",c.notas||""]);
  descargarCSV([headers,...rows], `clientes_${hoyISO()}.csv`);
}
function editarCliente(cid){
  const c = DB.clientes.find(x=>x.id===cid);
  if(!c) return;
  document.querySelector('[data-tab="tab-clientes"]').click();
  document.getElementById("c-nombre").value = c.nombre || "";
  document.getElementById("c-tel").value = c.telefono || "";
  document.getElementById("c-dir").value = c.direccion || "";
  document.getElementById("c-notas").value = c.notas || "";
}
function eliminarCliente(cid){
  const c = DB.clientes.find(x=>x.id===cid);
  if(!c) return;
  if(!confirm(`¿Eliminar al cliente "${c.nombre}"?`)) return;
  DB.clientes = DB.clientes.filter(x=>x.id!==cid);
  saveDB(); renderClientesDatalist(); renderClientes();
  toast("Cliente eliminado");
}

/*******************************
 * VENTAS
 *******************************/
const VENTA = { items:[], pagos:[] };
let editingGastoId = null;
let editingRecurrenteId = null;
let editingVentaId = null;

function addItem(){
  const prod = document.getElementById("p-prod").value;
  const talla = document.getElementById("p-var").value;
  const precio = Number(document.getElementById("p-precio").value||0);
  const cant = Number(document.getElementById("p-cant").value||1);
  if(!prod || !talla || precio<=0 || cant<=0){ alert("Completa producto, talla, precio y cantidad."); return; }
  VENTA.items.push({ id:id(), prod, talla, precio, cant });
  renderItems(); recalc();
}
function removeItem(i){ VENTA.items.splice(i,1); renderItems(); recalc(); }
function renderItems(){
  const tb = document.querySelector("#tabla-items tbody");
  tb.innerHTML = VENTA.items.map((it,idx)=>`
    <tr>
      <td>${escapeHtml(it.prod)}</td>
      <td>${escapeHtml(it.talla)}</td>
      <td class="right">${fmt(it.precio)}</td>
      <td class="right">${escapeHtml(it.cant)}</td>
      <td class="right">${fmt(it.precio*it.cant)}</td>
      <td class="right"><button class="btn ghost" onclick="removeItem(${idx})">Quitar</button></td>
    </tr>`).join("");
}

function recalc(){
  const sub = sum(VENTA.items, it=>it.precio*it.cant);
  const desc = Number(document.getElementById("t-descuento").value||0);
  const total = Math.max(0, sub - desc);

  document.getElementById("t-subtotal").textContent = fmt(sub);
  document.getElementById("t-total").textContent = fmt(total);

  const pagado = sum(VENTA.pagos, p=>p.monto);
  const saldo = Math.max(0, total - pagado);
  document.getElementById("pagado").textContent = fmt(pagado);
  document.getElementById("saldo").textContent = fmt(saldo);

  // Mostrar estatus calculado para claridad visual
  const estadoCalc = (total > 0 && saldo <= 0) ? 'Pagado' : 'Por Cobrar';
  document.getElementById("estatus-pago").textContent = estadoCalc;
}

function addPago(){
  const metodo = document.getElementById("pago-metodo").value;
  const monto = Number(document.getElementById("pago-monto").value||0);
  if(monto<=0){ alert("Monto inválido"); return; }
  VENTA.pagos.push({ fecha:new Date().toISOString(), metodo, monto });
  renderPagos(); recalc();
  document.getElementById("pago-monto").value="";
}
function removePago(i){ VENTA.pagos.splice(i,1); renderPagos(); recalc(); }
function renderPagos(){
  const tb = document.querySelector("#tabla-pagos tbody");
  tb.innerHTML = VENTA.pagos.map((p,idx)=>`
    <tr>
      <td>${escapeHtml(String(p.fecha || "").slice(0,16).replace("T"," "))}</td>
      <td>${escapeHtml(p.metodo)}</td>
      <td class="right">${fmt(p.monto)}</td>
      <td class="right"><button class="btn ghost" onclick="removePago(${idx})">Quitar</button></td>
    </tr>`).join("");
}

function editarVenta(ventaId){
  const v = DB.ventas.find(x=>x.id===ventaId);
  if(!v) return;
  editingVentaId = v.id;
  document.querySelector('[data-tab="tab-ventas"]').click();

  document.getElementById("v-cliente").value = v.clienteNombre || "";
  document.getElementById("v-canal").value = v.canal || "";
  

  VENTA.items = JSON.parse(JSON.stringify(v.items||[]));
  VENTA.pagos = JSON.parse(JSON.stringify(v.pagos||[]));
  renderItems(); renderPagos();

  document.getElementById("t-descuento").value = Number(v.descuento||0);
  const metodo = v.envioMetodo || v?.entrega?.metodo || (v?.entrega?.tipo||"");
  if(document.getElementById("envio-metodo") && metodo){ document.getElementById("envio-metodo").value = metodo; }
  if(document.getElementById("entrega-fecha")) document.getElementById("entrega-fecha").value = v?.entrega?.fecha || "";
  if(document.getElementById("entrega-dir")) document.getElementById("entrega-dir").value = v?.entrega?.dir || "";
  espejoEnvioEnEntrega();

  const est = (v.estatusPago||"Por Cobrar").toLowerCase()==="pagado" ? "pagado" : "por_cobrar";
  const topSel = document.getElementById("v-estatus-pago-top");
  const botSel = document.getElementById("v-estatus-pago");
  if(topSel) topSel.value = est;
  if(botSel) botSel.value = est;
  document.getElementById("estatus-pago").textContent = (est==="pagado"?"Pagado":"Por Cobrar");

  const estEnt = v.estatusEntrega || "Por preparar";
  const selEntTop = document.getElementById("v-estatus-entrega-top");
  if(selEntTop) selEntTop.value = estEnt;
  const tagEnt = document.getElementById("estatus-entrega");
  if(tagEnt) tagEnt.textContent = estEnt;

  const fv = document.getElementById("v-fecha-venta");
  if(fv){
    const d = v.fecha ? new Date(v.fecha) : new Date(); const pad = n => String(n).padStart(2,"0");
    fv.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const mpTop = document.getElementById("v-metodo-pago-top");
  if(mpTop){
    const arr = getMetodosVentas();
    mpTop.value = (v.pagos && v.pagos[0] ? v.pagos[0].metodo : (arr[0]||''));
  }

  recalc();
}

function guardarVenta(){
  if(VENTA.items.length===0){ alert("Agrega al menos un producto"); return; }
  const clienteNombre = (document.getElementById("v-cliente").value||"Mostrador").trim();
  const cliente = upsertClientePorNombre(clienteNombre);

  const fechaVentaInput = document.getElementById("v-fecha-venta")?.value || "";
  const fechaISO = fechaVentaInput ? fechaVentaInput : nowLocalDateTime();
  const folio = nextFolio();

  const canal = document.getElementById("v-canal").value;
  const notas = document.getElementById("v-notas").value;
  const envioMetodo = document.getElementById("envio-metodo").value;
  if(!envioMetodo){ alert("Selecciona el método de envío."); document.getElementById("envio-metodo").focus(); return; }
  if(!canal){ alert("Selecciona el Canal."); document.getElementById("v-canal").focus(); return; }
  const metodoTopSel = document.getElementById("v-metodo-pago-top");
  if(!metodoTopSel.value){ alert("Selecciona el Método de pago."); metodoTopSel.focus(); return; }

  const selEstatus = getSelectEstatus();
  if(!selEstatus || !selEstatus.value){ alert("Selecciona el Status de pago."); selEstatus && selEstatus.focus(); return; }

  const entrega = { metodo: envioMetodo, fecha:document.getElementById("entrega-fecha").value, dir:document.getElementById("entrega-dir").value };

  const sub = sum(VENTA.items, it=>it.precio*it.cant);
  const desc = Number(document.getElementById("t-descuento").value||0);
  const total = Math.max(0, sub - desc);

  const metodoPagoTop = document.getElementById("v-metodo-pago-top")?.value || document.getElementById("pago-metodo")?.value || (getMetodosVentas()[0]||"Efectivo");

  const estatusSel = selEstatus.value;
  let pagadoPrevio = sum(VENTA.pagos, p=>p.monto);
  if(estatusSel === "pagado" && pagadoPrevio < total){
    VENTA.pagos.push({ fecha: fechaISO, metodo: metodoPagoTop, monto: Math.max(0, total - pagadoPrevio) });
  }
  const pagado = sum(VENTA.pagos, p=>p.monto);
  const saldo = Math.max(0, total - pagado);

  const estatusEntregaSel = (document.getElementById("v-estatus-entrega-top")?.value || "Por preparar");

  if(editingVentaId){
    const idx = DB.ventas.findIndex(x=>x.id===editingVentaId);
    if(idx>-1){
      const original = DB.ventas[idx];
      DB.ventas[idx] = {
        ...original,
        fecha: fechaISO,
        clienteId: cliente.id, clienteNombre: cliente.nombre,
        canal,
        subtotal: sub, descuento: desc, total, saldo,
        estatusPago: estatusSel==="pagado"?"Pagado":(saldo<=0?"Pagado":"Por Cobrar"),
        estatusEntrega: estatusEntregaSel,
        notas,
        entrega,
        envioMetodo,
        items: JSON.parse(JSON.stringify(VENTA.items)),
        pagos: JSON.parse(JSON.stringify(VENTA.pagos))
      };
      saveDB(); toast("Venta actualizada: "+original.folio);
    }
    editingVentaId = null;
  }else{
    const venta = {
      id:id(), folio, fecha: fechaISO,
      clienteId: cliente.id, clienteNombre: cliente.nombre,
      canal, subtotal: sub, descuento: desc, total, saldo,
      estatusPago: estatusSel==="pagado"?"Pagado":(saldo<=0?"Pagado":"Por Cobrar"),
      estatusEntrega: estatusEntregaSel,
      notas,
      entrega, envioMetodo,
      items: JSON.parse(JSON.stringify(VENTA.items)), pagos: JSON.parse(JSON.stringify(VENTA.pagos))
    };
    DB.ventas.unshift(venta); saveDB(); toast("Venta guardada: "+folio);
    if(DB.config.autoPrintTicket){ try{ imprimirTicket(); }catch(e){} }
  }
  nuevaVenta(); renderVentasRecientes(); renderClientes(); renderDashboard(); renderFinanzas();
}

function nuevaVenta(){
  VENTA.items = []; VENTA.pagos = [];
  renderItems(); renderPagos();
  document.getElementById("t-descuento").value = 0;
  ["v-notas","entrega-dir"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("entrega-fecha").value = "";
  document.getElementById("v-cliente").value = "";
  const topSel = document.getElementById("v-estatus-pago-top");
  const botSel = document.getElementById("v-estatus-pago");
  if(topSel) topSel.value = "";
  if(botSel) botSel.value = "";
  document.getElementById("estatus-pago").textContent = "Por Cobrar";
  const fv = document.getElementById("v-fecha-venta");
  if(fv){
    const now = new Date(); const pad = n => String(n).padStart(2,"0");
    fv.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  const mpTop = document.getElementById("v-metodo-pago-top");
  if(mpTop){ mpTop.value = ""; }

  const selEntTop = document.getElementById("v-estatus-entrega-top");
  if(selEntTop) selEntTop.value = "";
  const tagEnt = document.getElementById("estatus-entrega");
  if(tagEnt) tagEnt.textContent = "Por preparar";

  recalc();
}

function duplicarVenta(ventaId){
  const v = DB.ventas.find(x=>x.id===ventaId);
  if(!v) return;
  VENTA.items = JSON.parse(JSON.stringify(v.items||[]));
  VENTA.pagos = [];
  renderItems(); renderPagos();
  document.querySelector('[data-tab="tab-ventas"]').click();
  document.getElementById('v-cliente').value = v.clienteNombre || '';
  document.getElementById('v-canal').value = v.canal || '';
  document.getElementById('envio-metodo').value = v.envioMetodo || '';
  espejoEnvioEnEntrega();
  document.getElementById('t-descuento').value = Number(v.descuento||0);
  const topSel = document.getElementById('v-estatus-pago-top'); if(topSel) topSel.value='por_cobrar';
  const botSel = document.getElementById('v-estatus-pago'); if(botSel) botSel.value='por_cobrar';
  const mpTop = document.getElementById('v-metodo-pago-top'); if(mpTop) mpTop.value='';
  recalc();
  toast('Venta duplicada, lista para guardar con nuevo folio.');
}

function whatsappShare(){
  const sub = sum(VENTA.items, it=>it.precio*it.cant);
  const desc = Number(document.getElementById("t-descuento").value||0);
  const total = Math.max(0, sub - desc);
  const lineas = VENTA.items.map(it=>`• ${it.cant}× ${it.prod} ${it.talla} = ${fmt(it.precio*it.cant)}`).join("\n");
  const brand = DB.config?.nombreNegocio || 'Panera Signature';
  const txt = `${brand}\n${lineas}\n—\nSubtotal: ${fmt(sub)}\nDescuento: ${fmt(desc)}\nTotal: ${fmt(total)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener,noreferrer");
}

function imprimirTicket(){
  const w = window.open("", "_blank", "width=380,height=600");
  const brand = (DB.config && DB.config.nombreNegocio) ? DB.config.nombreNegocio : 'Panera Signature';
  const sub = sum(VENTA.items, it=>it.precio*it.cant);
  const desc = Number(document.getElementById("t-descuento").value||0);
  const total = Math.max(0, sub - desc);
  const pagado = sum(VENTA.pagos, p=>p.monto);
  const saldo = Math.max(0,total - pagado);
  const rows = VENTA.items.map(it=>`<tr><td>${escapeHtml(it.cant)}× ${escapeHtml(it.prod)} ${escapeHtml(it.talla)}</td><td class="right">${escapeHtml(fmt(it.precio*it.cant))}</td></tr>`).join("");
  w.document.write(`
    <style>body{font-family:monospace;padding:10px} table{width:100%} td{padding:4px 0} .right{text-align:right}</style>
    <h3>${escapeHtml(brand)}</h3>
    <small>${escapeHtml(new Date().toLocaleString())}</small>
    <table>${rows}</table>
    <hr>
    <table>
      <tr><td>Subtotal</td><td class="right">${escapeHtml(fmt(sub))}</td></tr>
      <tr><td>Descuento</td><td class="right">${escapeHtml(fmt(desc))}</td></tr>
      <tr><td><b>Total</b></td><td class="right"><b>${escapeHtml(fmt(total))}</b></td></tr>
      <tr><td>Pagado</td><td class="right">${escapeHtml(fmt(pagado))}</td></tr>
      <tr><td>Saldo</td><td class="right">${escapeHtml(fmt(saldo))}</td></tr>
    </table>
    <p style="text-align:center">Gracias por su compra</p>
  `);
  w.print();
}

/*******************************
 * LISTADO Y FILTROS DE VENTAS
 *******************************/
function renderVentasRecientes(){
  const desde = document.getElementById("f-desde").value;
  const hasta = document.getElementById("f-hasta").value;
  const cliente = (document.getElementById("f-cliente").value||"").toLowerCase();
  const clienteDigits = (document.getElementById("f-cliente").value||"").replace(/\D/g, "");
  const fCanal = document.getElementById("f-canal")?.value || "";
  const fEnvio = document.getElementById("f-envio")?.value || "";
  const fEst   = document.getElementById("f-estatus")?.value || "";
  const fMP    = document.getElementById("f-mp")?.value || "";
  const fEnt   = document.getElementById("f-entrega")?.value || "";
  const fOrigen = document.getElementById("f-origen")?.value || "";
  const fSucursal = document.getElementById("f-sucursal")?.value || "";
  const fSync = document.getElementById("f-sync")?.value || "";
  const fHistorica = document.getElementById("f-historica")?.value || "";
  const tb = document.querySelector("#tabla-ventas tbody");
  const totalSales=DB.ventas.length;
  let arr = DB.ventas.slice();
  const invalidRange=Boolean(desde&&hasta&&desde>hasta);
  if(invalidRange) arr=[];
  if(desde) arr = arr.filter(v=>ymd(v.fecha)>=desde);
  if(hasta) arr = arr.filter(v=>ymd(v.fecha)<=hasta);
  if(cliente){
    const mapCli = new Map(DB.clientes.map(c=>[c.id,c]));
    arr = arr.filter(v=>{
      const nameOk = (v.clienteNombre||"").toLowerCase().includes(cliente);
      const tel = String(mapCli.get(v.clienteId||"")?.telefono||"").replace(/\D/g, "");
      const telOk = clienteDigits ? tel.includes(clienteDigits) : false;
      return nameOk || telOk;
    });
  }
  if(fCanal) arr = arr.filter(v=> (v.canal||"")===fCanal);
  if(fEnvio) arr = arr.filter(v=> (v.envioMetodo||"")===fEnvio);
  if(fEst)   arr = arr.filter(v=> (v.estatusPago||"")===fEst);
  if(fMP)    arr = arr.filter(v=> (v.pagos||[]).some(p=>p.metodo===fMP));
  if(fEnt)   arr = arr.filter(v=> (v.estatusEntrega||"")===fEnt);
  if(fOrigen === "better-mood-pos") arr = arr.filter(v=>v.sourceSystem === "better-mood-pos");
  if(fOrigen === "manual") arr = arr.filter(v=>v.sourceSystem !== "better-mood-pos");
  if(fSucursal) arr = arr.filter(v=>String(v.sourceBranchId || "").toLowerCase() === fSucursal);
  if(fSync) arr = arr.filter(v=>String(v.syncStatus || "") === fSync);
  if(fHistorica === "historical") arr = arr.filter(v=>v.sourceSystem === "better-mood-pos" && v.historical === true);
  if(fHistorica === "new") arr = arr.filter(v=>v.sourceSystem === "better-mood-pos" && v.historical !== true);
  const filterState=document.getElementById("sales-filter-state");
  if(filterState) filterState.textContent=invalidRange?"La fecha Desde no puede ser posterior a Hasta.":`Mostrando ${arr.length} de ${totalSales} ventas.`;
  const rows = arr.map(v=>{
    const mpSet = new Set((v.pagos||[]).map(p=>p.metodo));
    const mpTxt = mpSet.size===0 ? "—" : (mpSet.size>1 ? "Mixto" : [...mpSet][0]);
    return `<tr>
      <td><button class="sale-folio-button" type="button" data-id="${dataAttr(v.id)}" onclick="openSaleDetail(decodeURIComponent(this.dataset.id))" aria-label="Ver detalle de ${escapeHtml(v.folio)}">${escapeHtml(v.folio)}</button></td>
      <td>${v.sourceSystem === "better-mood-pos" ? '<span class="source-badge">POS</span>' : '<span class="muted">Panera</span>'}</td>
      <td>${v.sourceSystem === "better-mood-pos" ? `<strong>${escapeHtml(v.sourceFolioNumber || v.sourceOrderNumber || v.sourceOrderId)}</strong>${v.mixedSale ? '<br><span class="tag warn">Mixta</span>' : ''}` : "—"}</td>
      <td>${escapeHtml(v.sourceBranchId ? String(v.sourceBranchId).toUpperCase() : "—")}</td>
      <td>${escapeHtml(fmtLocal(v.fecha))}</td>
      <td>${escapeHtml(v.clienteNombre||"Mostrador")}</td>
      <td>${escapeHtml(v.canal||"—")}</td>
      <td>${escapeHtml(v.envioMetodo||"—")}</td>
      <td>${escapeHtml(v.estatusPago||"—")}</td>
      <td>${escapeHtml(mpTxt)}</td>
      <td class="right">${fmt(v.total)}</td>
      <td class="right">${fmt(v.saldo)}</td>
      <td>${escapeHtml(v.estatusEntrega||"—")}</td>
      <td>${v.sourceSystem === "better-mood-pos" ? `<span class="sync-badge ${escapeHtml(v.syncStatus || "pending")}">${escapeHtml(v.syncStatus === "synced" ? "Confirmada" : v.syncStatus || "Pendiente")}</span>` : "—"}</td>
      <td>
        ${v.sourceSystem === "better-mood-pos" ? '<span class="muted">Fuente POS</span>' : `<button class="btn alt" data-id="${dataAttr(v.id)}" onclick="editarVenta(decodeURIComponent(this.dataset.id))">Editar</button>`}
        <button class="btn primary" data-id="${dataAttr(v.id)}" onclick="duplicarVenta(decodeURIComponent(this.dataset.id))">Duplicar</button>
        ${v.sourceSystem === "better-mood-pos" ? "" : `<button class="btn ghost" data-id="${dataAttr(v.id)}" onclick="eliminarVenta(decodeURIComponent(this.dataset.id))">Eliminar</button>`}
      </td>
    </tr>`;
  });
  tb.innerHTML = rows.join("") || `<tr><td colspan="15" class="muted">Sin ventas</td></tr>`;
  renderPosReconciliation();
}

function closeSaleDetail(){ document.getElementById("sale-detail-modal")?.remove(); }
function openSaleDetail(ventaId){
  const sale=DB.ventas.find(row=>row.id===ventaId); if(!sale)return;
  closeSaleDetail();
  const items=Array.isArray(sale.items)?sale.items:[];
  const payments=Array.isArray(sale.pagos)?sale.pagos:[];
  const modal=document.createElement("div");
  modal.id="sale-detail-modal";modal.className="modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","sale-detail-title");
  modal.innerHTML=`<section class="quick-sheet sale-detail-sheet" role="document">
    <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px"><div><p class="eyebrow">Detalle de venta</p><h3 id="sale-detail-title" style="margin:2px 0">${escapeHtml(sale.folio||"Venta")}</h3><p class="muted" style="margin:0">${escapeHtml(fmtLocal(sale.fecha))} · ${escapeHtml(String(sale.sourceBranchId||"Panera").toUpperCase())}</p></div><button class="btn ghost" type="button" onclick="closeSaleDetail()" aria-label="Cerrar detalle">Cerrar</button></div>
    <div class="sale-detail-list">${items.length?items.map(item=>`<div class="sale-detail-row"><span><strong>${escapeHtml(item.prod||item.productName||"Producto")}</strong><small>${escapeHtml(item.talla||"")}</small></span><b>${escapeHtml(formatQty(item.cant||item.quantity||0))} × ${escapeHtml(fmt(item.precio||item.unitPrice||0))}</b><strong>${escapeHtml(fmt(item.total||Number(item.cant||item.quantity||0)*Number(item.precio||item.unitPrice||0)))}</strong></div>`).join(""):`<p class="empty-copy">Esta venta histórica no contiene líneas de producto.</p>`}</div>
    <div class="totals"><div><span>Subtotal</span><strong>${escapeHtml(fmt(sale.subtotal))}</strong></div><div><span>Total</span><strong>${escapeHtml(fmt(sale.total))}</strong></div></div>
    <h4>Pagos</h4><div class="sale-detail-list">${payments.length?payments.map(payment=>`<div class="sale-detail-row"><span><strong>${escapeHtml(payment.metodo||"Por definir")}</strong><small>${escapeHtml(fmtLocal(payment.fecha||sale.fecha))}</small></span><strong>${escapeHtml(fmt(payment.monto))}</strong></div>`).join(""):`<p class="empty-copy">Sin pagos registrados.</p>`}</div>
  </section>`;
  modal.addEventListener("mousedown",event=>{if(event.target===modal)closeSaleDetail();});document.body.appendChild(modal);modal.querySelector("button")?.focus();
}

function renderPosReconciliation(){
  const root = document.getElementById("pos-reconciliation");
  if(!root) return;
  const imported = DB.ventas.filter(v=>v.sourceSystem === "better-mood-pos");
  const meta = DB.meta?.posIntegration || {};
  if(imported.length === 0 && !meta.lastBackfillAt){ root.classList.add("hidden"); root.innerHTML = ""; return; }
  const total = imported.reduce((sum,v)=>sum + Number(v.total || 0), 0);
  const conflicts = imported.filter(v=>v.syncStatus === "conflict").length + Number(meta.conflicts || 0);
  root.classList.remove("hidden");
  root.innerHTML = `
    <div><span>Importadas</span><strong>${imported.length}</strong></div>
    <div><span>Total POS Panera</span><strong>${escapeHtml(fmt(total))}</strong></div>
    <div><span>Pendientes</span><strong>${Number(meta.pending || 0)}</strong></div>
    <div><span>Conflictos</span><strong>${conflicts}</strong></div>
    <div><span>Último backfill</span><strong>${meta.lastBackfillAt ? escapeHtml(fmtLocal(meta.lastBackfillAt)) : "—"}</strong></div>`;
}

function eliminarVenta(ventaId){
  const v = DB.ventas.find(x=>x.id===ventaId);
  if(!v) return;
  if(!confirm(`¿Eliminar la venta ${v.folio}? Esta acción no se puede deshacer.`)) return;
  DB.ventas = DB.ventas.filter(x=>x.id!==ventaId);
  saveDB(); renderVentasRecientes(); renderClientes(); renderDashboard(); renderFinanzas();
  toast("Venta eliminada: "+v.folio);
}

/*******************************
 * GASTOS
 *******************************/
function renderProveedoresDatalist(){
  const dl = document.getElementById("dl-proveedores");
  if(!dl) return;
  dl.replaceChildren();
  DB.proveedores.forEach(provider=>{
    const option = document.createElement("option");
    option.value = String(provider || "");
    dl.appendChild(option);
  });
}
function parseISODate(dateStr){
  const [y,m,d] = String(dateStr||"").split("-").map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m-1, d);
}
function toISODate(date){
  const pad = n => String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function addMonthsClamped(date, months){
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth()+months, 1);
  const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  target.setDate(Math.min(day, last));
  return target;
}
function addDays(date, days){
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate()+days);
  return next;
}
function nextRecurrentDate(dateStr, frecuencia){
  const date = parseISODate(dateStr);
  if(!date) return hoyISO();
  if(frecuencia === "weekly") return toISODate(addDays(date, 7));
  if(frecuencia === "biweekly") return toISODate(addDays(date, 14));
  return toISODate(addMonthsClamped(date, 1));
}
function recurrentFrequencyLabel(frecuencia){
  if(frecuencia === "weekly") return "Semanal";
  if(frecuencia === "biweekly") return "Quincenal";
  return "Mensual";
}
function recurrentPeriodKey(rec, fecha){
  return `${rec.id}:${fecha}`;
}
function seedDefaultRecurringExpenses(){
  if(DB.meta?.defaultRecurringSeeded) return false;
  DB.meta.defaultRecurringSeeded = true;
  if((DB.gastosRecurrentes || []).length) return false;
  const inicio = hoyISO();
  const defaults = [
    ['Nómina semanal', 'Nómina', 1900, 'weekly', 'Nómina semanal'],
    ['Luz', 'Servicios', 900, 'monthly', 'Recibo de luz'],
    ['Teléfono', 'Servicios', 400, 'monthly', 'Servicio telefónico'],
    ['ADT', 'Servicios', 1000, 'monthly', 'Servicio de seguridad ADT'],
    ['Mantenimiento', 'Mantenimiento', 1000, 'monthly', 'Mantenimiento del local'],
    ['Gas', 'Servicios', 600, 'monthly', 'Consumo de gas'],
    ['Renta', 'Renta', 13000, 'monthly', 'Renta del local'],
    ['Agua', 'Servicios', 300, 'monthly', 'Recibo de agua']
  ];
  DB.gastosRecurrentes = defaults.map(([nombre, categoria, monto, frecuencia, desc], index)=>({
    id:`default-${index+1}-${nombre.toLowerCase().replace(/[^a-z0-9]+/gi,'-')}`,
    nombre, categoria, metodo:'Transferencia', proveedor:'', monto, frecuencia,
    inicio, nextDate:inicio, desc, activo:true
  }));
  return true;
}
function limpiarGastoRecurrente(){
  editingRecurrenteId = null;
  ["gr-nombre","gr-prov","gr-monto","gr-desc"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
  const fi = document.getElementById("gr-inicio"); if(fi) fi.value = hoyISO();
  const fr = document.getElementById("gr-frec"); if(fr) fr.value = "monthly";
  renderGastosRecurrentes();
}
function guardarGastoRecurrente(){
  const nombre = (document.getElementById("gr-nombre")?.value || "").trim();
  const categoria = document.getElementById("gr-cat")?.value || "";
  const metodo = document.getElementById("gr-metodo")?.value || "";
  const proveedor = (document.getElementById("gr-prov")?.value || "").trim();
  const monto = Number(document.getElementById("gr-monto")?.value || 0);
  const frecuencia = document.getElementById("gr-frec")?.value || "monthly";
  const inicio = document.getElementById("gr-inicio")?.value || hoyISO();
  const desc = (document.getElementById("gr-desc")?.value || "").trim();
  if(!nombre || !categoria || !metodo || monto<=0 || !parseISODate(inicio)){
    alert("Completa nombre, categoría, método, monto y fecha válida.");
    return;
  }
  const payload = { nombre, categoria, metodo, proveedor, monto, frecuencia, inicio, nextDate: inicio, desc, activo:true };
  if(editingRecurrenteId){
    const idx = DB.gastosRecurrentes.findIndex(x=>x.id===editingRecurrenteId);
    if(idx>-1){
      const prev = DB.gastosRecurrentes[idx];
      DB.gastosRecurrentes[idx] = { ...prev, ...payload, nextDate: inicio };
    }
    editingRecurrenteId = null;
    toast("Gasto recurrente actualizado");
  }else{
    DB.gastosRecurrentes.push({ id:id_uniq(), ...payload });
    toast("Gasto recurrente guardado");
  }
  if(proveedor && !DB.proveedores.includes(proveedor)){ DB.proveedores.push(proveedor); }
  saveDB(); renderProveedoresDatalist(); renderGastosRecurrentes();
  limpiarGastoRecurrente();
}
function renderGastosRecurrentes(){
  const tb = document.querySelector("#tabla-gastos-recurrentes tbody");
  if(!tb) return;
  const arr = (DB.gastosRecurrentes||[]).slice().sort((a,b)=>(a.nextDate||a.inicio||"").localeCompare(b.nextDate||b.inicio||""));
  tb.innerHTML = arr.map(r=>`<tr>
    <td>${escapeHtml(r.nombre||"")}${r.activo===false ? ' <span class="muted">(pausado)</span>' : ''}</td>
    <td>${escapeHtml(r.categoria||"")}</td>
    <td>${escapeHtml(recurrentFrequencyLabel(r.frecuencia))}</td>
    <td>${escapeHtml(r.nextDate || r.inicio || "")}</td>
    <td class="right">${fmt(r.monto)}</td>
    <td>
      <button class="btn alt" data-id="${dataAttr(r.id)}" onclick="editarGastoRecurrente(decodeURIComponent(this.dataset.id))">Editar</button>
      <button class="btn primary" data-id="${dataAttr(r.id)}" onclick="generarGastosRecurrentes(decodeURIComponent(this.dataset.id))">Generar</button>
      <button class="btn ghost" data-id="${dataAttr(r.id)}" onclick="pausarGastoRecurrente(decodeURIComponent(this.dataset.id))">${r.activo===false ? "Activar" : "Pausar"}</button>
      <button class="btn ghost" data-id="${dataAttr(r.id)}" onclick="eliminarGastoRecurrente(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="6" class="muted">Sin gastos recurrentes</td></tr>`;
}
function editarGastoRecurrente(id){
  const r = DB.gastosRecurrentes.find(x=>x.id===id);
  if(!r) return;
  editingRecurrenteId = r.id;
  document.getElementById("gr-nombre").value = r.nombre || "";
  document.getElementById("gr-cat").value = r.categoria || "";
  document.getElementById("gr-metodo").value = r.metodo || "";
  document.getElementById("gr-prov").value = r.proveedor || "";
  document.getElementById("gr-monto").value = r.monto || "";
  document.getElementById("gr-frec").value = r.frecuencia || "monthly";
  document.getElementById("gr-inicio").value = r.nextDate || r.inicio || hoyISO();
  document.getElementById("gr-desc").value = r.desc || "";
}
function pausarGastoRecurrente(id){
  const r = DB.gastosRecurrentes.find(x=>x.id===id);
  if(!r) return;
  r.activo = r.activo===false;
  saveDB(); renderGastosRecurrentes();
}
function eliminarGastoRecurrente(id){
  const r = DB.gastosRecurrentes.find(x=>x.id===id);
  if(!r) return;
  if(!confirm(`¿Eliminar el recurrente "${r.nombre}"? No elimina gastos ya generados.`)) return;
  DB.gastosRecurrentes = DB.gastosRecurrentes.filter(x=>x.id!==id);
  saveDB(); renderGastosRecurrentes();
}
function generarGastosRecurrentes(onlyId){
  const hasta = document.getElementById("gr-hasta")?.value || hoyISO();
  if(!parseISODate(hasta)){ alert("Selecciona una fecha válida en Generar hasta."); return; }
  let creados = 0;
  (DB.gastosRecurrentes||[]).forEach(rec=>{
    if(onlyId && rec.id!==onlyId) return;
    if(rec.activo===false) return;
    let fecha = rec.nextDate || rec.inicio || hoyISO();
    let guard = 0;
    while(fecha && fecha <= hasta && guard < 260){
      const key = recurrentPeriodKey(rec, fecha);
      const exists = DB.gastos.some(g=>g.recurrenteKey===key);
      if(!exists){
        DB.gastos.push({
          id:id_uniq(),
          fecha,
          categoria:rec.categoria,
          proveedor:rec.proveedor || "",
          metodo:rec.metodo,
          monto:Number(rec.monto||0),
          desc: rec.desc || rec.nombre || "Gasto recurrente",
          recurrenteId: rec.id,
          recurrenteKey: key
        });
        creados++;
      }
      fecha = nextRecurrentDate(fecha, rec.frecuencia);
      guard++;
    }
    rec.nextDate = fecha || rec.nextDate || rec.inicio;
  });
  saveDB(); renderGastos(); renderGastosRecurrentes(); renderDashboard(); renderFinanzas(); syncAbcForm(); recalcReceta();
  toast(creados ? `${creados} gasto(s) recurrente(s) generado(s)` : "No había recurrentes pendientes");
}
function guardarGasto(){
  const fecha = document.getElementById("g-fecha").value || hoyISO();
  const categoria = document.getElementById("g-cat").value;
  const metodo = document.getElementById("g-metodo").value;
  const proveedor = (document.getElementById("g-prov").value||"").trim();
  const monto = Number(document.getElementById("g-monto").value||0);
  const desc = document.getElementById("g-desc").value||"";
  if(!categoria || !metodo || monto<=0){ alert("Completa categoría, método y monto válido"); return; }

  if(editingGastoId){
    const idx = DB.gastos.findIndex(x=>x.id===editingGastoId);
    if(idx>-1){ DB.gastos[idx] = { ...DB.gastos[idx], fecha, categoria, proveedor, metodo, monto, desc }; }
    editingGastoId = null; toast("Gasto actualizado");
  }else{
    DB.gastos.push({ id:id(), fecha, categoria, proveedor, metodo, monto, desc }); toast("Gasto guardado");
  }

  if(proveedor && !DB.proveedores.includes(proveedor)){ DB.proveedores.push(proveedor); }
  saveDB(); renderProveedoresDatalist(); renderGastos(); renderDashboard(); renderFinanzas();

  document.getElementById("g-monto").value="";
  document.getElementById("g-desc").value="";
  document.getElementById("g-prov").value="";
  document.getElementById("g-fecha").value = hoyISO();
}
function renderGastos(){
  const desde = document.getElementById("fg-desde").value;
  const hasta = document.getElementById("fg-hasta").value;
  const prov = (document.getElementById("fg-prov").value||"").toLowerCase();
  const cat = document.getElementById("fg-cat")?.value || "";
  const met = document.getElementById("fg-metodo")?.value || "";
  const q = (document.getElementById("fg-q")?.value || "").toLowerCase();
  let arr = DB.gastos.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if(desde) arr = arr.filter(g=>g.fecha>=desde);
  if(hasta) arr = arr.filter(g=>g.fecha<=hasta);
  if(prov) arr = arr.filter(g=>(g.proveedor||"").toLowerCase().includes(prov));
  if(cat)  arr = arr.filter(g=> (g.categoria||"")===cat);
  if(met)  arr = arr.filter(g=> (g.metodo||"")===met);
  if(q)    arr = arr.filter(g=> ((g.desc||"").toLowerCase().includes(q) || (g.proveedor||"").toLowerCase().includes(q)));
  const tb = document.querySelector("#tabla-gastos tbody");
  tb.innerHTML = arr.map(g=>`<tr>
    <td>${escapeHtml(g.fecha)}</td>
    <td>${escapeHtml(g.categoria)}</td>
    <td>${escapeHtml(g.proveedor||"")}</td>
    <td>${escapeHtml(g.desc||"")}</td>
    <td class="right">${fmt(g.monto)}</td>
    <td>
      <button class="btn alt" data-id="${dataAttr(g.id)}" onclick="editarGasto(decodeURIComponent(this.dataset.id))">Editar</button>
      <button class="btn primary" data-id="${dataAttr(g.id)}" onclick="duplicarGasto(decodeURIComponent(this.dataset.id))">Duplicar</button>
      <button class="btn ghost" data-id="${dataAttr(g.id)}" onclick="eliminarGasto(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="6" class="muted">Sin gastos</td></tr>`;

  // Resumen (total filtrado y nómina del mes actual)
  const totalFiltrado = sum(arr, g=>g.monto);
  const [y,m] = hoyISO().split('-');
  const inicioMes = `${y}-${m}-01`;
  const finMes = new Date(Number(y), Number(m), 0).toISOString().slice(0,10);
  const nomMes = sum(DB.gastos.filter(g=>g.categoria==='Nómina' && g.fecha>=inicioMes && g.fecha<=finMes), g=>g.monto);
  const div = document.getElementById('gastos-resumen');
  if(div){ div.innerHTML = `Total filtrado: <b>${fmt(totalFiltrado)}</b> · Nómina (mes actual): <b>${fmt(nomMes)}</b>`; }
}
function editarGasto(id){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  editingGastoId = g.id;
  document.querySelector('[data-tab="tab-gastos"]').click();
  document.getElementById("g-fecha").value = g.fecha;
  document.getElementById("g-cat").value = g.categoria;
  document.getElementById("g-metodo").value = g.metodo;
  document.getElementById("g-prov").value = g.proveedor || "";
  document.getElementById("g-monto").value = g.monto;
  document.getElementById("g-desc").value = g.desc || "";
}
function duplicarGasto(id){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  const nuevo = { ...g, id:id_uniq(), fecha:hoyISO() };
  DB.gastos.unshift(nuevo);
  saveDB(); renderGastos(); renderDashboard(); renderFinanzas();
  toast('Gasto duplicado');
}
function eliminarGasto(id){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  if(!confirm(`¿Eliminar el gasto de ${fmt(g.monto)} (${g.categoria}) del ${g.fecha}?`)) return;
  DB.gastos = DB.gastos.filter(x=>x.id!==id);
  saveDB(); renderGastos(); renderDashboard(); renderFinanzas(); toast("Gasto eliminado");
}
function exportarCSVGastos(){
  const headers = ["Fecha","Categoria","Proveedor","Descripcion","Metodo","Monto"]; 
  const rows = DB.gastos.map(g=>[g.fecha,g.categoria,g.proveedor||"",g.desc||"",g.metodo, g.monto]);
  descargarCSV([headers,...rows], `gastos_${hoyISO()}.csv`);
}

function initFinanzasUI(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const desde = document.getElementById('fin-desde');
  const hasta = document.getElementById('fin-hasta');
  const nomFecha = document.getElementById('nom-fecha');
  if(desde && !desde.value) desde.value = ymd(start);
  if(hasta && !hasta.value) hasta.value = hoyISO();
  if(nomFecha && !nomFecha.value) nomFecha.value = hoyISO();
}
function getFinRange(){
  initFinanzasUI();
  return {
    desde: document.getElementById('fin-desde')?.value || '',
    hasta: document.getElementById('fin-hasta')?.value || ''
  };
}
function renderFinanzas(){
  if(!window.FinanceCore) return;
  const { desde, hasta } = getFinRange();
  const summary = FinanceCore.buildFinancialSummary(DB, desde, hasta);
  const avgTicketInput = document.getElementById('fin-ticket');
  if(avgTicketInput && !avgTicketInput.value && summary.avgTicket > 0) avgTicketInput.value = summary.avgTicket;
  const variablePct = Number(document.getElementById('fin-var-pct')?.value || 35);
  const avgTicket = Number(document.getElementById('fin-ticket')?.value || summary.avgTicket || 0);
  const schedule = getAbcSchedule();
  const breakEven = FinanceCore.calculateBreakEven({
    fixedCosts: summary.fixedCosts,
    variableCostPct: variablePct,
    avgTicket,
    productiveDays: countAbcProductiveDays(desde, hasta),
    productiveDaysPerWeek: schedule.days.length,
    weeksPerMonth: 52 / 12
  });

  const kpis = document.getElementById('fin-kpis');
  if(kpis){
    kpis.innerHTML = `
      <div class="box"><h3>Ventas facturadas</h3><b>${fmt(summary.salesTotal)}</b></div>
      <div class="box"><h3>Ingresos cobrados</h3><b>${fmt(summary.cashIn)}</b></div>
      <div class="box"><h3>Cuentas por cobrar</h3><b>${fmt(summary.receivables)}</b></div>
      <div class="box"><h3>Gastos totales</h3><b>${fmt(summary.expensesTotal)}</b></div>
      <div class="box"><h3>Nómina</h3><b>${fmt(summary.payrollTotal)}</b></div>
      <div class="box"><h3>Utilidad neta</h3><b>${fmt(summary.netProfit)}</b></div>
      <div class="box"><h3>Flujo de caja</h3><b>${fmt(summary.cashBalance)}</b></div>
      <div class="box"><h3>Ticket promedio</h3><b>${fmt(summary.avgTicket)}</b></div>
    `;
  }

  const equilibrio = document.getElementById('fin-equilibrio');
  if(equilibrio){
    equilibrio.innerHTML = `
      <div><b>Costos fijos del rango</b><div class="right">${fmt(breakEven.fixedCosts)}</div></div>
      <div><b>Margen contribución</b><div class="right">${breakEven.contributionPct.toFixed(2)}%</div></div>
      <div><b>Ventas necesarias (rango)</b><div class="right">${fmt(breakEven.salesRequired)}</div></div>
      <div><b>Meta diaria</b><div class="right">${fmt(breakEven.dailySalesRequired)} · ${breakEven.dailyTicketsRequired} ticket(s)</div></div>
      <div><b>Meta semanal</b><div class="right">${fmt(breakEven.weeklySalesRequired)} · ${breakEven.weeklyTicketsRequired} ticket(s)</div></div>
      <div><b>Meta mensual estimada</b><div class="right">${fmt(breakEven.monthlySalesRequired)} · ${breakEven.monthlyTicketsRequired} ticket(s)</div></div>
      <div><b>Tickets necesarios (rango)</b><div class="right">${breakEven.ticketsRequired}</div></div>
    `;
  }

  const rows = FinanceCore.buildAccountStatement(DB, desde, hasta);
  const tb = document.querySelector('#tabla-estado-cuenta tbody');
  if(tb){
    tb.innerHTML = rows.map(r=>`<tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${r.type === 'ingreso' ? 'Ingreso' : 'Egreso'}</td>
      <td>${escapeHtml(r.concept)}</td>
      <td class="right">${r.income ? fmt(r.income) : ''}</td>
      <td class="right">${r.expense ? fmt(r.expense) : ''}</td>
      <td class="right">${fmt(r.balance)}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="muted">Sin movimientos en el rango</td></tr>`;
  }
}
function limpiarNomina(){
  ['nom-colab','nom-periodo','nom-monto','nom-notas'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const fecha = document.getElementById('nom-fecha'); if(fecha) fecha.value = hoyISO();
}
function guardarNomina(){
  if(!window.FinanceCore) return;
  const colaborador = (document.getElementById('nom-colab')?.value || '').trim();
  const monto = Number(document.getElementById('nom-monto')?.value || 0);
  if(!colaborador || monto<=0){ alert('Captura colaborador y monto de nómina válido'); return; }
  const gasto = FinanceCore.buildPayrollExpense({
    id: id(),
    fecha: document.getElementById('nom-fecha')?.value || hoyISO(),
    colaborador,
    periodo: document.getElementById('nom-periodo')?.value || '',
    metodo: document.getElementById('nom-metodo')?.value || 'Transferencia',
    monto,
    notas: document.getElementById('nom-notas')?.value || ''
  });
  DB.gastos.push(gasto);
  if(colaborador && !DB.proveedores.includes(colaborador)) DB.proveedores.push(colaborador);
  saveDB();
  renderProveedoresDatalist(); renderGastos(); renderDashboard(); renderFinanzas();
  limpiarNomina();
  toast('Nómina registrada como gasto');
}
function exportarCSVEstadoCuenta(){
  if(!window.FinanceCore) return;
  const { desde, hasta } = getFinRange();
  const rows = FinanceCore.buildAccountStatement(DB, desde, hasta).map(r=>[r.date, r.type, r.concept, r.income, r.expense, r.balance]);
  descargarCSV([['Fecha','Tipo','Concepto','Ingreso','Egreso','Saldo'], ...rows], `estado_cuenta_${desde||'inicio'}_${hasta||hoyISO()}.csv`);
}

function fijarMesActualGastos(){
  const d = new Date();
  const y = d.getFullYear(); const m = d.getMonth();
  const inicio = new Date(y, m, 1).toISOString().slice(0,10);
  const fin = new Date(y, m+1, 0).toISOString().slice(0,10);
  const a = document.getElementById('fg-desde'); if(a) a.value = inicio;
  const b = document.getElementById('fg-hasta'); if(b) b.value = fin;
  renderGastos();
}

/*******************************
 * REPORTES / EXPORTACIONES
 *******************************/
function generarReporte(){
  const d = document.getElementById("r-desde").value;
  const h = document.getElementById("r-hasta").value;
  const c = (document.getElementById("r-cliente").value||"").toLowerCase();
  const tipo = document.getElementById("r-tipo").value;
  const out = document.getElementById("reporte-out");
  out.innerHTML = "";

  let ventas = DB.ventas.slice();
  if(d) ventas = ventas.filter(v=>ymd(v.fecha)>=d);
  if(h) ventas = ventas.filter(v=>ymd(v.fecha)<=h);
  if(c) ventas = ventas.filter(v=>(v.clienteNombre||"").toLowerCase().includes(c));

  let gastos = DB.gastos.slice();
  if(d) gastos = gastos.filter(g=>g.fecha>=d);
  if(h) gastos = gastos.filter(g=>g.fecha<=h);

  const fmtRow = (cols)=>`<tr>${cols.map((x,i)=>`<td class="${i>=cols.length-2? 'right':''}">${escapeHtml(x)}</td>`).join('')}</tr>`;
  const table = (headers, rows)=>`<table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}" class="muted">Sin resultados</td></tr>`}</tbody></table>`;

  if(tipo==="resumen"){
    const ventasTotal = sum(ventas,v=>v.total);
    const pagado = sum(ventas.filter(v=>(v.estatusPago||"")==="Pagado"), v=>v.total);
    const cxc = sum(ventas.filter(v=>(v.estatusPago||"")!=="Pagado"), v=>Math.max(0,v.saldo||0));
    const totalGastos = sum(gastos,g=>g.monto);
    out.innerHTML = `
      <div class="kpi" style="margin-top:6px">
        <div class="box"><h3>Ingresos (ventas)</h3><b>${fmt(ventasTotal)}</b></div>
        <div class="box"><h3>Pagado</h3><b>${fmt(pagado)}</b></div>
        <div class="box"><h3>Cuentas por cobrar</h3><b>${fmt(cxc)}</b></div>
        <div class="box"><h3>Gastos</h3><b>${fmt(totalGastos)}</b></div>
        <div class="box"><h3>Utilidad</h3><b>${fmt(ventasTotal-totalGastos)}</b></div>
        <div class="box"><h3>Tickets</h3><b>${ventas.length}</b></div>
      </div>`;
    const cont = document.createElement('div');
    cont.innerHTML = '<h4>Ingresos vs Gastos</h4><canvas id="repResumen"></canvas>';
    out.appendChild(cont);
    drawChartDoughnut('repResumen', ['Ingresos','Gastos'], [ventasTotal,totalGastos], ()=>{});
    return;
  }

  if(tipo==="ventas"){
    const rows = ventas.map(v=>fmtRow([v.folio, fmtLocal(v.fecha), v.clienteNombre||'Mostrador', v.canal||'—', v.envioMetodo||'—', v.estatusPago||'—', fmt(v.total), fmt(v.saldo)]));
    out.innerHTML = table(["Folio","Fecha","Cliente","Canal","Envío","Estatus","Total","Saldo"], rows);
    const cont = document.createElement('div');
    cont.innerHTML = '<h4>Evolución de ventas</h4><canvas id="repVentasDia"></canvas>';
    out.appendChild(cont);
    const byDay = {};
    ventas.forEach(v=>{ const d0=ymd(v.fecha); byDay[d0]=(byDay[d0]||0)+v.total; });
    const lab = Object.keys(byDay).sort();
    const dat = lab.map(k=>byDay[k]);
    drawChartLine('repVentasDia', lab, dat, ()=>{});
    return;
  }

  if(tipo==="gastos"){
    const rows = gastos.map(g=>fmtRow([g.fecha, g.categoria, g.proveedor||'', g.metodo, fmt(g.monto)]));
    out.innerHTML = table(["Fecha","Categoría","Proveedor","Método","Monto"], rows);
    const cont = document.createElement('div');
    cont.innerHTML = '<h4>Gastos por categoría</h4><canvas id="repGastosCat"></canvas>';
    out.appendChild(cont);
    const gc={}; gastos.forEach(g=> gc[g.categoria]=(gc[g.categoria]||0)+g.monto );
    drawChartBar('repGastosCat', Object.keys(gc), Object.values(gc), ()=>{});
    return;
  }

  if(tipo==="corte_caja"){
    const porMP = {};
    ventas.forEach(v=> (v.pagos||[]).forEach(p=> porMP[p.metodo]=(porMP[p.metodo]||0)+p.monto));
    const rowsMP = Object.entries(porMP).sort((a,b)=>b[1]-a[1]).map(([k,v])=>fmtRow([k, fmt(v)]));
    const ventasTotal = sum(ventas,v=>v.total);
    const pagado = sum(ventas.filter(v=>(v.estatusPago||"")==="Pagado"), v=>v.total);
    const cxc = sum(ventas.filter(v=>(v.estatusPago||"")!=="Pagado"), v=>Math.max(0,v.saldo||0));
    const totalGastos = sum(gastos,g=>g.monto);
    out.innerHTML = `
      <div class="kpi" style="margin-top:6px">
        <div class="box"><h3>Ingresos (ventas)</h3><b>${fmt(ventasTotal)}</b></div>
        <div class="box"><h3>Pagado</h3><b>${fmt(pagado)}</b></div>
        <div class="box"><h3>Cuentas por cobrar</h3><b>${fmt(cxc)}</b></div>
        <div class="box"><h3>Gastos</h3><b>${fmt(totalGastos)}</b></div>
        <div class="box"><h3>Utilidad</h3><b>${fmt(ventasTotal-totalGastos)}</b></div>
      </div>
      <h4>Métodos de pago</h4>
      ${table(["Método","Monto"], rowsMP)}
    `;
    const cont = document.createElement('div');
    cont.innerHTML = '<h4>Gráfica</h4><canvas id="repBar"></canvas>';
    out.appendChild(cont);
    drawChartBar('repBar', Object.keys(porMP), Object.values(porMP), ()=>{});
    return;
  }

  if(tipo==="estado_cuenta"){
    if(!window.FinanceCore){ out.innerHTML = '<p class="muted">Módulo financiero no disponible.</p>'; return; }
    const rows = FinanceCore.buildAccountStatement(DB, d, h).map(r=>fmtRow([r.date, r.type === 'ingreso' ? 'Ingreso' : 'Egreso', r.concept, fmt(r.income), fmt(r.expense), fmt(r.balance)]));
    out.innerHTML = table(["Fecha","Tipo","Concepto","Ingreso","Egreso","Saldo"], rows);
    return;
  }

  if(tipo==="punto_equilibrio"){
    if(!window.FinanceCore){ out.innerHTML = '<p class="muted">Módulo financiero no disponible.</p>'; return; }
    const summary = FinanceCore.buildFinancialSummary(DB, d, h);
    const variablePct = summary.salesTotal > 0 ? Math.min(99, (summary.variableCosts / summary.salesTotal) * 100) : 35;
    const be = FinanceCore.calculateBreakEven({ fixedCosts: summary.fixedCosts, variableCostPct: variablePct, avgTicket: summary.avgTicket });
    out.innerHTML = `
      <div class="kpi" style="margin-top:6px">
        <div class="box"><h3>Costos fijos</h3><b>${fmt(be.fixedCosts)}</b></div>
        <div class="box"><h3>Costo variable</h3><b>${be.variableCostPct.toFixed(2)}%</b></div>
        <div class="box"><h3>Margen contribución</h3><b>${be.contributionPct.toFixed(2)}%</b></div>
        <div class="box"><h3>Ventas necesarias</h3><b>${fmt(be.salesRequired)}</b></div>
        <div class="box"><h3>Tickets necesarios</h3><b>${be.ticketsRequired}</b></div>
      </div>`;
    return;
  }

  const groupMonto = (kv)=>{
    const rows = Object.entries(kv).sort((a,b)=>b[1]-a[1]).map(([k,v])=>fmtRow([k, fmt(v)]));
    out.innerHTML = table(["Concepto","Monto"], rows);
    const cont = document.createElement('div');
    cont.innerHTML = '<h4>Gráfica</h4><canvas id="repBar"></canvas>';
    out.appendChild(cont);
    drawChartBar('repBar', Object.keys(kv), Object.values(kv), ()=>{});
  };

  if(tipo==="ventas_canal"){
    const kv = {}; ventas.forEach(v=>{ kv[v.canal||'—']=(kv[v.canal||'—']||0)+v.total; });
    return groupMonto(kv);
  }
  if(tipo==="ventas_sucursal"){
    const kv = {}; ventas.forEach(v=>{ kv[v.sucursal||'—']=(kv[v.sucursal||'—']||0)+v.total; });
    return groupMonto(kv);
  }
  if(tipo==="ventas_mp"){
    const kv = {}; ventas.forEach(v=> (v.pagos||[]).forEach(p=> kv[p.metodo]=(kv[p.metodo]||0)+p.monto));
    return groupMonto(kv);
  }
  if(tipo==="ventas_estatus"){
    const kv = {}; ventas.forEach(v=>{ const k=v.estatusPago||'—'; kv[k]=(kv[k]||0)+v.total; });
    return groupMonto(kv);
  }
  if(tipo==="ventas_categoria"){
    const mapProdCat = new Map(DB.productos.map(p=>[p.producto,p.categoria]));
    const kv = {};
    ventas.forEach(v=> v.items.forEach(it=>{ const cat=mapProdCat.get(it.prod)||'(sin cat)'; kv[cat]=(kv[cat]||0)+it.precio*it.cant; }));
    return groupMonto(kv);
  }
  if(tipo==="top_productos"){
    const kv = {};
    ventas.forEach(v=> v.items.forEach(it=>{ const k=`${it.prod} ${it.talla}`; kv[k]=(kv[k]||0)+it.precio*it.cant; }));
    return groupMonto(kv);
  }
}

function exportarCSVVentas(){
  const headers = ["Folio","Fecha","Cliente","Canal","StatusPago","Total","Saldo"];
  const rows = DB.ventas.map(v=>[v.folio, v.fecha, v.clienteNombre||"Mostrador", v.canal, (v.estatusPago||""), v.total, v.saldo]);
  descargarCSV([headers,...rows], `ventas_${hoyISO()}.csv`);
}

function descargarCSV(rows, filename){
  const csv = rows.map(r=>r.map(c=>`"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function exportarJSON(){
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `backup_panera_${hoyISO()}.json`; a.click();
}
function importarJSON(){
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
  inp.onchange = () => {
    const f = inp.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => { try{
      const data = JSON.parse(reader.result);
      ["config","clientes","proveedores","productos","ventas","gastos","gastosRecurrentes","eventos","costeo"].forEach(k=>{ if(data[k]!==undefined) DB[k]=data[k]; });
      saveDB(); initUI(); toast("Backup restaurado");
    }catch(e){ alert("JSON inválido"); } };
    reader.readAsText(f);
  };
  inp.click();
}

/* Funciones nuevas de dashboard rápidas */
function generarCorteRapidoHoy(){
  const hoy = ymd(new Date());
  const ventas = DB.ventas.filter(v=> ymd(v.fecha)===hoy);
  const gastos = DB.gastos.filter(g=> g.fecha===hoy);
  const porMP = {};
  ventas.forEach(v=> (v.pagos||[]).forEach(p=> porMP[p.metodo]=(porMP[p.metodo]||0)+Number(p.monto||0)));
  const total = sum(ventas,v=>Number(v.total||0));
  const pagado = sum(ventas.filter(v=>(v.estatusPago||"")==="Pagado"), v=>Number(v.total||0));
  const cxc = sum(ventas.filter(v=>(v.estatusPago||"")!=="Pagado"), v=>Math.max(0, Number(v.saldo||0)));
  const tg = sum(gastos,g=>Number(g.monto||0));
  const util = total - tg;
  const tbl = Object.entries(porMP).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td class="right">${fmt(v)}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">Sin pagos</td></tr>`;
  const html = `
    <div class="modal" onclick="this.remove()">
      <div class="box" onclick="event.stopPropagation()">
        <div class="flex" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Corte de caja – ${hoy}</h3><button class="btn ghost" onclick="this.closest('.modal').remove()">Cerrar</button></div>
        <div class="kpi" style="margin:10px 0">
          <div class="box"><h3>Ventas</h3><b>${fmt(total)}</b></div>
          <div class="box"><h3>Pagado</h3><b>${fmt(pagado)}</b></div>
          <div class="box"><h3>CxC</h3><b>${fmt(cxc)}</b></div>
          <div class="box"><h3>Gastos</h3><b>${fmt(tg)}</b></div>
          <div class="box"><h3>Utilidad</h3><b>${fmt(util)}</b></div>
          <div class="box"><h3>Tickets</h3><b>${ventas.length}</b></div>
        </div>
        <h4>Métodos de pago</h4>
        <table style="width:100%"><thead><tr><th>Método</th><th class="right">Monto</th></tr></thead><tbody>${tbl}</tbody></table>
        <div class="flex" style="margin-top:10px;gap:8px">
          <button class="btn primary" onclick="exportarCSVCorteHoy()">Descargar CSV</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
function exportarCSVCorteHoy(){
  const hoy = ymd(new Date());
  const ventas = DB.ventas.filter(v=> ymd(v.fecha)===hoy);
  const gastos = DB.gastos.filter(g=> g.fecha===hoy);
  const porMP = {}; ventas.forEach(v=> (v.pagos||[]).forEach(p=> porMP[p.metodo]=(porMP[p.metodo]||0)+Number(p.monto||0)));
  const rows = [["Concepto","Monto"],["Ventas", sum(ventas,v=>Number(v.total||0))],["Gastos", sum(gastos,g=>Number(g.monto||0))]];
  Object.entries(porMP).forEach(([k,v])=> rows.push([`MP:${k}`, v]));
  descargarCSV(rows, `corte_${hoy}.csv`);
}
function descargarBackupRapido(){
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup_panera_${hoyISO()}.json`; a.click();
}

/*******************************
 * CONFIGURACIÓN
 *******************************/
function guardarConfig(){
  DB.config.prefijo = document.getElementById("cfg-prefijo").value || "PAN";
  DB.config.nombreNegocio = (document.getElementById('cfg-nombre').value||'').trim() || 'Panera Signature';
  DB.config.autoPrintTicket = (document.getElementById('cfg-autoprint').value||'no')==='si';
  const mpv = (document.getElementById('cfg-mp-ventas').value||'').split(',').map(x=>x.trim()).filter(Boolean);
  const mpg = (document.getElementById('cfg-mp-gastos').value||'').split(',').map(x=>x.trim()).filter(Boolean);
  DB.config.metodosVentas = mpv.length? mpv : METODOS_DEFAULT_VENTAS.slice();
  DB.config.metodosGastos = mpg.length? mpg : METODOS_DEFAULT_GASTOS.slice();
  readAbcScheduleFromUI();
  saveDB();
  // refrescar selects dependientes
  fillSelect("pago-metodo", getMetodosVentas());
  fillSelect("v-metodo-pago-top", getMetodosVentas());
  fillSelect("g-metodo", getMetodosGastos());
  fillSelectFiltro("f-mp", getMetodosVentas());
  const fb = document.getElementById('footer-brand'); if(fb) fb.textContent = DB.config.nombreNegocio;
  renderAbcScheduleConfig();
  recalc(); renderDashboard(); renderFinanzas(); syncAbcForm(); recalcReceta(); toast("Configuración guardada");
}
function resetearTodo(){
  if(!confirm("¿Borrar toda la base local? Esta acción es irreversible.")) return;
  localStorage.removeItem("panera.db.v1");
  Object.keys(localStorage).forEach(k=>{ if(k.startsWith("folio.")) localStorage.removeItem(k); });
  loadDB(); saveDB(); initUI();
}

/*******************************
 * DASHBOARD
 *******************************/
let dashboardRenderTimer = null;
function scheduleDashboardRender(){
  if(dashboardRenderTimer) clearTimeout(dashboardRenderTimer);
  dashboardRenderTimer = setTimeout(()=>{ dashboardRenderTimer = null; renderDashboard(); }, 180);
}
function renderDashboard(){
  const dDesde = document.getElementById("db-desde")?.value || null;
  const dHasta = document.getElementById("db-hasta")?.value || null;
  const startOfMonth = (()=>{ const d=new Date(); d.setDate(1); return ymd(d); })();
  const endToday = hoyISO();
  const rDesde = dDesde || startOfMonth;
  const rHasta = dHasta || endToday;
  const inRange = (iso) => (!rDesde || ymd(iso) >= rDesde) && (!rHasta || ymd(iso) <= rHasta);

  const ventasRango = DB.ventas.filter(v=> inRange(v.fecha));
  const ventasRangoTotal = sum(ventasRango, v=>v.total);
  const pagadoRango = sum(ventasRango.filter(v=> (v.estatusPago||"") === "Pagado"), v=>v.total);
  const saldoRango = sum(ventasRango.filter(v=> (v.estatusPago||"") !== "Pagado"), v=>Math.max(0, v.saldo||0));
  const totalGastosRango = sum(DB.gastos.filter(g=> inRange(g.fecha)), g=>g.monto);
  const fin = window.FinanceCore ? FinanceCore.buildFinancialSummary(DB, rDesde, rHasta) : null;

  const countTicketsRango = ventasRango.length || 1;
  const ticketProm = ventasRangoTotal / countTicketsRango;

  const productosVendidosRango = sum(ventasRango, v => sum(v.items, it => it.cant));
  const mapCatByProd = new Map(DB.productos.map(p=>[p.producto,p.categoria]));
  let pastelesVendidosRango = 0;
  ventasRango.forEach(v => v.items.forEach(it => { if((mapCatByProd.get(it.prod)||"") === "Pasteles"){ pastelesVendidosRango += it.cant; } }));

  const kpi = document.getElementById("kpi-cards");
  if(kpi){
    kpi.innerHTML = `
      <div class="box"><h3>Ventas (rango)</h3><b>${fmt(ventasRangoTotal)}</b></div>
      <div class="box"><h3>Pagado (rango)</h3><b>${fmt(pagadoRango)}</b></div>
      <div class="box"><h3>CxC (rango)</h3><b>${fmt(saldoRango)}</b></div>
      <div class="box"><h3>Gastos (rango)</h3><b>${fmt(totalGastosRango)}</b></div>
      <div class="box"><h3>Utilidad (rango)</h3><b>${fmt(ventasRangoTotal - totalGastosRango)}</b></div>
      <div class="box"><h3>Flujo de caja</h3><b>${fmt(fin ? fin.cashBalance : (pagadoRango - totalGastosRango))}</b></div>
      <div class="box"><h3>Nómina</h3><b>${fmt(fin ? fin.payrollTotal : 0)}</b></div>
      <div class="box"><h3>Ticket promedio</h3><b>${fmt(ticketProm)}</b></div>
      <div class="box"><h3>Pasteles vendidos</h3><b>${pastelesVendidosRango}</b></div>
      <div class="box"><h3>Productos vendidos</h3><b>${productosVendidosRango}</b></div>
      <div class="box"><h3>Tickets</h3><b>${ventasRango.length}</b></div>
    `;
  }

  // Series por día
  const start = new Date(rDesde); const end = new Date(rHasta); const days = [];
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){ days.push(ymd(d)); }
  const ventasPorDia = days.map(d=> sum(DB.ventas.filter(v=> ymd(v.fecha)===d), v=>v.total));
  drawChartLine("chVentas", days, ventasPorDia, ()=>{});

  // Métodos de pago
  const pagos = {};
  DB.ventas.filter(v=> inRange(v.fecha)).forEach(v=> v.pagos.forEach(p=> pagos[p.metodo]=(pagos[p.metodo]||0)+p.monto ));
  drawChartDoughnut("chMetodos", Object.keys(pagos), Object.values(pagos), ()=>{});

  // Ventas por categoría
  const ventasRangoItems = {};
  const mapProdCat2 = new Map(DB.productos.map(p=>[p.producto,p.categoria]));
  ventasRango.forEach(v=> v.items.forEach(it=>{
    const cat = mapProdCat2.get(it.prod)||"(sin cat)";
    ventasRangoItems[cat] = (ventasRangoItems[cat]||0) + it.precio*it.cant;
  }));
  drawChartBar("chCategorias", Object.keys(ventasRangoItems), Object.values(ventasRangoItems), ()=>{});

  // Gastos por categoría
  const gRango = DB.gastos.filter(g=> inRange(g.fecha));
  const gCat = {}; gRango.forEach(g=> gCat[g.categoria]=(g.categoria in gCat?gCat[g.categoria]:0)+g.monto );
  drawChartBar("chGastos", Object.keys(gCat), Object.values(gCat), ()=>{});

  // Top 3 productos por cantidad
  const topCount = {};
  ventasRango.forEach(v=> v.items.forEach(it=>{ topCount[it.prod] = (topCount[it.prod]||0) + Number(it.cant||0); }));
  const top3 = Object.entries(topCount).sort((a,b)=> b[1]-a[1]).slice(0,3);
  drawChartBar("chTop3", top3.map(x=>x[0]), top3.map(x=>x[1]), ()=>{});

  // Ventas por día de semana
  const ventasPorDow = Array.from({length:7},()=>0);
  ventasRango.forEach(v=>{ const d=new Date(v.fecha).getDay(); ventasPorDow[d]+=v.total; });
  drawChartBar("chDow", DOW_ES, ventasPorDow, ()=>{});

  // Ventas por canal
  const byCanal = {}; ventasRango.forEach(v=>{ const k=v.canal||'—'; byCanal[k]=(byCanal[k]||0)+v.total; });
  drawChartBar('chCanal', Object.keys(byCanal), Object.values(byCanal), ()=>{});


  // Pagado vs Saldo (rango)
  const pagadoMonto = sum(ventasRango, v=> sum(v.pagos||[], p=>Number(p.monto||0)));
  const saldoMonto = sum(ventasRango, v=> Math.max(0, Number(v.saldo||0)));
  drawChartDoughnut('chPagadoSaldo', ['Pagado','Saldo'], [pagadoMonto, saldoMonto], ()=>{});

  // Ticket promedio por día
  const totByDay = {}; const cntByDay = {};
  ventasRango.forEach(v=>{ const d0=ymd(v.fecha); totByDay[d0]=(totByDay[d0]||0)+v.total; cntByDay[d0]=(cntByDay[d0]||0)+1; });
  const avgTicket = days.map(d=> cntByDay[d]? (totByDay[d]/cntByDay[d]) : 0);
  drawChartLine('chTicketProm', days, avgTicket, ()=>{});

  // Próximas 24h
  const ahora = Date.now();
  const prox24h = ahora + 24*60*60*1000;
  const entregas = DB.ventas.filter(v=>{
    const f = v?.entrega?.fecha ? new Date(v.entrega.fecha).getTime() : NaN;
    const okFecha = !isNaN(f) && f>=ahora && f<=prox24h;
    const okStatus = (v.estatusEntrega||"Por preparar")!=='Entregado' && (v.estatusEntrega||"Por preparar")!=='Cancelado';
    return okFecha && okStatus;
  }).sort((a,b)=> new Date(a.entrega.fecha) - new Date(b.entrega.fecha));
  const tbp = document.querySelector('#tabla-entregas-proximas tbody');
  if(tbp){ tbp.innerHTML = (entregas.map(v=>`<tr>
      <td>${escapeHtml(v.folio)}</td>
      <td>${escapeHtml(v.clienteNombre||'Mostrador')}</td>
      <td>${escapeHtml((v.entrega?.fecha||'').replace('T',' ').slice(0,16))}</td>
      <td>${escapeHtml(v.envioMetodo||'—')}</td>
      <td>${escapeHtml(v.estatusEntrega||'—')}</td>
      <td>${escapeHtml(v.notas||'')}</td>
    </tr>`).join('')) || `<tr><td colspan="6" class="muted">Sin entregas próximas</td></tr>`; }
}

// Gráficas seguras (no truenan si falta el canvas)
function chartSafeCtx(id){
  const el = document.getElementById(id);
  if(!el) return null;
  const ctx = el.getContext && el.getContext('2d');
  return ctx || null;
}
function drawChartLine(id, labels, data, cb){
  const ctx = chartSafeCtx(id); if(!ctx){ cb&&cb(null); return; }
  if(typeof Chart === 'undefined'){ cb&&cb(null); return; }
  if(window[id+"_inst"]) window[id+"_inst"].destroy();
  const pal = chartPalette();
  const inst = new Chart(ctx, { type:"line", data:{ labels: labels||[], datasets:[{ label:"Monto", data: (data||[]), tension:0.35, borderWidth:2, borderColor: pal[0], backgroundColor: toRgba(pal[0], .15), pointRadius:2 }] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, grid:{ color: toRgba(cssVar('--p-light')||'#e5e7eb', .6) } }, x:{ grid:{ display:false } } } } });
  window[id+"_inst"] = inst;
  window._charts = (window._charts||[]).filter(c=> c?.canvas?.id !== id);
  window._charts.push(inst);
  cb&&cb(inst);
}
function drawChartBar(id, labels, data, cb){
  const ctx = chartSafeCtx(id); if(!ctx){ cb&&cb(null); return; }
  if(typeof Chart === 'undefined'){ cb&&cb(null); return; }
  if(window[id+"_inst"]) window[id+"_inst"].destroy();
  const pal = chartPalette();
  const inst = new Chart(ctx, { type:"bar", data:{ labels: labels||[], datasets:[{ label:"Monto", data: (data||[]), backgroundColor: pal[1] }] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, grid:{ color: toRgba(cssVar('--p-light')||'#e5e7eb', .6) } }, x:{ grid:{ display:false } } } } });
  window[id+"_inst"] = inst;
  window._charts = (window._charts||[]).filter(c=> c?.canvas?.id !== id);
  window._charts.push(inst);
  cb&&cb(inst);
}
function drawChartDoughnut(id, labels, data, cb){
  const ctx = chartSafeCtx(id); if(!ctx){ cb&&cb(null); return; }
  if(typeof Chart === 'undefined'){ cb&&cb(null); return; }
  if(window[id+"_inst"]) window[id+"_inst"].destroy();
  const pal = chartPalette();
  const colors = (data||[]).map((_,i)=> pal[i % pal.length]);
  const inst = new Chart(ctx, { type:"doughnut", data:{ labels: labels||[], datasets:[{ data: (data||[]), backgroundColor: colors }] }, options:{ responsive:true, plugins:{legend:{position:"bottom"}} } });
  window[id+"_inst"] = inst;
  window._charts = (window._charts||[]).filter(c=> c?.canvas?.id !== id);
  window._charts.push(inst);
  cb&&cb(inst);
}

/*******************************
 * IMPORTADOR RÁPIDO CSV (PRODUCTOS)
 *******************************/
function abrirImportador(){ document.getElementById("importador").classList.remove("hidden"); }
function cerrarImportador(){ document.getElementById("importador").classList.add("hidden"); }
function procesarCSV(){
  const txt = document.getElementById("csv").value.trim();
  if(!txt){ alert("Pega el CSV primero"); return; }
  const rows = txt.split(/\r?\n/).map(l=>l.split(",").map(x=>x.trim()));
  rows.forEach(([categoria,producto,variante,precio])=>{
    if(!categoria||!producto||!variante||!precio) return;
    let p = DB.productos.find(x=>x.producto===producto && x.categoria===categoria);
    if(!p){ p = {categoria, producto, variantes:{}, activo:true}; DB.productos.push(p); }
    p.variantes[variante] = Number(precio)||0;
  });
  saveDB(); renderCategorias(); renderProductos(); renderVariantes(); renderTablaProductos(); rebuildProductIndex();
  toast("Catálogo actualizado");
}

/*******************************
 * ARRANQUE
 *******************************/
async function startAuthenticatedApp(){
  if(authenticatedStartPromise) return authenticatedStartPromise;
  authenticatedStartPromise = (async()=>{
    const remoteChanged = await syncRemoteDB();
    const seededRecurring = seedDefaultRecurringExpenses();
    if(seededRecurring) saveDB();
    if(remoteChanged || seededRecurring) refreshDataViews();
    if(seededRecurring) toast('Se agregaron las plantillas iniciales de gastos fijos y nómina');
  })();
  return authenticatedStartPromise;
}
async function bootstrap(){
  loadDB();
  initUI();
  scheduleChartLibrary();
  const authenticated = await initAuth();
  if(authenticated) await startAuthenticatedApp();
}
window.addEventListener("DOMContentLoaded", bootstrap, { once:true });

// ==============================
// BÚSQUEDA RÁPIDA DE PRODUCTOS
// ==============================
let PRODUCT_INDEX = [];
function rebuildProductIndex(){
  PRODUCT_INDEX = [];
  DB.productos.filter(p=>p.activo!==false).forEach(p=>{
    Object.entries(p.variantes||{}).forEach(([v,precio])=>{
      PRODUCT_INDEX.push({ cat:p.categoria, prod:p.producto, var:v, precio, key:`${p.producto} ${v}`.toLowerCase() });
    });
  });
}
function buscarProductoRapido(q){
  const term = (q||'').trim().toLowerCase(); if(!term) return [];
  const toks = term.split(/\s+/).filter(Boolean);
  const scored = PRODUCT_INDEX.map(it=>{
    const score = toks.reduce((s,t)=> s + (it.key.includes(t)?1:0), 0);
    return {it, score};
  }).filter(x=>x.score>0).sort((a,b)=> b.score - a.score).slice(0,10).map(x=>x.it);
  return scored;
}
function renderSugerenciasProducto(){
  const box = document.getElementById('p-suggest'); const inp = document.getElementById('p-buscar-rapido'); if(!box||!inp) return;
  const arr = buscarProductoRapido(inp.value);
  if(arr.length===0){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.innerHTML = arr.map(r=>`<div class="ac-item" data-category="${dataAttr(r.cat)}" data-product="${dataAttr(r.prod)}" data-variant="${dataAttr(r.var)}" onclick="selectProductoSugerencia(decodeURIComponent(this.dataset.category), decodeURIComponent(this.dataset.product), decodeURIComponent(this.dataset.variant))">
    <div class="ac-name">${escapeHtml(r.prod)} <span class="badge">${escapeHtml(r.var)}</span></div>
    <div class="ac-meta">${escapeHtml(r.cat)}<br>${fmt(r.precio)}</div>
  </div>`).join('');
  box.classList.remove('hidden');
}
function selectProductoSugerencia(cat, prod, vari){
  const c = document.getElementById('p-cat'); if(c){ c.value = cat; renderProductos(); }
  const p = document.getElementById('p-prod'); if(p){ p.value = prod; renderVariantes(); }
  const v = document.getElementById('p-var'); if(v){ v.value = vari; syncPrecio(); }
  document.getElementById('p-suggest')?.classList.add('hidden');
  const qty = document.getElementById('p-cant'); if(qty) qty.focus();
}
function addItemDesdeBusqueda(){
  const arr = buscarProductoRapido(document.getElementById('p-buscar-rapido').value);
  if(arr.length>0){ selectProductoSugerencia(arr[0].cat, arr[0].prod, arr[0].var); addItem(); }
}

// ==============================
// CALENDARIO / TENDENCIAS
// ==============================
let CAL_NOW = new Date();
function agregarEvento(){
  const nombre = (document.getElementById('ev-nombre').value||'').trim();
  const fecha = document.getElementById('ev-fecha').value;
  const rel = document.getElementById('ev-rel').value === 'Sí';
  if(!nombre||!fecha){ alert('Evento y fecha son obligatorios'); return; }
  DB.eventos.push({ id:id_uniq(), nombre, fecha, relevante: rel });
  saveDB(); renderEventos(); renderCalendario();
  document.getElementById('ev-nombre').value=''; document.getElementById('ev-fecha').value=''; document.getElementById('ev-rel').value='No';
  toast('Evento agregado');
}
function eliminarEvento(id){ DB.eventos = DB.eventos.filter(e=>e.id!==id); saveDB(); renderEventos(); renderCalendario(); toast('Evento eliminado'); }
function toggleEventoRel(id){ const e = DB.eventos.find(x=>x.id===id); if(e){ e.relevante=!e.relevante; saveDB(); renderEventos(); renderCalendario(); } }
function daysUntil(dateStr){ const a = new Date(); const b = new Date(dateStr+'T00:00:00'); return Math.ceil((b - a)/(1000*60*60*24)); }
function renderEventos(){
  const tb = document.querySelector('#tabla-eventos tbody'); if(!tb) return;
  const arr = DB.eventos.slice().sort((a,b)=> a.fecha.localeCompare(b.fecha));
  tb.innerHTML = arr.map(e=>`<tr>
    <td>${escapeHtml(e.fecha)}</td>
    <td>${escapeHtml(e.nombre)}</td>
    <td>${e.relevante? 'Sí':'No'}</td>
    <td class="right">${daysUntil(e.fecha)}</td>
    <td>
      <button class="btn alt" data-id="${dataAttr(e.id)}" onclick="toggleEventoRel(decodeURIComponent(this.dataset.id))">${e.relevante?'Quitar relevancia':'Marcar relevante'}</button>
      <button class="btn ghost" data-id="${dataAttr(e.id)}" onclick="eliminarEvento(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`).join('') || `<tr><td colspan="5" class="muted">Sin eventos</td></tr>`;
}
function navMes(delta){ CAL_NOW = new Date(CAL_NOW.getFullYear(), CAL_NOW.getMonth()+delta, 1); renderCalendario(); }
function renderCalendario(){
  const grid = document.getElementById('cal-grid'); const ttl = document.getElementById('cal-title'); if(!grid||!ttl) return;
  const y = CAL_NOW.getFullYear(); const m = CAL_NOW.getMonth();
  const monthName = new Date(y,m,1).toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  ttl.textContent = `Vista mensual • ${monthName}`;
  const firstDow = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const cells = [];
  // headers
  const dow = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  cells.push(...dow.map(d=>`<div class="muted" style="font-weight:700">${d}</div>`));
  for(let i=0;i<firstDow;i++){ cells.push('<div></div>'); }
  for(let d=1; d<=daysInMonth; d++){
    const yyyy = String(y); const mm = String(m+1).padStart(2,'0'); const dd = String(d).padStart(2,'0'); const iso=`${yyyy}-${mm}-${dd}`;
    const evs = DB.eventos.filter(e=>e.fecha===iso);
    const mark = evs.map(e=>`<div class="badge" style="${e.relevante?'background:#fde68a':''}">${escapeHtml(e.nombre)}</div>`).join('');
    cells.push(`<div style="border:1px solid var(--p-light);border-radius:8px;padding:6px;min-height:70px">
      <div style="font-size:12px;color:#64748b">${d}</div>
      ${mark}
    </div>`);
  }
  grid.className = 'grid g7';
  grid.innerHTML = cells.join('');
}

// util id for duplications/events
function id_uniq(){ return Math.random().toString(36).slice(2)+Date.now().toString(36).slice(-4); }

// ==============================
// PLANTILLA: CALENDARIO MARKETING MX
// ==============================
function addEventUnique(fechaISO, nombre, relevante=true){
  if(!fechaISO||!nombre) return false;
  const exists = DB.eventos.some(e=> e.fecha===fechaISO && e.nombre===nombre);
  if(exists) return false;
  DB.eventos.push({ id:id_uniq(), nombre, fecha:fechaISO, relevante });
  return true;
}
function nthWeekdayOfMonth(year, month0, weekday, n){
  // weekday: 0=domingo...6=sábado; n: 1..5
  const d = new Date(year, month0, 1);
  let add = (7 + weekday - d.getDay()) % 7; // distancia al primer weekday
  const day = 1 + add + 7*(n-1);
  return new Date(year, month0, day);
}
function lastWeekdayOfMonth(year, month0, weekday){
  const d = new Date(year, month0+1, 0); // último día del mes
  const diff = (7 + d.getDay() - weekday) % 7;
  return new Date(year, month0+1, 0 - diff);
}
function easterDate(y){
  const a=y%19; const b=Math.floor(y/100); const c=y%100; const d=Math.floor(b/4); const e=b%4; const f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3); const h=(19*a+b-d-g+15)%30; const i=Math.floor(c/4); const k=c%4; const l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451); const month=Math.floor((h+l-7*m+114)/31); const day=((h+l-7*m+114)%31)+1;
  return new Date(y, month-1, day);
}
function iso(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10); }
function seedMarketingCalendar(){
  const y = Number(document.getElementById('ev-year')?.value || new Date().getFullYear());
  const tpl = document.getElementById('ev-template')?.value || 'mx';
  if(tpl!== 'mx'){ alert('Solo plantilla MX disponible por ahora'); return; }
  let added = 0;
  // Fechas fijas MX
  [[1,1,'Año Nuevo'],[1,6,'Día de Reyes (Rosca)'],[2,2,'Día de la Candelaria'],[2,14,'San Valentín'],[3,8,'Día Internacional de la Mujer'],[4,30,'Día del Niño'],[5,1,'Día del Trabajo'],[5,10,'Día de las Madres'],[5,15,'Día del Maestro'],[9,15,'Grito de Independencia'],[9,16,'Día de la Independencia'],[10,31,'Halloween'],[11,1,'Día de Muertos (1)'],[11,2,'Día de Muertos (2)'],[12,12,'Día de la Virgen de Guadalupe'],[12,24,'Nochebuena'],[12,25,'Navidad'],[12,31,'Fin de Año']]
    .forEach(([mm,dd,nm])=>{ added += addEventUnique(`${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`, nm, true)?1:0; });

  // Día del Padre (3er domingo de junio)
  const diaPadre = nthWeekdayOfMonth(y, 5, 0, 3); added += addEventUnique(iso(diaPadre), 'Día del Padre', true)?1:0;
  // Día del Abuelo (último domingo de agosto)
  const diaAbuelo = lastWeekdayOfMonth(y, 7, 0); added += addEventUnique(iso(diaAbuelo), 'Día del Abuelo', true)?1:0;
  // Regreso a clases (último lunes de agosto)
  const regreso = lastWeekdayOfMonth(y, 7, 1); added += addEventUnique(iso(regreso), 'Regreso a clases', true)?1:0;

  // Semana Santa / Pascua
  const pascua = easterDate(y); // domingo
  const viernesSanto = new Date(pascua); viernesSanto.setDate(viernesSanto.getDate()-2);
  const juevesSanto = new Date(pascua); juevesSanto.setDate(juevesSanto.getDate()-3);
  added += addEventUnique(iso(juevesSanto), 'Jueves Santo', true)?1:0;
  added += addEventUnique(iso(viernesSanto), 'Viernes Santo', true)?1:0;
  added += addEventUnique(iso(pascua), 'Domingo de Pascua', true)?1:0;

  // Hot Sale MX (último lunes de mayo)
  const hotSale = lastWeekdayOfMonth(y, 4, 1); added += addEventUnique(iso(hotSale), 'Hot Sale (inicio aprox.)', true)?1:0;
  // Buen Fin MX (3er viernes de noviembre)
  const buenFin = nthWeekdayOfMonth(y, 10, 5, 3); added += addEventUnique(iso(buenFin), 'Buen Fin (inicio aprox.)', true)?1:0;
  // Black Friday (4º viernes de noviembre)
  const blackFriday = nthWeekdayOfMonth(y, 10, 5, 4); added += addEventUnique(iso(blackFriday), 'Black Friday', true)?1:0;
  // Cyber Monday (lunes siguiente a Black Friday)
  const cyberMonday = new Date(blackFriday); while(cyberMonday.getDay()!==1){ cyberMonday.setDate(cyberMonday.getDate()+1); }
  added += addEventUnique(iso(cyberMonday), 'Cyber Monday', true)?1:0;

  // Temporadas sugeridas
  added += addEventUnique(`${y}-06-15`, 'Temporada de graduaciones (jun–jul)', true)?1:0;
  added += addEventUnique(`${y}-10-15`, 'Arranque temporada Pan de Muerto', true)?1:0;
  added += addEventUnique(`${y}-11-15`, 'Arranque temporada Navideña', true)?1:0;

  saveDB(); renderEventos(); renderCalendario();
  toast(`${added} eventos agregados/actualizados`, 'ok');
}

/*******************************
 * COTIZADOR ENVIO POR ANILLOS
 *******************************/
function readEnvioConfigFromUI(){
  const base = DB.config.envioRings || ENVIO_DEFAULT;
  const nameEl = document.getElementById('envio-origin-name');
  if(!nameEl) return JSON.parse(JSON.stringify(base));
  const numFromInput = (el, fallback)=>{
    if(!el) return fallback;
    const raw = el.value;
    if(raw === '' || raw === null || raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const latEl = document.getElementById('envio-origin-lat');
  const lonEl = document.getElementById('envio-origin-lon');
  const origin = {
    name: (nameEl.value || base.origin.name).trim() || base.origin.name,
    lat: numFromInput(latEl, base.origin.lat),
    lon: numFromInput(lonEl, base.origin.lon)
  };
  const zones = (base.zones || []).map((z,i)=>{
    const minEl = document.getElementById(`envio-zone-min-${i}`);
    const maxEl = document.getElementById(`envio-zone-max-${i}`);
    const priceEl = document.getElementById(`envio-zone-price-${i}`);
    const min = numFromInput(minEl, z.min);
    const max = numFromInput(maxEl, z.max);
    const price = numFromInput(priceEl, z.price);
    return { name: z.name || `Zona ${i+1}`, min, max, price };
  });
  const extraKmEl = document.getElementById('envio-extra-km');
  const extraPriceEl = document.getElementById('envio-extra-price');
  const extraKm = numFromInput(extraKmEl, base.extra?.km || 0);
  const extraPrice = numFromInput(extraPriceEl, base.extra?.price || 0);
  return { origin, zones, extra: { km: extraKm, price: extraPrice } };
}

function renderEnvioConfig(){
  const cfg = DB.config.envioRings || ENVIO_DEFAULT;
  const nameEl = document.getElementById('envio-origin-name');
  if(!nameEl) return;
  const latEl = document.getElementById('envio-origin-lat');
  const lonEl = document.getElementById('envio-origin-lon');
  nameEl.value = cfg.origin?.name || 'Atzala';
  if(latEl) latEl.value = cfg.origin?.lat ?? '';
  if(lonEl) lonEl.value = cfg.origin?.lon ?? '';
  (cfg.zones || []).forEach((z,i)=>{
    const minEl = document.getElementById(`envio-zone-min-${i}`);
    const maxEl = document.getElementById(`envio-zone-max-${i}`);
    const priceEl = document.getElementById(`envio-zone-price-${i}`);
    if(minEl) minEl.value = z.min ?? '';
    if(maxEl) maxEl.value = z.max ?? '';
    if(priceEl) priceEl.value = z.price ?? '';
  });
  const extraKmEl = document.getElementById('envio-extra-km');
  const extraPriceEl = document.getElementById('envio-extra-price');
  if(extraKmEl) extraKmEl.value = cfg.extra?.km ?? '';
  if(extraPriceEl) extraPriceEl.value = cfg.extra?.price ?? '';
}

function renderEnvioRings(cfg){
  const svg = document.getElementById('envio-ring-svg');
  const legend = document.getElementById('envio-ring-legend');
  if(!svg || !legend) return;
  const zones = (cfg.zones || []).map((z,i)=>({
    name: z.name || `Zona ${i+1}`,
    min: Number(z.min)||0,
    max: Number(z.max)||0,
    price: Number(z.price)||0,
    color: `var(--envio-ring-${i+1})`
  }));
  const maxZone = Math.max(...zones.map(z=>z.max), 1);
  const center = 110;
  const maxR = 85;
  const scale = maxZone > 0 ? (maxR / maxZone) : 0;
  const circles = zones.slice().sort((a,b)=>b.max-a.max).map(z=>{
    const r = Math.max(0, z.max) * scale;
    return `<circle cx="${center}" cy="${center}" r="${r.toFixed(2)}" fill="none" stroke="${z.color}" stroke-width="12" opacity="0.9"></circle>`;
  }).join('');
  svg.innerHTML = `${circles}<circle cx="${center}" cy="${center}" r="3.5" fill="var(--p-deep)"></circle>`;

  const specialKm = Math.max(Number(cfg.extra?.km || 0), maxZone);
  const specialPrice = Number(cfg.extra?.price || 0);
  const zoneRows = zones.map((z,i)=>{
    const range = `${z.min}-${z.max} km`;
    const priceText = Number.isFinite(z.price) ? fmt(z.price) : '-';
    return `<li>
      <span class="envio-dot" style="background:${z.color}"></span>
      <div class="envio-legend-text"><b>${escapeHtml(z.name)}</b><span class="muted">${escapeHtml(range)}</span></div>
      <div class="right">${escapeHtml(priceText)}</div>
    </li>`;
  }).join('');
  const specialText = specialPrice > 0 ? fmt(specialPrice) : 'Cotizacion especial';
  const specialRow = `<li>
    <span class="envio-dot special"></span>
    <div class="envio-legend-text"><b>+${specialKm} km</b><span class="muted">Fuera de rango</span></div>
    <div class="right">${specialText}</div>
  </li>`;
  legend.innerHTML = zoneRows + specialRow;
}

function guardarEnvioConfig(){
  DB.config.envioRings = readEnvioConfigFromUI();
  saveDB();
  renderEnvioRings(DB.config.envioRings);
  toast('Configuracion de envio guardada');
}

function restaurarEnvioEjemplo(){
  DB.config.envioRings = JSON.parse(JSON.stringify(ENVIO_DEFAULT));
  saveDB();
  renderEnvioConfig();
  renderEnvioRings(DB.config.envioRings);
  toast('Ejemplo cargado');
}

function initEnvioUI(){
  const root = document.getElementById('envio-cotizador');
  if(!root) return;
  renderEnvioConfig();
  renderEnvioRings(readEnvioConfigFromUI());
  if(initEnvioUI.bound) return;
  initEnvioUI.bound = true;
  const ids = ['envio-origin-name','envio-origin-lat','envio-origin-lon','envio-extra-km','envio-extra-price'];
  ids.forEach(id=> document.getElementById(id)?.addEventListener('input', ()=> renderEnvioRings(readEnvioConfigFromUI())));
  for(let i=0; i<5; i++){
    ['min','max','price'].forEach(k=>{
      document.getElementById(`envio-zone-${k}-${i}`)?.addEventListener('input', ()=> renderEnvioRings(readEnvioConfigFromUI()));
    });
  }
  document.getElementById('envio-quick-input')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); cotizarEnvioRapido(); }
  });
}

function parseCoordPair(text){
  const nums = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(n=>Number(n));
  if(nums.length < 2) return null;
  for(let i=0; i<nums.length-1; i++){
    const lat = nums[i];
    const lon = nums[i+1];
    if(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180){
      return { lat, lon };
    }
  }
  return null;
}

function parseEnvioLine(line){
  const clean = (line || '').trim();
  if(!clean) return null;
  const parts = clean.split(/[\t|;]/).map(p=>p.trim()).filter(Boolean);
  if(parts.length > 1){
    const idx = parts.findIndex(p=>parseCoordPair(p));
    if(idx >= 0){
      const coords = parseCoordPair(parts[idx]);
      const label = parts.filter((_,i)=>i!==idx).join(' ');
      return { label, coords };
    }
  }
  const coords = parseCoordPair(clean);
  if(!coords) return null;
  let label = '';
  const firstDigit = clean.search(/-?\d/);
  if(firstDigit > 0 && /[a-zA-Z]/.test(clean.slice(0, firstDigit))){
    label = clean.slice(0, firstDigit).replace(/[,;]/g,'').trim();
  }
  return { label, coords };
}

function getEnvioQuote(cfg, km){
  const zones = (cfg.zones || []).map((z,i)=>({
    name: z.name || `Zona ${i+1}`,
    min: Number(z.min)||0,
    max: Number(z.max)||0,
    price: Number(z.price)||0
  }));
  const sorted = zones.slice().sort((a,b)=>a.max-b.max);
  let match = sorted.find(z=> km >= z.min && km <= z.max);
  if(!match) match = sorted.find(z=> km <= z.max);
  const maxZone = Math.max(...zones.map(z=>z.max), 0);
  const specialKm = Math.max(Number(cfg.extra?.km || 0), maxZone);
  if(match){
    return {
      zoneName: match.name,
      range: `${match.min}-${match.max} km`,
      price: match.price,
      priceText: fmt(match.price),
      label: `${match.name} (${match.min}-${match.max} km)`,
      special: false
    };
  }
  const specialPrice = Number(cfg.extra?.price || 0);
  return {
    zoneName: `+${specialKm} km`,
    range: `>${maxZone} km`,
    price: specialPrice,
    priceText: specialPrice > 0 ? fmt(specialPrice) : 'Cotizacion especial',
    label: `Especial +${specialKm} km`,
    special: true
  };
}

async function getRutaKm(origin, dest){
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=false&alternatives=false&steps=false`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('No se pudo calcular la ruta');
  const data = await res.json();
  const dist = data?.routes?.[0]?.distance;
  if(!Number.isFinite(dist)) throw new Error('Ruta no disponible');
  return dist / 1000;
}

async function cotizarEnvioRapido(){
  const input = document.getElementById('envio-quick-input');
  const distEl = document.getElementById('envio-quick-dist');
  const zoneEl = document.getElementById('envio-quick-zone');
  const priceEl = document.getElementById('envio-quick-price');
  const noteEl = document.getElementById('envio-quick-note');
  if(!input || !distEl || !zoneEl || !priceEl || !noteEl) return;
  const coords = parseCoordPair(input.value || '');
  if(!coords){
    distEl.textContent = '';
    zoneEl.textContent = '';
    priceEl.textContent = '';
    noteEl.textContent = 'Coordenadas invalidas.';
    toast('Coordenadas invalidas', 'err');
    return;
  }
  distEl.textContent = '';
  zoneEl.textContent = '';
  priceEl.textContent = '';
  noteEl.textContent = 'Calculando ruta...';
  const cfg = readEnvioConfigFromUI();
  try{
    const km = await getRutaKm(cfg.origin, coords);
    const quote = getEnvioQuote(cfg, km);
    distEl.textContent = `${km.toFixed(2)} km`;
    zoneEl.textContent = quote.label;
    priceEl.textContent = quote.priceText;
    noteEl.textContent = quote.special ? 'Fuera de rango. Requiere cotizacion especial.' : '';
  }catch(e){
    noteEl.textContent = e?.message || 'No se pudo calcular la ruta.';
    toast('No se pudo calcular la ruta', 'err');
  }
}

function limpiarEnvioRapido(){
  const input = document.getElementById('envio-quick-input');
  const distEl = document.getElementById('envio-quick-dist');
  const zoneEl = document.getElementById('envio-quick-zone');
  const priceEl = document.getElementById('envio-quick-price');
  const noteEl = document.getElementById('envio-quick-note');
  if(input) input.value = '';
  if(distEl) distEl.textContent = '';
  if(zoneEl) zoneEl.textContent = '';
  if(priceEl) priceEl.textContent = '';
  if(noteEl) noteEl.textContent = '';
}

async function cotizarEnviosLista(){
  const input = document.getElementById('envio-bulk-input');
  const out = document.getElementById('envio-bulk-output');
  if(!input || !out) return;
  const lines = (input.value || '').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length === 0){
    toast('Pega al menos una linea', 'warn');
    return;
  }
  const cfg = readEnvioConfigFromUI();
  const results = [];
  for(let i=0; i<lines.length; i++){
    out.innerHTML = `<div class="muted">Calculando ${i+1}/${lines.length} rutas...</div>`;
    const parsed = parseEnvioLine(lines[i]);
    if(!parsed){
      results.push({ idx:i+1, label: lines[i], error:'Coordenadas invalidas' });
      continue;
    }
    try{
      const km = await getRutaKm(cfg.origin, parsed.coords);
      const quote = getEnvioQuote(cfg, km);
      results.push({ idx:i+1, label: parsed.label, coords: parsed.coords, km, quote });
    }catch(e){
      results.push({ idx:i+1, label: parsed.label, coords: parsed.coords, error: e?.message || 'Ruta no disponible' });
    }
  }
  renderEnvioBulkResults(results);
}

function renderEnvioBulkResults(results){
  const out = document.getElementById('envio-bulk-output');
  if(!out) return;
  const rows = (results || []).map(r=>{
    if(r.error){
      return `<tr>
        <td>${r.idx}</td>
        <td>${escapeHtml(r.label || '-')}</td>
        <td class="muted">-</td>
        <td class="right">-</td>
        <td class="muted">-</td>
        <td class="right">-</td>
        <td class="muted">${escapeHtml(r.error)}</td>
      </tr>`;
    }
    const coordText = `${r.coords.lat.toFixed(6)}, ${r.coords.lon.toFixed(6)}`;
    return `<tr>
      <td>${r.idx}</td>
      <td>${escapeHtml(r.label || '-')}</td>
      <td>${escapeHtml(coordText)}</td>
      <td class="right">${r.km.toFixed(2)}</td>
      <td>${escapeHtml(r.quote.label)}</td>
      <td class="right">${escapeHtml(r.quote.priceText)}</td>
      <td>${r.quote.special ? 'Especial' : 'OK'}</td>
    </tr>`;
  }).join('');
  out.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Cliente/ID</th><th>Coordenadas</th><th class="right">Km</th><th>Zona</th><th class="right">Precio</th><th>Estatus</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">Sin resultados</td></tr>`}</tbody>
    </table>
  `;
}

function limpiarEnvioLista(){
  const input = document.getElementById('envio-bulk-input');
  const out = document.getElementById('envio-bulk-output');
  if(input) input.value = '';
  if(out) out.innerHTML = '';
}

function cargarEjemploEnvio(){
  const input = document.getElementById('envio-bulk-input');
  if(!input) return;
  input.value = [
    'Pedido 101 | 19.050842, -98.279210',
    'Cliente Rosa | 19.039850, -98.286730',
    '19.064220, -98.263100'
  ].join('\n');
}

/*******************************
 * COTIZADOR / COSTEO
 *******************************/
let CT = { editingMatId:null, editingRecId:null, editingIngId:null, editingIndirectId:null, receta:{ producto:'', rinde:1, precio:0, items:[], indirectos:[] } };
function ensureIndirectos(receta){
  if(!receta) return;
  if(!Array.isArray(receta.indirectos)) receta.indirectos = [];
}
function defaultAbcConfig(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = ymd(start);
  const to = hoyISO();
  return {
    enabled: true,
    from,
    to,
    categories: ['Nómina','Renta','Servicios','Mantenimiento','Varios'],
    productiveMinutes: calculateAbcProductiveMinutes(from, to),
    recipeMinutes: 0
  };
}
function getAbcSchedule(){
  normalizeAbcSchedule();
  return DB.config.abcSchedule;
}
function clockMinutes(value){
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}
function abcScheduleLabel(){
  const schedule = getAbcSchedule();
  const days = ABC_DAYS.filter(day=>schedule.days.includes(day.value)).map(day=>day.label).join(", ");
  return `${days || "Sin días"} · ${schedule.start}-${schedule.end}`;
}
function renderAbcScheduleConfig(){
  const schedule = getAbcSchedule();
  const wrap = document.getElementById('cfg-abc-days');
  if(wrap){
    wrap.innerHTML = ABC_DAYS.map(day=>`<label class="tag" style="cursor:pointer"><input type="checkbox" value="${day.value}" ${schedule.days.includes(day.value)?'checked':''}> ${day.label}</label>`).join('');
  }
  const start = document.getElementById('cfg-abc-start'); if(start) start.value = schedule.start;
  const end = document.getElementById('cfg-abc-end'); if(end) end.value = schedule.end;
  const help = document.getElementById('ct-abc-horario-help'); if(help) help.textContent = `Horario usado: ${abcScheduleLabel()}.`;
}
function readAbcScheduleFromUI(){
  const selected = Array.from(document.querySelectorAll('#cfg-abc-days input[type="checkbox"]:checked')).map(input=>Number(input.value));
  const next = {
    days: selected,
    start: document.getElementById('cfg-abc-start')?.value || ABC_SCHEDULE_DEFAULT.start,
    end: document.getElementById('cfg-abc-end')?.value || ABC_SCHEDULE_DEFAULT.end
  };
  DB.config.abcSchedule = next;
  normalizeAbcSchedule();
  return DB.config.abcSchedule;
}
function countAbcProductiveDays(from, to){
  const start = parseISODate(from);
  const end = parseISODate(to);
  if(!start || !end || start > end) return 0;
  const schedule = getAbcSchedule();
  let days = 0;
  const curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while(curr <= limit){
    const dow = curr.getDay();
    if(schedule.days.includes(dow)) days++;
    curr.setDate(curr.getDate()+1);
  }
  return days;
}
function calculateAbcProductiveMinutes(from, to){
  const schedule = getAbcSchedule();
  const minutesPerDay = Math.max(0, clockMinutes(schedule.end) - clockMinutes(schedule.start));
  return countAbcProductiveDays(from, to) * minutesPerDay;
}
function updateAbcProductiveMinutes(){
  const from = document.getElementById('ct-abc-desde')?.value || defaultAbcConfig().from;
  const to = document.getElementById('ct-abc-hasta')?.value || defaultAbcConfig().to;
  const minutes = calculateAbcProductiveMinutes(from, to);
  const el = document.getElementById('ct-abc-min-prod');
  if(el) el.value = minutes || '';
  if(CT.receta){
    ensureAbc(CT.receta);
    CT.receta.abc.productiveMinutes = minutes;
  }
  return minutes;
}
function ensureAbc(receta){
  if(!receta) return;
  if(!receta.abc || typeof receta.abc !== 'object') receta.abc = defaultAbcConfig();
  if(!Array.isArray(receta.abc.categories)) receta.abc.categories = defaultAbcConfig().categories;
  if(!Number(receta.abc.productiveMinutes)){
    receta.abc.productiveMinutes = calculateAbcProductiveMinutes(receta.abc.from || defaultAbcConfig().from, receta.abc.to || defaultAbcConfig().to);
  }
}
function resetCostoIndirectoForm(){
  const conc = document.getElementById('ct-ci-conc'); if(conc) conc.value = '';
  const monto = document.getElementById('ct-ci-monto'); if(monto) monto.value = '';
  CT.editingIndirectId = null;
  const btn = document.getElementById('ct-ci-add-btn'); if(btn) btn.textContent = 'Agregar costo';
}
function calcCostoReceta(receta){
  ensureAbc(receta);
  const mats = new Map((DB.costeo.materiales||[]).map(m=>[m.id,m]));
  let totalPz=0, totalGr=0;
  (receta.items||[]).forEach(it=>{
    const m = mats.get(it.matId)||{};
    const unit = (m.unidad||'').toLowerCase();
    const cost = Number(m.costoUnit||0) * Number(it.cant||0);
    if(unit==='pieza') totalPz += cost; else totalGr += cost;
  });
  const indirectos = sum((receta.indirectos||[]), x=> Number(x.monto||0));
  const abc = window.FinanceCore ? FinanceCore.calculateAbcCost(DB, {
    from: receta.abc.from,
    to: receta.abc.to,
    categories: receta.abc.categories,
    productiveMinutes: receta.abc.productiveMinutes,
    recipeMinutes: receta.abc.recipeMinutes
  }) : { expensesTotal:0, costPerMinute:0, recipeMinutes:0, recipeCost:0 };
  const insumos = totalPz + totalGr;
  const costo = insumos + indirectos + Number(abc.recipeCost||0);
  return { totalPz, totalGr, insumos, indirectos, abc, costo };
}
function renderSelectMateriales(){
  const sel = document.getElementById('ct-r-mat');
  if(sel){
    sel.replaceChildren(new Option('— Selecciona —', ''));
    (DB.costeo.materiales||[]).forEach(material=>sel.add(new Option(String(material.nombre || ''), String(material.id || ''))));
  }
  syncIngredienteUnidad();
}
function renderAbcCats(){
  const wrap = document.getElementById('ct-abc-cats'); if(!wrap) return;
  ensureAbc(CT.receta);
  const selected = new Set(CT.receta.abc.categories || []);
  wrap.innerHTML = GASTO_CATS.map(cat=>`
    <label class="tag" style="cursor:pointer">
      <input type="checkbox" value="${escapeHtml(cat)}" ${selected.has(cat)?'checked':''} onchange="recalcReceta()">
      ${escapeHtml(cat)}
    </label>
  `).join('');
}
function readAbcForm(){
  ensureAbc(CT.receta);
  const cats = Array.from(document.querySelectorAll('#ct-abc-cats input[type="checkbox"]:checked')).map(el=>el.value);
  CT.receta.abc = {
    enabled: true,
    from: document.getElementById('ct-abc-desde')?.value || defaultAbcConfig().from,
    to: document.getElementById('ct-abc-hasta')?.value || defaultAbcConfig().to,
    categories: cats,
    productiveMinutes: Number(document.getElementById('ct-abc-min-prod')?.value || calculateAbcProductiveMinutes(document.getElementById('ct-abc-desde')?.value || defaultAbcConfig().from, document.getElementById('ct-abc-hasta')?.value || defaultAbcConfig().to)),
    recipeMinutes: Number(document.getElementById('ct-abc-min-receta')?.value || 0)
  };
  return CT.receta.abc;
}
function syncAbcForm(){
  ensureAbc(CT.receta);
  const abc = CT.receta.abc;
  const setVal = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = v ?? ''; };
  setVal('ct-abc-desde', abc.from || defaultAbcConfig().from);
  setVal('ct-abc-hasta', abc.to || defaultAbcConfig().to);
  const productiveMinutes = abc.productiveMinutes || calculateAbcProductiveMinutes(abc.from || defaultAbcConfig().from, abc.to || defaultAbcConfig().to);
  abc.productiveMinutes = productiveMinutes;
  setVal('ct-abc-min-prod', productiveMinutes || '');
  setVal('ct-abc-min-receta', abc.recipeMinutes || '');
  renderAbcCats();
}
function isPesoUnit(unidad){
  const u = (unidad||'').toLowerCase();
  return u==='gramo' || u==='kilogramo';
}
function isVolumenUnit(unidad){
  const u = (unidad||'').toLowerCase();
  return u==='mililitro' || u==='litro';
}
function inputUnitOptions(unidad){
  const u = (unidad||'').toLowerCase();
  if(isPesoUnit(u)) return [{value:'gramo', label:'g'}, {value:'kilogramo', label:'kg'}];
  if(isVolumenUnit(u)) return [{value:'mililitro', label:'ml'}, {value:'litro', label:'L'}];
  return [{value:'pieza', label:'pza'}];
}
function defaultInputUnit(unidad){
  const u = (unidad||'').toLowerCase();
  if(u==='kilogramo') return 'kilogramo';
  if(u==='gramo') return 'gramo';
  if(u==='litro') return 'litro';
  if(u==='mililitro') return 'mililitro';
  return 'pieza';
}
function toBaseAmount(value, fromUnit){
  const n = Number(value||0);
  const u = (fromUnit||'').toLowerCase();
  if(u==='kilogramo' || u==='litro') return n * 1000;
  return n;
}
function fromBaseAmount(value, toUnit){
  const n = Number(value||0);
  const u = (toUnit||'').toLowerCase();
  if(u==='kilogramo' || u==='litro') return n / 1000;
  return n;
}
function baseUnitLabel(unidad){
  const u = (unidad||'').toLowerCase();
  if(isPesoUnit(u)) return 'g';
  if(isVolumenUnit(u)) return 'ml';
  return 'pza';
}
function fillUnitSelect(selectId, unidad, selected){
  const sel = document.getElementById(selectId); if(!sel) return;
  const opts = inputUnitOptions(unidad);
  const chosen = selected || defaultInputUnit(unidad);
  sel.innerHTML = opts.map(o=>`<option value="${o.value}" ${o.value===chosen?'selected':''}>${o.label}</option>`).join('');
}
function syncMaterialContenidoUnidad(){
  const unidad = document.getElementById('ct-mt-unidad')?.value || 'pieza';
  fillUnitSelect('ct-mt-contenido-und', unidad);
}
function syncIngredienteUnidad(selected){
  const matId = document.getElementById('ct-r-mat')?.value || '';
  const m = (DB.costeo.materiales||[]).find(x=>x.id===matId);
  fillUnitSelect('ct-r-cant-und', m?.unidad || 'pieza', selected);
}
function displayAmount(value, unit){
  const n = Number(value||0);
  if(!Number.isFinite(n)) return '';
  const text = Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString();
  if(unit) return `${text} ${unit}`;
  return text;
}
function computeCostoUnit(unidad, contenido, costo){
  if(contenido<=0 || costo<=0) return 0;
  let per = 0;
  switch((unidad||'').toLowerCase()){
    case 'pieza': per = costo / contenido; break;
    case 'gramo':
    case 'kilogramo':
    case 'mililitro':
    case 'litro':
      per = costo / contenido;
      break;
    default: per = costo / contenido; break;
  }
  return Number(per.toFixed(6));
}
function guardarMaterial(){
  const nombre = (document.getElementById('ct-mt-nombre').value||'').trim();
  const unidad = document.getElementById('ct-mt-unidad').value||'pieza';
  const contenidoInput = Number(document.getElementById('ct-mt-contenido').value||0);
  const contenidoUnidad = document.getElementById('ct-mt-contenido-und')?.value || defaultInputUnit(unidad);
  const contenido = toBaseAmount(contenidoInput, contenidoUnidad);
  const costo = Number(document.getElementById('ct-mt-costo').value||0);
  if(!nombre || !unidad || contenido<=0 || costo<=0){ toast('Faltan datos para calcular costo por unidad', 'err'); return; }
  const costoUnit = computeCostoUnit(unidad, contenido, costo);
  const matData = { nombre, unidad, contenido, contenidoUnidad: baseUnitLabel(unidad), costo, costoUnit };
  if(CT.editingMatId){
    const idx = DB.costeo.materiales.findIndex(x=>x.id===CT.editingMatId);
    if(idx>-1) DB.costeo.materiales[idx] = { ...DB.costeo.materiales[idx], ...matData };
    CT.editingMatId = null; toast('Material actualizado');
  }else{
    DB.costeo.materiales.push({ id:id_uniq(), ...matData }); toast('Material guardado');
  }
  saveDB(); renderMateriales(); renderSelectMateriales(); limpiarMaterial(); recalcReceta();
}
function limpiarMaterial(){ ['ct-mt-nombre','ct-mt-contenido','ct-mt-costo'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); document.getElementById('ct-mt-unidad').value='pieza'; syncMaterialContenidoUnidad(); CT.editingMatId=null; }
function editarMaterial(id){ const m = DB.costeo.materiales.find(x=>x.id===id); if(!m) return; CT.editingMatId=id; document.getElementById('ct-mt-nombre').value=m.nombre; document.getElementById('ct-mt-unidad').value=m.unidad; syncMaterialContenidoUnidad(); const inputUnit = defaultInputUnit(m.unidad); fillUnitSelect('ct-mt-contenido-und', m.unidad, inputUnit); document.getElementById('ct-mt-contenido').value=fromBaseAmount(m.contenido, inputUnit); document.getElementById('ct-mt-costo').value=m.costo; }
function eliminarMaterial(id){ if(!confirm('¿Eliminar material?')) return; DB.costeo.materiales = DB.costeo.materiales.filter(x=>x.id!==id); saveDB(); renderMateriales(); renderSelectMateriales(); recalcReceta(); }
function renderMateriales(){
  const tb = document.querySelector('#tabla-materiales tbody'); if(!tb) return;
  const q = (document.getElementById('ct-mt-q')?.value||'').toLowerCase();
  const u = (document.getElementById('ct-mt-q-unit')?.value||'');
  const arr = (DB.costeo.materiales||[]).filter(m=>{
    const okQ = !q || (m.nombre||'').toLowerCase().includes(q) || (m.unidad||'').toLowerCase().includes(q);
    const okU = !u || (m.unidad||'')===u;
    return okQ && okU;
  });
  tb.innerHTML = arr.map(m=>`<tr>
    <td>${escapeHtml(m.nombre)}</td>
    <td>${escapeHtml(m.unidad)}</td>
    <td>${escapeHtml(displayAmount(m.contenido, baseUnitLabel(m.unidad)))}</td>
    <td class="right">${m.costo? fmt(m.costo):''}</td>
    <td class="right">${m.costoUnit? fmt(m.costoUnit):''}</td>
    <td><button class="btn alt" data-id="${dataAttr(m.id)}" onclick="editarMaterial(decodeURIComponent(this.dataset.id))">Editar</button> <button class="btn ghost" data-id="${dataAttr(m.id)}" onclick="eliminarMaterial(decodeURIComponent(this.dataset.id))">Eliminar</button></td>
  </tr>`).join('') || `<tr><td colspan="6" class="muted">Sin materiales</td></tr>`;
}
function nuevaReceta(){
  CT.editingRecId=null;
  CT.receta={ producto:'', rinde:1, precio:0, items:[], indirectos:[], abc: defaultAbcConfig() };
  document.getElementById('ct-r-nombre').value='';
  document.getElementById('ct-r-rinde').value=1;
  document.getElementById('ct-r-precio').value='';
  renderRecetaItems();
  renderIndirectos();
  syncAbcForm();
  resetCostoIndirectoForm();
  recalcReceta();
}
function addIngredienteReceta(){
  const matId = document.getElementById('ct-r-mat').value;
  const cantInput = Number(document.getElementById('ct-r-cant').value||0);
  const cantUnidad = document.getElementById('ct-r-cant-und')?.value || 'pieza';
  const cant = toBaseAmount(cantInput, cantUnidad);
  if(!matId || cant<=0){ toast('Selecciona material y cantidad válida','err'); return; }
  if(CT.editingIngId){
    const idx = CT.receta.items.findIndex(x=>x.id===CT.editingIngId);
    if(idx>-1){ CT.receta.items[idx] = { ...CT.receta.items[idx], matId, cant, cantUnidad: baseUnitLabel(cantUnidad) }; }
    CT.editingIngId = null; document.getElementById('ct-r-add-btn').textContent='Agregar ingrediente';
  }else{
    CT.receta.items.push({ id:id_uniq(), matId, cant, cantUnidad: baseUnitLabel(cantUnidad) });
  }
  document.getElementById('ct-r-cant').value='';
  renderRecetaItems(); recalcReceta();
}
function removeIngrediente(id){ CT.receta.items = CT.receta.items.filter(x=>x.id!==id); renderRecetaItems(); recalcReceta(); }
function ingUnidadBase(und){ const u=(und||'').toLowerCase(); return u==='pieza'?'pieza': (u==='gramo'||u==='kilogramo'?'gr':'ml'); }
function renderRecetaItems(){
  const tb = document.querySelector('#tabla-receta-it tbody'); if(!tb) return;
  const mats = new Map((DB.costeo.materiales||[]).map(m=>[m.id,m]));
  tb.innerHTML = (CT.receta.items||[]).map(it=>{ const m=mats.get(it.matId)||{}; const cost= (m.costoUnit||0) * (it.cant||0); return `<tr>
    <td>${escapeHtml(m.nombre||'—')}</td>
    <td>${escapeHtml(displayAmount(it.cant, baseUnitLabel(m.unidad)))}</td>
    <td>${escapeHtml(baseUnitLabel(m.unidad))}</td>
    <td class="right">${m.costoUnit? fmt(m.costoUnit):''}</td>
    <td class="right">${cost? fmt(cost):''}</td>
    <td>
      <button class="btn alt" data-id="${dataAttr(it.id)}" onclick="editarIngrediente(decodeURIComponent(this.dataset.id))">Editar</button>
      <button class="btn primary" data-id="${dataAttr(it.id)}" onclick="duplicarIngrediente(decodeURIComponent(this.dataset.id))">Duplicar</button>
      <button class="btn ghost" data-id="${dataAttr(it.id)}" onclick="removeIngrediente(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`; }).join('') || `<tr><td colspan="6" class="muted">Sin ingredientes</td></tr>`;
}
function editarIngrediente(id){ const it=(CT.receta.items||[]).find(x=>x.id===id); if(!it) return; CT.editingIngId=id; document.getElementById('ct-r-mat').value=it.matId; const m=(DB.costeo.materiales||[]).find(x=>x.id===it.matId); const editUnit = isPesoUnit(m?.unidad) ? 'gramo' : (isVolumenUnit(m?.unidad) ? 'mililitro' : 'pieza'); syncIngredienteUnidad(editUnit); document.getElementById('ct-r-cant').value=fromBaseAmount(it.cant, editUnit); document.getElementById('ct-r-add-btn').textContent='Actualizar ingrediente'; }
function duplicarIngrediente(id){ const it=(CT.receta.items||[]).find(x=>x.id===id); if(!it) return; const copy={...it,id:id_uniq()}; CT.receta.items.push(copy); renderRecetaItems(); recalcReceta(); }
function addCostoIndirecto(){
  const concEl = document.getElementById('ct-ci-conc');
  const montoEl = document.getElementById('ct-ci-monto');
  const concepto = (concEl?.value||'').trim();
  const monto = Number(montoEl?.value||0);
  if(!concepto || !Number.isFinite(monto) || monto<=0){
    toast('Captura concepto y monto valido', 'err');
    return;
  }
  ensureIndirectos(CT.receta);
  if(CT.editingIndirectId){
    const idx = CT.receta.indirectos.findIndex(x=>x.id===CT.editingIndirectId);
    if(idx>-1){
      CT.receta.indirectos[idx] = { ...CT.receta.indirectos[idx], concepto, monto };
    }
    CT.editingIndirectId = null;
  }else{
    CT.receta.indirectos.push({ id:id_uniq(), concepto, monto });
  }
  if(concEl) concEl.value = '';
  if(montoEl) montoEl.value = '';
  const btn = document.getElementById('ct-ci-add-btn'); if(btn) btn.textContent = 'Agregar costo';
  renderIndirectos();
  recalcReceta();
}
function renderIndirectos(){
  const tb = document.querySelector('#ct-indirectos tbody'); if(!tb) return;
  ensureIndirectos(CT.receta);
  tb.innerHTML = (CT.receta.indirectos||[]).map(ci=>`<tr>
    <td>${escapeHtml(ci.concepto||'')}</td>
    <td class="right">${ci.monto? fmt(ci.monto):''}</td>
    <td>
      <button class="btn alt" data-id="${dataAttr(ci.id)}" onclick="editarCostoIndirecto(decodeURIComponent(this.dataset.id))">Editar</button>
      <button class="btn ghost" data-id="${dataAttr(ci.id)}" onclick="eliminarCostoIndirecto(decodeURIComponent(this.dataset.id))">Eliminar</button>
    </td>
  </tr>`).join('') || `<tr><td colspan="3" class="muted">Sin costos indirectos</td></tr>`;
}
function editarCostoIndirecto(id){
  ensureIndirectos(CT.receta);
  const it = (CT.receta.indirectos||[]).find(x=>x.id===id); if(!it) return;
  CT.editingIndirectId = id;
  const concEl = document.getElementById('ct-ci-conc'); if(concEl) concEl.value = it.concepto || '';
  const montoEl = document.getElementById('ct-ci-monto'); if(montoEl) montoEl.value = it.monto || '';
  const btn = document.getElementById('ct-ci-add-btn'); if(btn) btn.textContent = 'Actualizar costo';
}
function eliminarCostoIndirecto(id){
  if(!confirm('¿Eliminar costo indirecto?')) return;
  ensureIndirectos(CT.receta);
  CT.receta.indirectos = (CT.receta.indirectos||[]).filter(x=>x.id!==id);
  if(CT.editingIndirectId === id) resetCostoIndirectoForm();
  renderIndirectos();
  recalcReceta();
}
function recalcReceta(){
  const nombre = (document.getElementById('ct-r-nombre')?.value||'').trim();
  const rinde = Number(document.getElementById('ct-r-rinde')?.value||1);
  const precio = Number(document.getElementById('ct-r-precio')?.value||0);
  const uv = (document.getElementById('ct-r-uv')?.value||'').trim();
  CT.receta.producto = nombre; CT.receta.rinde=rinde; CT.receta.precio=precio; CT.receta.uv = uv;
  ensureIndirectos(CT.receta);
  readAbcForm();
  const detail = calcCostoReceta(CT.receta);
  const totalPz = detail.totalPz;
  const totalGr = detail.totalGr;
  const indirectos = detail.indirectos;
  const abcCost = Number(detail.abc?.recipeCost || 0);
  const costo = detail.costo;
  const costoUnit = (rinde>0) ? (costo/rinde) : 0;
  const margenNeto = (precio>0 && costoUnit>0) ? (precio - costoUnit) : 0;
  const costoMarg = (precio>0 && costoUnit>0) ? (costoUnit/precio)*100 : 0;

  const $ = (n)=> (n>0 ? fmt(n) : '');
  const pct = (n)=> (n>0 ? (Number(n).toFixed(2)+'%') : '');
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('ct-tot-pz', $(totalPz));
  set('ct-tot-gr', $(totalGr));
  set('ct-ci-total', $(indirectos));
  set('ct-abc-gastos', $(detail.abc?.expensesTotal || 0));
  set('ct-abc-costo-min', detail.abc?.costPerMinute ? `${fmt(detail.abc.costPerMinute)} / min` : '');
  set('ct-abc-min-out', detail.abc?.recipeMinutes ? `${detail.abc.recipeMinutes} min` : '');
  set('ct-abc-costo', $(abcCost));
  set('ct-r-costo', $(costo));
  set('ct-r-costo-unit', $(costoUnit));
  set('ct-r-precio-out', $(precio));
  set('ct-r-margen-neto', $(margenNeto));
  set('ct-r-costo-marg', costoMarg>0? (costoMarg.toFixed(2)+'%') : '');

  // Dona distribución
  const sumAll = totalPz + totalGr + indirectos + abcCost;
  const cont = document.getElementById('ct-ch-distrib');
  if(cont){
    const chartSection = cont.closest('.subsection');
    if(sumAll<=0){ chartSection?.classList.add('hidden'); }
    else{
      chartSection?.classList.remove('hidden');
      drawChartDoughnut('ct-ch-distrib', ['Piezas','Gr/ML','Indirectos','ABC tiempo'], [totalPz,totalGr,indirectos,abcCost], ()=>{});
    }
  }
}
['ct-r-nombre','ct-r-rinde','ct-r-uv','ct-r-precio'].forEach(id=> document.getElementById(id)?.addEventListener('input', recalcReceta));
function guardarReceta(){
  const r = CT.receta; if(!r.producto || (r.items||[]).length===0){ alert('Captura producto e ingredientes'); return; }
  ensureIndirectos(r);
  readAbcForm();
  const detail = calcCostoReceta(r);
  const costo = detail.costo;
  if(CT.editingRecId){
    const idx = DB.costeo.recetas.findIndex(x=>x.id===CT.editingRecId);
    if(idx>-1) DB.costeo.recetas[idx] = { ...DB.costeo.recetas[idx], producto:r.producto, rinde:r.rinde, uv:r.uv||'', precio:r.precio, costo, abc: JSON.parse(JSON.stringify(r.abc||defaultAbcConfig())), indirectos: JSON.parse(JSON.stringify(r.indirectos||[])), items: JSON.parse(JSON.stringify(r.items||[])), alergias: (document.getElementById('ct-r-alergias')?.value||''), prep:(document.getElementById('ct-r-prep')?.value||''), prepPuesto:(document.getElementById('ct-r-prep-puesto')?.value||''), apr:(document.getElementById('ct-r-apr')?.value||''), aprPuesto:(document.getElementById('ct-r-apr-puesto')?.value||'') };
    CT.editingRecId=null; toast('Receta actualizada');
  }else{
    DB.costeo.recetas.push({ id:id_uniq(), producto:r.producto, rinde:r.rinde, uv:r.uv||'', precio:r.precio, costo, abc: JSON.parse(JSON.stringify(r.abc||defaultAbcConfig())), indirectos: JSON.parse(JSON.stringify(r.indirectos||[])), items: JSON.parse(JSON.stringify(r.items||[])), alergias:(document.getElementById('ct-r-alergias')?.value||''), prep:(document.getElementById('ct-r-prep')?.value||''), prepPuesto:(document.getElementById('ct-r-prep-puesto')?.value||''), apr:(document.getElementById('ct-r-apr')?.value||''), aprPuesto:(document.getElementById('ct-r-apr-puesto')?.value||'') }); toast('Receta guardada');
  }
  saveDB(); renderRecetasList(); nuevaReceta();
}
function renderRecetasList(){
  const tb = document.querySelector('#tabla-recetas tbody'); if(!tb) return;
  tb.innerHTML = (DB.costeo.recetas||[]).map(rc=>{
    const detail = calcCostoReceta(rc);
    const costo = detail.costo;
    const margen = rc.precio>0? Math.round((1 - (costo/(rc.precio||1))) * 100) : 0;
    return `<tr>
      <td>${escapeHtml(rc.producto)}</td>
      <td class="right">${fmt(costo)}</td>
      <td class="right">${fmt(rc.precio||0)}</td>
      <td class="right">${margen}%</td>
      <td>
        <button class="btn alt" data-id="${dataAttr(rc.id)}" onclick="cargarReceta(decodeURIComponent(this.dataset.id))">Editar</button>
        <button class="btn primary" data-id="${dataAttr(rc.id)}" onclick="duplicarReceta(decodeURIComponent(this.dataset.id))">Duplicar</button>
        <button class="btn ghost" data-id="${dataAttr(rc.id)}" onclick="eliminarReceta(decodeURIComponent(this.dataset.id))">Eliminar</button>
        <button class="btn ghost" data-id="${dataAttr(rc.id)}" onclick="exportarJSONReceta(decodeURIComponent(this.dataset.id))">Exportar</button>
        <button class="btn ghost" data-id="${dataAttr(rc.id)}" onclick="exportarPDFReceta(decodeURIComponent(this.dataset.id))">PDF</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">Sin recetas</td></tr>`;
}
function cargarReceta(id){
  const rc = DB.costeo.recetas.find(x=>x.id===id); if(!rc) return;
  CT.editingRecId=id;
  document.getElementById('ct-r-nombre').value=rc.producto||'';
  document.getElementById('ct-r-rinde').value=rc.rinde||1;
  document.getElementById('ct-r-precio').value=rc.precio||0;
  document.getElementById('ct-r-uv').value=rc.uv||'';
  document.getElementById('ct-r-alergias').value=rc.alergias||'';
  document.getElementById('ct-r-prep').value=rc.prep||'';
  document.getElementById('ct-r-prep-puesto').value=rc.prepPuesto||'';
  document.getElementById('ct-r-apr').value=rc.apr||'';
  document.getElementById('ct-r-apr-puesto').value=rc.aprPuesto||'';
  CT.receta={ producto:rc.producto, rinde:rc.rinde||1, precio:rc.precio||0, uv:rc.uv||'', abc: JSON.parse(JSON.stringify(rc.abc||defaultAbcConfig())), items: JSON.parse(JSON.stringify(rc.items||[])), indirectos: JSON.parse(JSON.stringify(rc.indirectos||[])) };
  ensureIndirectos(CT.receta);
  ensureAbc(CT.receta);
  resetCostoIndirectoForm();
  renderRecetaItems();
  renderIndirectos();
  syncAbcForm();
  recalcReceta();
  toast('Receta cargada');
}
function duplicarReceta(id){ const rc = DB.costeo.recetas.find(x=>x.id===id); if(!rc) return; const copy = { ...rc, id:id_uniq(), producto: rc.producto + ' (copia)' }; DB.costeo.recetas.unshift(copy); saveDB(); renderRecetasList(); toast('Receta duplicada'); }
function eliminarReceta(id){ if(!confirm('¿Eliminar receta?')) return; DB.costeo.recetas = DB.costeo.recetas.filter(x=>x.id!==id); saveDB(); renderRecetasList(); toast('Receta eliminada'); }
function exportarJSONReceta(id){
  const rc = DB.costeo.recetas.find(x=>x.id===id); if(!rc) return;
  const slug = (rc.producto||'receta').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const filename = `receta_${slug||'sin_nombre'}_${hoyISO()}.json`;
  const blob = new Blob([JSON.stringify(rc,null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function importarJSONReceta(){
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
  inp.onchange = () => {
    const f = inp.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => { try{
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : (Array.isArray(data.recetas) ? data.recetas : [data]);
      let added = 0;
      list.forEach(raw=>{
        if(!raw || !raw.producto) return;
        const rec = { ...raw };
        rec.id = id_uniq();
        rec.items = Array.isArray(rec.items) ? rec.items : [];
        rec.indirectos = Array.isArray(rec.indirectos) ? rec.indirectos : [];
        rec.rinde = Number(rec.rinde||1);
        rec.precio = Number(rec.precio||0);
        DB.costeo.recetas.push(rec);
        added++;
      });
      if(added){
        saveDB(); renderRecetasList(); toast(`Receta${added>1?'s':''} importada${added>1?'s':''}`);
      }else{
        alert("JSON sin recetas validas");
      }
    }catch(e){ alert("JSON inválido"); } };
    reader.readAsText(f);
  };
  inp.click();
}
function exportarPDFReceta(id){
  const rc = DB.costeo.recetas.find(x=>x.id===id); if(!rc) return;
  const detail = calcCostoReceta(rc);
  const rinde = Number(rc.rinde||1);
  const precio = Number(rc.precio||0);
  const costoUnit = (rinde>0) ? (detail.costo/rinde) : 0;
  const margenNeto = (precio>0 && costoUnit>0) ? (precio - costoUnit) : 0;
  const margenPct = (precio>0 && costoUnit>0) ? ((1 - (costoUnit/precio)) * 100) : 0;
  const mats = new Map((DB.costeo.materiales||[]).map(m=>[m.id,m]));
  const itemsRows = (rc.items||[]).map(it=>{
    const m = mats.get(it.matId)||{};
    const costUnit = Number(m.costoUnit||0);
    const cost = costUnit * Number(it.cant||0);
    return `<tr>
      <td>${escapeHtml(m.nombre||'—')}</td>
      <td>${escapeHtml(it.cant)}</td>
      <td>${escapeHtml(m.unidad||'')}</td>
      <td class="right">${escapeHtml(costUnit? fmt(costUnit):'')}</td>
      <td class="right">${escapeHtml(cost? fmt(cost):'')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">Sin insumos</td></tr>`;
  const indirectosRows = (rc.indirectos||[]).map(ci=>`<tr>
    <td>${escapeHtml(ci.concepto||'')}</td>
    <td class="right">${escapeHtml(ci.monto? fmt(ci.monto):'')}</td>
  </tr>`).join('') || `<tr><td colspan="2" class="muted">Sin costos indirectos</td></tr>`;
  const abc = detail.abc || {};
  const abcCats = escapeHtml((rc.abc?.categories||[]).join(', '));
  const brand = escapeHtml((DB.config && DB.config.nombreNegocio) ? DB.config.nombreNegocio : 'Panera Signature');
  const uv = escapeHtml(rc.uv || 'unidad');
  const fecha = escapeHtml(new Date().toLocaleString('es-MX'));
  const productName = escapeHtml(rc.producto || '');
  const html = `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <title>Receta ${productName}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111}
      h1,h2,h3{margin:0 0 8px}
      .muted{color:#666}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
      .meta{font-size:12px}
      table{width:100%;border-collapse:collapse;margin:8px 0 16px}
      th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}
      th{background:#f3f4f6;text-align:left}
      .right{text-align:right}
      .summary td{border:none}
      .summary tr td:first-child{width:60%}
      .section{margin-top:12px}
      @media print{ body{margin:12mm} }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>${brand}</h1>
        <div class="muted">Receta / Costeo</div>
      </div>
      <div class="meta">
        <div><b>Fecha:</b> ${fecha}</div>
        <div><b>Producto:</b> ${productName}</div>
        <div><b>Rinde:</b> ${escapeHtml(rinde)} ${uv}</div>
      </div>
    </div>

    <div class="section">
      <h2>Resumen de costos</h2>
      <table class="summary">
        <tr><td>Insumos (piezas)</td><td class="right">${fmt(detail.totalPz)}</td></tr>
        <tr><td>Insumos (gr/ml)</td><td class="right">${fmt(detail.totalGr)}</td></tr>
        <tr><td><b>Insumos total</b></td><td class="right"><b>${fmt(detail.insumos)}</b></td></tr>
        <tr><td>Indirectos</td><td class="right">${fmt(detail.indirectos)}</td></tr>
        <tr><td>ABC por tiempo</td><td class="right">${fmt(abc.recipeCost||0)}</td></tr>
        <tr><td><b>Costo total receta</b></td><td class="right"><b>${fmt(detail.costo)}</b></td></tr>
        <tr><td>Costo por ${uv}</td><td class="right">${fmt(costoUnit)}</td></tr>
        <tr><td>Precio venta</td><td class="right">${fmt(precio)}</td></tr>
        <tr><td>Margen neto unitario</td><td class="right">${fmt(margenNeto)}</td></tr>
        <tr><td>Margen (%)</td><td class="right">${margenPct>0 ? margenPct.toFixed(2)+'%' : ''}</td></tr>
      </table>
    </div>

    <div class="section">
      <h3>Insumos</h3>
      <table>
        <thead><tr><th>Material</th><th>Cantidad</th><th>Unidad</th><th class="right">Costo unit</th><th class="right">Costo</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h3>Indirectos</h3>
      <table>
        <thead><tr><th>Concepto</th><th class="right">Monto</th></tr></thead>
        <tbody>${indirectosRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h3>Gastos ABC por tiempo</h3>
      <table class="summary">
        <tr><td>Rango</td><td>${escapeHtml(rc.abc?.from||'')} a ${escapeHtml(rc.abc?.to||'')}</td></tr>
        <tr><td>Categorías</td><td>${abcCats}</td></tr>
        <tr><td>Gastos ABC del rango</td><td class="right">${fmt(abc.expensesTotal||0)}</td></tr>
        <tr><td>Minutos productivos</td><td class="right">${escapeHtml(abc.productiveMinutes||0)}</td></tr>
        <tr><td>Costo por minuto</td><td class="right">${fmt(abc.costPerMinute||0)}</td></tr>
        <tr><td>Minutos receta</td><td class="right">${escapeHtml(abc.recipeMinutes||0)}</td></tr>
        <tr><td><b>ABC aplicado</b></td><td class="right"><b>${fmt(abc.recipeCost||0)}</b></td></tr>
      </table>
    </div>

    <div class="section">
      <h3>Notas</h3>
      <table class="summary">
        <tr><td>Alergias</td><td>${escapeHtml(rc.alergias||'')}</td></tr>
        <tr><td>Preparado por</td><td>${escapeHtml(rc.prep||'')} ${rc.prepPuesto? ' / '+escapeHtml(rc.prepPuesto):''}</td></tr>
        <tr><td>Aprobado por</td><td>${escapeHtml(rc.apr||'')} ${rc.aprPuesto? ' / '+escapeHtml(rc.aprPuesto):''}</td></tr>
      </table>
    </div>
  </body>
  </html>`;
  const w = window.open("", "_blank");
  if(!w){ alert("Permite ventanas emergentes para exportar PDF"); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
