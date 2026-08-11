const crypto = require("node:crypto");

const COOKIE_NAME = "panera_session";
const SESSION_SECONDS = 8 * 60 * 60;

function base64Url(value){
  return Buffer.from(value).toString("base64url");
}

function decodeExpectedCredential(rawValue){
  const raw = String(rawValue || "").trim();
  if(!raw) return "";
  if(raw.includes(":")) return raw;
  try{
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.includes(":") ? decoded : "";
  }catch(error){
    return "";
  }
}

function safeEqual(left, right){
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionSecret(env=process.env){
  return String(env.PANERA_SESSION_SECRET || env.PANERA_AUTH || "").trim();
}

function credentialsMatch(username, password, env=process.env){
  const expected = decodeExpectedCredential(env.PANERA_AUTH);
  if(!expected || typeof username !== "string" || typeof password !== "string") return false;
  if(username.length > 120 || password.length > 256) return false;
  return safeEqual(`${username}:${password}`, expected);
}

function signSession(username, options={}){
  const env = options.env || process.env;
  const secret = sessionSecret(env);
  if(!secret) throw new Error("session_secret_missing");
  const now = Number(options.now || Date.now());
  const expiresAt = now + SESSION_SECONDS * 1000;
  const payload = base64Url(JSON.stringify({ user:String(username), iat:now, exp:expiresAt }));
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(token, options={}){
  const env = options.env || process.env;
  const secret = sessionSecret(env);
  if(!secret || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if(!payload || !signature || extra) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if(!safeEqual(signature, expected)) return false;
  try{
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Number(options.now || Date.now());
    return typeof data.user === "string" && data.user.length > 0 && Number(data.exp) > now;
  }catch(error){
    return false;
  }
}

function parseCookies(event){
  const headers = event.headers || {};
  const raw = String(headers.cookie || headers.Cookie || "");
  return raw.split(";").reduce((cookies, item)=>{
    const index = item.indexOf("=");
    if(index < 0) return cookies;
    const name = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if(!name) return cookies;
    try{ cookies[name] = decodeURIComponent(value); }
    catch(error){ cookies[name] = value; }
    return cookies;
  }, {});
}

function isAuthorized(event, options={}){
  const token = parseCookies(event)[COOKIE_NAME];
  return verifySession(token, options);
}

function usesHttps(event, env=process.env){
  const headers = event.headers || {};
  const forwarded = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").toLowerCase();
  return forwarded === "https" || String(event.rawUrl || "").startsWith("https://") || env.NETLIFY === "true";
}

function sessionCookie(token, event, options={}){
  const env = options.env || process.env;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token || "")}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict"
  ];
  if(usesHttps(event, env)) parts.push("Secure");
  parts.push(`Max-Age=${token ? SESSION_SECONDS : 0}`);
  return parts.join("; ");
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  credentialsMatch,
  isAuthorized,
  parseCookies,
  sessionCookie,
  signSession,
  verifySession
};
