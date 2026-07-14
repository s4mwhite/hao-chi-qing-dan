type D1Result<T = unknown> = { results?: T[]; success?: boolean };

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<D1Result>;
};

type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1Result[]>;
};

type R2Object = {
  body: ReadableStream;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
};

type R2Bucket = {
  get: (key: string) => Promise<R2Object | null>;
  put: (key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
};

type Env = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ALLOWED_ORIGINS: string;
  ACCESS_NAME_HASH: string;
  SESSION_SECRET: string;
  AMAP_JS_KEY?: string;
  AMAP_SECURITY_CODE?: string;
};

type LoginAttempt = {
  attempts: number;
  window_start: number;
  blocked_until: number;
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 900_000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

let schemaReady: Promise<void> | null = null;

function allowedOrigins(env: Env) {
  return env.ALLOWED_ORIGINS.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function getRequestOrigin(request: Request) {
  return request.headers.get("Origin") ?? "";
}

function isAllowedOrigin(request: Request, env: Env) {
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

function corsHeaders(request: Request, env: Env) {
  const origin = getRequestOrigin(request);
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Filename",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  if (allowedOrigins(env).includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeAccessName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function createSessionToken(env: Env) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_MS,
    version: 1,
  })));
  return `${payload}.${base64UrlEncode(await hmac(payload, env.SESSION_SECRET))}`;
}

async function verifySessionToken(token: string, env: Env) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await hmac(payload, env.SESSION_SECRET);
    if (!constantTimeEqual(expected, base64UrlDecode(signature))) return false;
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function requireSession(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return verifySessionToken(authorization.slice(7), env);
}

