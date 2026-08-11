const test = require("node:test");
const assert = require("node:assert/strict");
const {
  credentialsMatch,
  isAuthorized,
  sessionCookie,
  signSession,
  verifySession
} = require("./netlify/functions/lib/session-auth");

const env = { PANERA_AUTH:"usuario:secreto", PANERA_SESSION_SECRET:"test-session-secret" };

test("credentialsMatch accepts configured plain and base64 credentials", () => {
  assert.equal(credentialsMatch("usuario", "secreto", env), true);
  assert.equal(credentialsMatch("usuario", "incorrecto", env), false);
  assert.equal(credentialsMatch("usuario", "secreto", { ...env, PANERA_AUTH:Buffer.from("usuario:secreto").toString("base64") }), true);
});

test("signed sessions expire and reject tampering", () => {
  const now = Date.now();
  const token = signSession("usuario", { env, now });
  assert.equal(verifySession(token, { env, now:now + 1000 }), true);
  assert.equal(verifySession(`${token}x`, { env, now:now + 1000 }), false);
  assert.equal(verifySession(token, { env, now:now + (9 * 60 * 60 * 1000) }), false);
});

test("session cookie is HttpOnly, same-site and authorizes requests", () => {
  const token = signSession("usuario", { env });
  const cookie = sessionCookie(token, { headers:{ "x-forwarded-proto":"https" } }, { env });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(isAuthorized({ headers:{ cookie } }, { env }), true);
});
