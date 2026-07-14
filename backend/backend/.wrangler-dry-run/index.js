var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var MAX_LOGIN_ATTEMPTS = 5;
var LOGIN_WINDOW_MS = 15 * 60 * 1e3;
var BLOCK_MS = 30 * 60 * 1e3;
var SESSION_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_STATE_BYTES = 9e5;
var MAX_PHOTO_BYTES = 5 * 1024 * 1024;
var schemaReady = null;
function allowedOrigins(env) {
  return env.ALLOWED_ORIGINS.split(",").map((entry) => entry.trim()).filter(Boolean);
}
__name(allowedOrigins, "allowedOrigins");
function getRequestOrigin(request) {
  return request.headers.get("Origin") ?? "";
}
__name(getRequestOrigin, "getRequestOrigin");
function isAllowedOrigin(request, env) {
  const origin = getRequestOrigin(request);
  if (origin) return allowedOrigins(env).includes(origin);
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    return allowedOrigins(env).includes(new URL(referer).origin);
  } catch {
    return false;
  }
}
__name(isAllowedOrigin, "isAllowedOrigin");
function corsHeaders(request, env) {
  const origin = getRequestOrigin(request);
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Filename",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });
  if (allowedOrigins(env).includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
__name(corsHeaders, "corsHeaders");
function json(request, env, body, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}
__name(json, "json");
function normalizeAccessName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
__name(normalizeAccessName, "normalizeAccessName");
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
__name(base64UrlDecode, "base64UrlDecode");
function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
__name(sha256, "sha256");
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
__name(hmac, "hmac");
async function createSessionToken(env) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_MS,
    version: 1
  })));
  return `${payload}.${base64UrlEncode(await hmac(payload, env.SESSION_SECRET))}`;
}
__name(createSessionToken, "createSessionToken");
async function verifySessionToken(token, env) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await hmac(payload, env.SESSION_SECRET);
    if (!constantTimeEqual(expected, base64UrlDecode(signature))) return false;
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}
__name(verifySessionToken, "verifySessionToken");
async function requireSession(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return verifySessionToken(authorization.slice(7), env);
}
__name(requireSession, "requireSession");
async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
          ip TEXT PRIMARY KEY,
          attempts INTEGER NOT NULL,
          window_start INTEGER NOT NULL,
          blocked_until INTEGER NOT NULL DEFAULT 0
        )`)
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
__name(ensureSchema, "ensureSchema");
function requestIp(request) {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
__name(requestIp, "requestIp");
async function handleLogin(request, env) {
  await ensureSchema(env);
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: "\u8BF7\u6C42\u6765\u6E90\u672A\u83B7\u6388\u6743" }, 403);
  const ip = requestIp(request);
  const now = Date.now();
  const attempt = await env.DB.prepare(
    "SELECT attempts, window_start, blocked_until FROM login_attempts WHERE ip = ?"
  ).bind(ip).first();
  if (attempt && attempt.blocked_until > now) {
    return json(request, env, { error: "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }, 429);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, env, { error: "\u8BF7\u8F93\u5165\u8BBF\u95EE\u51ED\u8BC1" }, 400);
  }
  const name = typeof body.name === "string" ? normalizeAccessName(body.name) : "";
  const actualHash = base64UrlEncode(await sha256(name));
  const expectedHash = env.ACCESS_NAME_HASH.trim();
  const valid = name.length > 0 && constantTimeEqual(
    new TextEncoder().encode(actualHash),
    new TextEncoder().encode(expectedHash)
  );
  if (!valid) {
    const withinWindow = attempt && now - attempt.window_start < LOGIN_WINDOW_MS;
    const attempts = withinWindow ? attempt.attempts + 1 : 1;
    const windowStart = withinWindow ? attempt.window_start : now;
    const blockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? now + BLOCK_MS : 0;
    await env.DB.prepare(`INSERT INTO login_attempts (ip, attempts, window_start, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET attempts = excluded.attempts,
      window_start = excluded.window_start, blocked_until = excluded.blocked_until`).bind(ip, attempts, windowStart, blockedUntil).run();
    return json(request, env, { error: blockedUntil ? "\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" : "\u8BBF\u95EE\u51ED\u8BC1\u4E0D\u6B63\u786E" }, 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  return json(request, env, { token: await createSessionToken(env), expiresIn: SESSION_MS });
}
__name(handleLogin, "handleLogin");
function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}
__name(safeHttpUrl, "safeHttpUrl");
function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
__name(cleanText, "cleanText");
function cleanItem(value, restaurant) {
  if (!value || typeof value !== "object") return null;
  const item = value;
  const id = cleanText(item.id, 100);
  const name = cleanText(item.name, 100);
  if (!id || !name || !["todo", "done"].includes(String(item.status))) return null;
  const cleaned = {
    id,
    name,
    category: cleanText(item.category, 40) || "\u5176\u4ED6",
    reason: cleanText(item.reason, 1e3),
    source: safeHttpUrl(item.source),
    status: item.status,
    emoji: cleanText(item.emoji, 16) || (restaurant ? "\u{1F962}" : "\u{1F372}"),
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
  };
  if (restaurant) {
    cleaned.address = cleanText(item.address, 300);
    if (typeof item.longitude === "number" && item.longitude >= -180 && item.longitude <= 180) cleaned.longitude = item.longitude;
    if (typeof item.latitude === "number" && item.latitude >= -90 && item.latitude <= 90) cleaned.latitude = item.latitude;
    const photoKey = cleanText(item.photoKey, 300);
    if (photoKey.startsWith(`checkins/${id}/`)) cleaned.photoKey = photoKey;
    const photoName = cleanText(item.photoName, 160);
    if (photoName) cleaned.photoName = photoName;
    if (typeof item.checkedAt === "number") cleaned.checkedAt = item.checkedAt;
  }
  return cleaned;
}
__name(cleanItem, "cleanItem");
function sanitizeState(value) {
  if (!value || typeof value !== "object") return null;
  const state = value;
  if (!Array.isArray(state.cook) || !Array.isArray(state.eatOut)) return null;
  if (state.cook.length > 500 || state.eatOut.length > 500) return null;
  const cook = state.cook.map((item) => cleanItem(item, false));
  const eatOut = state.eatOut.map((item) => cleanItem(item, true));
  if (cook.some((item) => item === null) || eatOut.some((item) => item === null)) return null;
  return { version: 3, cook, eatOut };
}
__name(sanitizeState, "sanitizeState");
async function handleData(request, env) {
  if (!await requireSession(request, env)) return json(request, env, { error: "\u767B\u5F55\u5DF2\u8FC7\u671F" }, 401);
  await ensureSchema(env);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT payload, updated_at FROM app_state WHERE id = 1").first();
    if (!row) return json(request, env, { version: 3, cook: [], eatOut: [], empty: true, updatedAt: 0 });
    try {
      return json(request, env, { ...JSON.parse(row.payload), empty: false, updatedAt: row.updated_at });
    } catch {
      return json(request, env, { error: "\u5171\u4EAB\u6E05\u5355\u6570\u636E\u635F\u574F" }, 500);
    }
  }
  if (request.method === "PUT") {
    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_STATE_BYTES) return json(request, env, { error: "\u6E05\u5355\u6570\u636E\u8FC7\u5927" }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) return json(request, env, { error: "\u6E05\u5355\u6570\u636E\u8FC7\u5927" }, 413);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(request, env, { error: "\u6E05\u5355\u683C\u5F0F\u9519\u8BEF" }, 400);
    }
    const state = sanitizeState(parsed);
    if (!state) return json(request, env, { error: "\u6E05\u5355\u5185\u5BB9\u65E0\u6548" }, 400);
    const updatedAt = Date.now();
    await env.DB.prepare(`INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`).bind(JSON.stringify(state), updatedAt).run();
    return json(request, env, { ok: true, updatedAt });
  }
  return json(request, env, { error: "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42" }, 405);
}
__name(handleData, "handleData");
function photoExtension(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "";
}
__name(photoExtension, "photoExtension");
async function handlePhotos(request, env, pathname) {
  if (!await requireSession(request, env)) return json(request, env, { error: "\u767B\u5F55\u5DF2\u8FC7\u671F" }, 401);
  const pathValue = decodeURIComponent(pathname.slice("/api/photos/".length));
  if (request.method === "POST") {
    const restaurantId = pathValue;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(restaurantId)) return json(request, env, { error: "\u996D\u5E97\u8BB0\u5F55\u65E0\u6548" }, 400);
    const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].toLowerCase();
    const extension = photoExtension(contentType);
    if (!extension) return json(request, env, { error: "\u4EC5\u652F\u6301 JPG\u3001PNG \u6216 WebP \u56FE\u7247" }, 415);
    const length = Number(request.headers.get("Content-Length") ?? "0");
    if (!length || length > MAX_PHOTO_BYTES) return json(request, env, { error: "\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 5MB" }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_PHOTO_BYTES) return json(request, env, { error: "\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 5MB" }, 413);
    const key2 = `checkins/${restaurantId}/${crypto.randomUUID()}.${extension}`;
    await env.PHOTOS.put(key2, body, { httpMetadata: { contentType } });
    return json(request, env, { key: key2 });
  }
  const key = pathValue;
  if (!/^checkins\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(key)) {
    return json(request, env, { error: "\u56FE\u7247\u5730\u5740\u65E0\u6548" }, 400);
  }
  if (request.method === "GET") {
    const object = await env.PHOTOS.get(key);
    if (!object) return json(request, env, { error: "\u56FE\u7247\u4E0D\u5B58\u5728" }, 404);
    const headers = corsHeaders(request, env);
    headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  }
  if (request.method === "DELETE") {
    await env.PHOTOS.delete(key);
    return json(request, env, { ok: true });
  }
  return json(request, env, { error: "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42" }, 405);
}
__name(handlePhotos, "handlePhotos");
async function proxyAmap(request, env, pathname) {
  if (!isAllowedOrigin(request, env)) return new Response("Forbidden", { status: 403 });
  if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_CODE) return new Response("Map is not configured", { status: 503 });
  let target;
  if (pathname === "/amap/maps") {
    target = new URL("https://webapi.amap.com/maps");
    target.searchParams.set("v", "2.0");
    target.searchParams.set("key", env.AMAP_JS_KEY);
  } else {
    const suffix = pathname.slice("/_AMapService".length) || "/";
    target = new URL(`https://restapi.amap.com${suffix}`);
    const incoming = new URL(request.url);
    incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));
    target.searchParams.set("jscode", env.AMAP_SECURITY_CODE);
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers: request.method === "GET" ? void 0 : { "Content-Type": request.headers.get("Content-Type") ?? "application/json" },
    body: request.method === "GET" || request.method === "HEAD" ? void 0 : request.body
  });
  const headers = new Headers(upstream.headers);
  const cors = corsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", pathname === "/amap/maps" ? "public, max-age=86400" : "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers });
}
__name(proxyAmap, "proxyAmap");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/health") return json(request, env, { ok: true });
    if (url.pathname === "/api/login" && request.method === "POST") return handleLogin(request, env);
    if (url.pathname === "/api/data") return handleData(request, env);
    if (url.pathname.startsWith("/api/photos/")) return handlePhotos(request, env, url.pathname);
    if (url.pathname === "/amap/maps" || url.pathname.startsWith("/_AMapService/")) return proxyAmap(request, env, url.pathname);
    return json(request, env, { error: "Not found" }, 404);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