async function ensureSchema(env: Env) {
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
        )`),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function requestIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

async function handleLogin(request: Request, env: Env) {
  await ensureSchema(env);
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: "请求来源未获授权" }, 403);

  const ip = requestIp(request);
  const now = Date.now();
  const attempt = await env.DB.prepare(
    "SELECT attempts, window_start, blocked_until FROM login_attempts WHERE ip = ?",
  ).bind(ip).first<LoginAttempt>();

  if (attempt && attempt.blocked_until > now) {
    return json(request, env, { error: "尝试次数过多，请稍后再试" }, 429);
  }

  let body: { name?: unknown };
  try {
    body = await request.json() as { name?: unknown };
  } catch {
    return json(request, env, { error: "请输入访问凭证" }, 400);
  }

  const name = typeof body.name === "string" ? normalizeAccessName(body.name) : "";
  const actualHash = base64UrlEncode(await sha256(name));
  const expectedHash = env.ACCESS_NAME_HASH.trim();
  const valid = name.length > 0 && constantTimeEqual(
    new TextEncoder().encode(actualHash),
    new TextEncoder().encode(expectedHash),
  );

  if (!valid) {
    const withinWindow = attempt && now - attempt.window_start < LOGIN_WINDOW_MS;
    const attempts = withinWindow ? attempt.attempts + 1 : 1;
    const windowStart = withinWindow ? attempt.window_start : now;
    const blockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? now + BLOCK_MS : 0;
    await env.DB.prepare(`INSERT INTO login_attempts (ip, attempts, window_start, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET attempts = excluded.attempts,
      window_start = excluded.window_start, blocked_until = excluded.blocked_until`)
      .bind(ip, attempts, windowStart, blockedUntil).run();
    return json(request, env, { error: blockedUntil ? "尝试次数过多，请稍后再试" : "访问凭证不正确" }, 401);
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  return json(request, env, { token: await createSessionToken(env), expiresIn: SESSION_MS });
}

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanItem(value: unknown, restaurant: boolean) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = cleanText(item.id, 100);
  const name = cleanText(item.name, 100);
  if (!id || !name || !["todo", "done"].includes(String(item.status))) return null;
  const cleaned: Record<string, unknown> = {
    id,
    name,
    category: cleanText(item.category, 40) || "其他",
    reason: cleanText(item.reason, 1000),
    review: cleanText(item.review, 1000),
    source: safeHttpUrl(item.source),
    status: item.status,
    emoji: cleanText(item.emoji, 16) || (restaurant ? "🥢" : "🍲"),
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
  };
  if (restaurant) {
    cleaned.address = cleanText(item.address, 300);
    if (typeof item.longitude === "number" && item.longitude >= -180 && item.longitude <= 180) cleaned.longitude = item.longitude;
    if (typeof item.latitude === "number" && item.latitude >= -90 && item.latitude <= 90) cleaned.latitude = item.latitude;
  }
  const photos: Array<{ key: string; name: string; createdAt: number }> = [];
  if (Array.isArray(item.photos)) {
    for (const value of item.photos.slice(0, 30)) {
      if (!value || typeof value !== "object") continue;
      const photo = value as Record<string, unknown>;
      const key = cleanText(photo.key, 300);
      if (!key.startsWith(`checkins/${id}/`)) continue;
      photos.push({
        key,
        name: cleanText(photo.name, 160) || "打卡照片",
        createdAt: typeof photo.createdAt === "number" ? photo.createdAt : Date.now(),
      });
    }
  }
  const legacyPhotoKey = cleanText(item.photoKey, 300);
  if (!photos.length && legacyPhotoKey.startsWith(`checkins/${id}/`)) {
    photos.push({
      key: legacyPhotoKey,
      name: cleanText(item.photoName, 160) || "打卡照片",
      createdAt: typeof item.checkedAt === "number" ? item.checkedAt : Date.now(),
    });
  }
  if (photos.length) {
    cleaned.photos = photos;
    const requestedCover = cleanText(item.coverPhotoKey, 300);
    cleaned.coverPhotoKey = photos.some((photo) => photo.key === requestedCover) ? requestedCover : photos[0].key;
  }
  return cleaned;
}

export function sanitizeState(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const state = value as { cook?: unknown; eatOut?: unknown };
  if (!Array.isArray(state.cook) || !Array.isArray(state.eatOut)) return null;
  if (state.cook.length > 500 || state.eatOut.length > 500) return null;
  const cook = state.cook.map((item) => cleanItem(item, false));
  const eatOut = state.eatOut.map((item) => cleanItem(item, true));
  if (cook.some((item) => item === null) || eatOut.some((item) => item === null)) return null;
  return { version: 5, cook, eatOut };
}

async function handleData(request: Request, env: Env) {
  if (!await requireSession(request, env)) return json(request, env, { error: "登录已过期" }, 401);
  await ensureSchema(env);

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT payload, updated_at FROM app_state WHERE id = 1")
      .first<{ payload: string; updated_at: number }>();
    if (!row) return json(request, env, { version: 5, cook: [], eatOut: [], empty: true, updatedAt: 0 });
    try {
      return json(request, env, { ...JSON.parse(row.payload), empty: false, updatedAt: row.updated_at });
    } catch {
      return json(request, env, { error: "共享清单数据损坏" }, 500);
    }
  }

  if (request.method === "PUT") {
    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_STATE_BYTES) return json(request, env, { error: "清单数据过大" }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) return json(request, env, { error: "清单数据过大" }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(request, env, { error: "清单格式错误" }, 400);
    }
    const state = sanitizeState(parsed);
    if (!state) return json(request, env, { error: "清单内容无效" }, 400);
    const updatedAt = Date.now();
    await env.DB.prepare(`INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
      .bind(JSON.stringify(state), updatedAt).run();
    return json(request, env, { ok: true, updatedAt });
  }

  return json(request, env, { error: "不支持的请求" }, 405);
}

function photoExtension(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "";
}

