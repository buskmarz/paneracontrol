const {
  credentialsMatch,
  isAuthorized,
  sessionCookie,
  signSession
} = require("./lib/session-auth");

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function json(statusCode, payload, extraHeaders={}){
  return {
    statusCode,
    headers:{ ...HEADERS, ...extraHeaders },
    body:JSON.stringify(payload)
  };
}

function parseBody(event){
  if(!event.body || Buffer.byteLength(event.body, "utf8") > 4096) return null;
  try{ return JSON.parse(event.body); }
  catch(error){ return null; }
}

exports.handler = async (event) => {
  if(event.httpMethod === "GET"){
    return isAuthorized(event)
      ? json(200, { ok:true, authenticated:true })
      : json(401, { ok:false, authenticated:false });
  }

  if(event.httpMethod === "POST"){
    const body = parseBody(event);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if(!credentialsMatch(username, password)){
      return json(401, { ok:false, error:"invalid_credentials" });
    }
    try{
      const token = signSession(username);
      return json(200, { ok:true, authenticated:true }, { "Set-Cookie":sessionCookie(token, event) });
    }catch(error){
      return json(503, { ok:false, error:"auth_not_configured" });
    }
  }

  if(event.httpMethod === "DELETE"){
    return json(200, { ok:true, authenticated:false }, { "Set-Cookie":sessionCookie("", event) });
  }

  return json(405, { ok:false, error:"method_not_allowed" }, { Allow:"GET, POST, DELETE" });
};