async function handlePhotos(request: Request, env: Env, pathname: string) {
  if (!await requireSession(request, env)) return json(request, env, { error: "登录已过期" }, 401);
  let pathValue = "";
  try {
    pathValue = decodeURIComponent(pathname.slice("/api/photos/".length));
  } catch {
    return json(request, env, { error: "图片地址无效" }, 400);
  }

  if (request.method === "POST") {
    const itemId = pathValue;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(itemId)) return json(request, env, { error: "记录无效" }, 400);
    const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].toLowerCase();
    const extension = photoExtension(contentType);
    if (!extension) return json(request, env, { error: "仅支持 JPG、PNG 或 WebP 图片" }, 415);
    const length = Number(request.headers.get("Content-Length") ?? "0");
    if (length > MAX_PHOTO_BYTES) return json(request, env, { error: "图片不能超过 5MB" }, 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_PHOTO_BYTES) return json(request, env, { error: "图片不能为空且不能超过 5MB" }, 413);
    const key = `checkins/${itemId}/${crypto.randomUUID()}.${extension}`;
    await env.PHOTOS.put(key, body, { httpMetadata: { contentType } });
    return json(request, env, { key });
  }

  const key = pathValue;
  if (!/^checkins\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(key)) {
    return json(request, env, { error: "图片地址无效" }, 400);
  }

  if (request.method === "GET") {
    const object = await env.PHOTOS.get(key);
    if (!object) return json(request, env, { error: "图片不存在" }, 404);
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

  return json(request, env, { error: "不支持的请求" }, 405);
}

function amapText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join("").trim();
  return "";
}

function amapLocation(value: unknown) {
  if (typeof value !== "string") return null;
  const [longitude, latitude] = value.split(",").map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

function requestedCoordinates(url: URL) {
  const longitudeText = url.searchParams.get("longitude");
  const latitudeText = url.searchParams.get("latitude");
  if (longitudeText === null || latitudeText === null) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude };
}

function normalizedAmapPois(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const pois = (value as { pois?: unknown }).pois;
  if (!Array.isArray(pois)) return [];
  return pois.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const poi = raw as Record<string, unknown>;
    const location = amapLocation(poi.location);
    if (!location) return [];
    const name = amapText(poi.name) || "地图位置";
    const addressParts = [amapText(poi.pname), amapText(poi.cityname), amapText(poi.adname), amapText(poi.address)]
      .filter((part, partIndex, parts) => part && parts.indexOf(part) === partIndex);
    const streetAddress = addressParts.join("");
    return [{
      id: amapText(poi.id) || `${location.longitude},${location.latitude}-${index}`,
      name,
      address: streetAddress ? `${name} · ${streetAddress}` : name,
      ...location,
    }];
  });
}

export { normalizedAmapPois };

function amapServiceParams(request: Request, env: Env) {
  return new URLSearchParams({
    platform: "JS",
    s: "rsv3",
    logversion: "2.0",
    key: env.AMAP_JS_KEY ?? "",
    sdkversion: "2.0",
    appname: request.headers.get("Referer") || getRequestOrigin(request) || allowedOrigins(env)[0] || "",
    csid: crypto.randomUUID(),
    jscode: env.AMAP_SECURITY_CODE ?? "",
  });
}

async function fetchAmapJson(request: Request, env: Env, pathname: string, extra: Record<string, string>) {
  const target = new URL(`https://restapi.amap.com${pathname}`);
  const params = amapServiceParams(request, env);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  target.search = params.toString();
  const response = await fetch(target, { headers: { "Referer": request.headers.get("Referer") ?? `${allowedOrigins(env)[0]}/` } });
  if (!response.ok) return null;
  return response.json<unknown>().catch(() => null);
}

async function handleMapSearch(request: Request, env: Env) {
  if (request.method !== "GET") return json(request, env, { error: "不支持的请求" }, 405);
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: "请求来源未获授权" }, 403);
  if (!await requireSession(request, env)) return json(request, env, { error: "登录已过期" }, 401);
  if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_CODE) return json(request, env, { error: "地图服务尚未配置" }, 503);

  const url = new URL(request.url);
  const query = cleanText(url.searchParams.get("query"), 120);
  if (query.length < 2) return json(request, env, { error: "请输入饭店名称或详细地址" }, 400);
  const coordinates = requestedCoordinates(url);
  let results: ReturnType<typeof normalizedAmapPois> = [];

  if (coordinates) {
    const nearby = await fetchAmapJson(request, env, "/v3/place/around", {
      keywords: query,
      location: `${coordinates.longitude},${coordinates.latitude}`,
      radius: "50000",
      sortrule: "distance",
      offset: "8",
      page: "1",
      extensions: "base",
    });
    results = normalizedAmapPois(nearby);
  }

  if (!results.length) {
    const places = await fetchAmapJson(request, env, "/v3/place/text", {
      keywords: query,
      city: "全国",
      offset: "8",
      page: "1",
      extensions: "base",
    });
    results = normalizedAmapPois(places);
  }

  if (!results.length) {
    const geocode = await fetchAmapJson(request, env, "/v3/geocode/geo", { address: query, city: "全国" });
    if (geocode && typeof geocode === "object") {
      const first = (geocode as { geocodes?: unknown }).geocodes;
      if (Array.isArray(first) && first[0] && typeof first[0] === "object") {
        const entry = first[0] as Record<string, unknown>;
        const location = amapLocation(entry.location);
        const address = amapText(entry.formatted_address) || query;
        if (location) results = [{ id: `address-${location.longitude},${location.latitude}`, name: address, address, ...location }];
      }
    }
  }

  return json(request, env, { results });
}

async function handleMapReverse(request: Request, env: Env) {
  if (request.method !== "GET") return json(request, env, { error: "不支持的请求" }, 405);
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: "请求来源未获授权" }, 403);
  if (!await requireSession(request, env)) return json(request, env, { error: "登录已过期" }, 401);
  if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_CODE) return json(request, env, { error: "地图服务尚未配置" }, 503);

  const url = new URL(request.url);
  const coordinates = requestedCoordinates(url);
  if (!coordinates) return json(request, env, { error: "地图坐标无效" }, 400);
  const result = await fetchAmapJson(request, env, "/v3/geocode/regeo", {
    location: `${coordinates.longitude},${coordinates.latitude}`,
    extensions: "base",
  });
  const regeocode = result && typeof result === "object" ? (result as { regeocode?: unknown }).regeocode : null;
  const address = regeocode && typeof regeocode === "object"
    ? amapText((regeocode as Record<string, unknown>).formatted_address)
    : "";
  return json(request, env, { address });
}

async function proxyAmap(request: Request, env: Env, pathname: string) {
  if (!isAllowedOrigin(request, env)) return new Response("Forbidden", { status: 403 });
  if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_CODE) return new Response("Map is not configured", { status: 503 });

  let target: URL;
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
    headers: pathname === "/amap/maps"
      ? { "Referer": `${allowedOrigins(env)[0]}/` }
      : request.method === "GET" ? undefined : { "Content-Type": request.headers.get("Content-Type") ?? "application/json" },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  });
  const headers = new Headers(upstream.headers);
  const cors = corsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", pathname === "/amap/maps" ? "public, max-age=86400" : "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health") return json(request, env, { ok: true });
    if (url.pathname === "/api/login" && request.method === "POST") return handleLogin(request, env);
    if (url.pathname === "/api/data") return handleData(request, env);
    if (url.pathname === "/api/map/search") return handleMapSearch(request, env);
    if (url.pathname === "/api/map/reverse") return handleMapReverse(request, env);
    if (url.pathname.startsWith("/api/photos/")) return handlePhotos(request, env, url.pathname);
    if (url.pathname === "/amap/maps" || url.pathname.startsWith("/_AMapService/")) return proxyAmap(request, env, url.pathname);
    return json(request, env, { error: "Not found" }, 404);
  },
};
