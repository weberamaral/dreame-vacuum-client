import crypto from "node:crypto";
import { gunzipSync, inflateSync, inflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Strings Dreame (mantém seu fluxo)
 */
const DREAME_STRINGS_B64 =
  "H4sICAAAAAAEAGNsb3VkX3N0cmluZ3MuanNvbgCNU21v2jAQ/iuoUtEmjZAERJiqfmCgqt00ZS3QlU4TOmyHePVLZhso+/U723SUfWo+2Pfc+z3O/ThLuHYJNQwkSxwj9dmHs6yXDwq870Z7sRifV3L6pSnOZ79RNQmOy6kE42otWTdPsuRj6x3/VmvFLlq8nLayYdJPsovWlIBg3V6Spu99UjJMV71iWKzyfDAoisGKUNIfZlWvoMMK+vkKshR6KVTDDAa06mQY9AksJ63H689i8T0TD/nVjlwvnsunq9sHeZffXjejeXb1eK/qspysLzEgDR8K1oHbWBQkWMfMnFOUV1zRiZbAFYLG6IYZt0cRKbihXiXAVdrIy5ty2rYE7ZcgRHttQLml2yNEJ8Mqw2y9dPqJqfYJ8uYGrN1pQ9sby4wCGWLaL9oAQiYgRG+UQ9yN7Hdg4+quDmfIhiZ0YtbG5MfS/zB7bjgqljwa11x7wTHl+w0TH1L7Xjo4ZZzVI09FRJGpo4WCAx/JtpwwFAS37j73dlXpaChn45sItCNeCnMbkPbgH/DaR0tNmQjdERzfHlvCah2ipX8qpuhYSwkvHVVc+FB/eQIPb+VjPXN41VhCG/9ya+YmodFJ7Nr+hyex2AhJRTT3NIzWTLmj6U4QBN5BG/4HXORwFjjshL9irJVjCGaxODSN4CQ4dn/Z4N0s8Vge2tE7JTTQuRFRUVqb0RNt3Dmpt9DxG5dEGr4ifrVYWZIn/bcsVkjmjN5smXmdbxZVJynTt+zqz79+P0MhFQQAAA==";

function decodeStrings() {
  const gz = Buffer.from(DREAME_STRINGS_B64, "base64");
  return JSON.parse(gunzipSync(gz).toString("utf8"));
}

function md5(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGION = "us";
const AUTH_PATH = path.join(__dirname, "auth.json");
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(name) {
  return path.join(CACHE_DIR, name);
}
function saveJsonCache(name, obj) {
  fs.writeFileSync(cachePath(name), JSON.stringify(obj, null, 2), "utf8");
}
function saveBinCache(name, buf) {
  fs.writeFileSync(cachePath(name), buf);
}
function loadJsonCache(name) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
  } catch {
    return null;
  }
}

export function loadAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
  } catch {
    return null;
  }
}
export function saveAuth(data) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), "utf8");
}

function baseUrl(s) {
  return `https://${REGION}${s[0]}:${s[1]}`;
}

function buildHeadersJson(s, { accessToken, tenantId }) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    [s[47]]: s[3], // User-Agent
    [s[49]]: s[5], // Authorization Basic
    [s[50]]: tenantId, // Tenant-Id
    [s[51]]: s[52], // Content-Type: application/json
    [s[46]]: accessToken, // Dreame-Auth
  };
  if (REGION === "cn") headers[s[48]] = s[4];
  return headers;
}

/* =========================
 * LOGIN
 * ========================= */

async function tokenRequest({ refreshToken, username, password }) {
  const s = decodeStrings();
  const url = baseUrl(s) + s[17];

  let body;
  if (refreshToken) {
    body = `${s[12]}${s[13]}${encodeURIComponent(refreshToken)}`;
  } else {
    if (!username || !password) throw new Error("Missing credentials");
    body =
      s[12] +
      s[14] +
      encodeURIComponent(username) +
      s[15] +
      md5(password + s[2]) +
      s[16];
  }

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    [s[47]]: s[3],
    [s[49]]: s[5],
    [s[50]]: s[6],
  };
  if (REGION === "cn") headers[s[48]] = s[4];

  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`tokenRequest HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (!json.access_token)
    throw new Error(`tokenRequest invalid response: ${text}`);

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    tenantId: json.tenant_id ?? "000000",
    baseUrl: baseUrl(s),
    region: REGION,
  };
}

export async function loginDreame({ username, password } = {}) {
  const stored = loadAuth();

  if (stored?.refreshToken) {
    const auth = await tokenRequest({ refreshToken: stored.refreshToken });
    saveAuth({
      region: REGION,
      tenantId: auth.tenantId,
      refreshToken: auth.refreshToken ?? stored.refreshToken,
      updatedAt: new Date().toISOString(),
    });
    return auth;
  }

  if (!username || !password)
    throw new Error("No refreshToken; provide username/password once");
  const auth = await tokenRequest({ username, password });
  saveAuth({
    region: REGION,
    tenantId: auth.tenantId,
    refreshToken: auth.refreshToken,
    updatedAt: new Date().toISOString(),
  });
  return auth;
}

/* =========================
 * DEVICES
 * ========================= */

export async function listDevices({ accessToken, tenantId }) {
  const s = decodeStrings();
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const url = `${baseUrl(s)}/${s[23]}/${s[24]}/${s[27]}/${s[28]}`; // listV2
  const res = await fetch(url, { method: "POST", headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`listDevices HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(`listDevices code=${json.code}: ${json.msg || text}`);
  return json.data;
}

export async function deviceInfo({ accessToken, tenantId, did }) {
  const s = decodeStrings();
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const url = `${baseUrl(s)}/${s[23]}/${s[24]}/${s[27]}/${s[29]}`; // device/info
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ did: String(did) }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`deviceInfo HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(`deviceInfo code=${json.code}: ${json.msg || text}`);
  return json;
}

/* =========================
 * PROPS
 * ========================= */

export async function getPropsCloud({
  accessToken,
  tenantId,
  deviceDid,
  keys,
}) {
  const s = decodeStrings();
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const url = `${baseUrl(s)}/${s[23]}/${s[25]}/${s[41]}`; // iotstatus/props
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ did: String(deviceDid), keys }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`getPropsCloud HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(`getPropsCloud code=${json.code}: ${json.msg || text}`);
  return json.data;
}

export function parsePropsToState(props) {
  const map = Object.fromEntries(props.map((p) => [p.key, p.value]));
  const stateRaw = Number(map["2.1"]);
  const errorRaw = Number(map["2.2"]);
  const battery = Number(map["3.1"]);
  const chargingRaw = Number(map["3.2"]);
  const statusRaw = Number(map["4.1"]);

  const docked = chargingRaw === 1 || (stateRaw === 13 && statusRaw === 14);
  const running = stateRaw === 1;
  const paused = stateRaw === 3;
  const error = errorRaw === 0 ? null : `error_code_${errorRaw}`;

  return {
    batteryPercent: Number.isFinite(battery) ? battery : undefined,
    docked,
    running,
    paused,
    error,
    raw: { stateRaw, statusRaw, chargingRaw, errorRaw },
  };
}

export async function readRobotState({ accessToken, tenantId, deviceDid }) {
  const keys = "2.1,2.2,3.1,3.2,4.1";
  const props = await getPropsCloud({ accessToken, tenantId, deviceDid, keys });
  return { props, state: parsePropsToState(props) };
}

/* ============================================================
 * ROOMS via RISM (Service Area ready)
 * ============================================================ */

function zlibDecompressBestEffort(buf) {
  try {
    return inflateSync(buf);
  } catch {}
  try {
    return inflateRawSync(buf);
  } catch {}
  throw new Error("zlib decompression failed (inflate/inflateRaw)");
}

function normalizeMapBase64String(s) {
  return s.trim().replace(/_/g, "/").replace(/-/g, "+");
}

function base64DecodeStrict(s) {
  const cleaned = s.replace(/\s+/g, "");
  return Buffer.from(cleaned, "base64");
}

export function decodeRismToRaw(rismString) {
  const normalized = normalizeMapBase64String(rismString);
  const decoded = base64DecodeStrict(normalized);
  const raw = zlibDecompressBestEffort(decoded);
  return { raw };
}

const MAP_HEADER_SIZE = 27;

function readUInt16LE(buf, off) {
  return buf.readUInt16LE(off);
}
function readInt16LE(buf, off) {
  return buf.readInt16LE(off);
}
function readUInt8(buf, off) {
  return buf.readUInt8(off);
}

export function parseRawMap(raw) {
  if (!raw || raw.length < MAP_HEADER_SIZE)
    throw new Error("parseRawMap: raw too small");

  const mapId = readUInt16LE(raw, 0);
  const frameId = readUInt16LE(raw, 2);
  const frameType = readUInt8(raw, 4);

  const robotX = readInt16LE(raw, 5);
  const robotY = readInt16LE(raw, 7);
  const robotA = readInt16LE(raw, 9);

  const chargerX = readInt16LE(raw, 11);
  const chargerY = readInt16LE(raw, 13);
  const chargerA = readInt16LE(raw, 15);

  const gridSize = readUInt16LE(raw, 17);
  const width = readUInt16LE(raw, 19);
  const height = readUInt16LE(raw, 21);
  const left = readInt16LE(raw, 23);
  const top = readInt16LE(raw, 25);

  const imageSize = MAP_HEADER_SIZE + width * height;

  let dataJson = null;
  if (raw.length > imageSize) {
    const tail = raw.slice(imageSize);
    const tailText = tail.toString("utf8").trim();
    if (tailText.startsWith("{") || tailText.startsWith("[")) {
      try {
        dataJson = JSON.parse(tailText);
      } catch {
        dataJson = null;
      }
    }
  }

  return {
    header: {
      mapId,
      frameId,
      frameType,
      robot: { x: robotX, y: robotY, a: robotA },
      charger: { x: chargerX, y: chargerY, a: chargerA },
      gridSize,
      width,
      height,
      left,
      top,
      imageSize,
      rawSize: raw.length,
    },
    dataJson,
  };
}

function looksLikeBase64(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 8) return false;
  return /^[A-Za-z0-9+/=]+$/.test(t);
}

function decodeB64Utf8Maybe(s) {
  if (!s || typeof s !== "string") return null;
  if (!looksLikeBase64(s)) return null;
  try {
    const out = Buffer.from(s, "base64").toString("utf8");
    const clean = out.replace(/\u0000/g, "").trim();
    return clean.length ? clean : null;
  } catch {
    return null;
  }
}

export function extractRoomsFromSegInf(segInfObj) {
  if (!segInfObj || typeof segInfObj !== "object") return [];
  const out = [];
  for (const [segIdStr, info] of Object.entries(segInfObj)) {
    const segId = Number(segIdStr);
    if (!Number.isFinite(segId)) continue;

    out.push({
      segmentId: segId,
      name: decodeB64Utf8Maybe(info?.name) ?? null,
      type: info?.type ?? null,
      index: info?.index ?? null,
      uniqueId: info?.roomID ?? null,
      raw: info ?? null,
    });
  }
  out.sort((a, b) => a.segmentId - b.segmentId);
  return out;
}

/**
 * Lê map_data_<did>.json (gerado por você antes) e extrai rooms.
 * Mantém cache em rooms_from_rism_<did>.json.
 */
export function syncRoomsFromRism(deviceDid) {
  const mapData = loadJsonCache(`map_data_${deviceDid}.json`);
  if (!mapData?.dataJson) {
    throw new Error(
      `map_data_${deviceDid}.json não encontrado em src/cache/. ` +
        `Você precisa gerar/atualizar o map_data antes (o arquivo deve conter dataJson.rism).`,
    );
  }

  const rism = mapData.dataJson.rism;
  if (!rism) throw new Error("map_data.dataJson.rism está vazio");

  const { raw } = decodeRismToRaw(rism);
  saveBinCache(`rism_${deviceDid}.raw.bin`, raw);

  const parsed = parseRawMap(raw);
  const segInf = parsed.dataJson?.seg_inf ?? parsed.dataJson?.segInf ?? null;
  const rooms = extractRoomsFromSegInf(segInf);

  // Formato “Service Area ready”
  const serviceAreas = rooms.map((r) => ({
    id: r.segmentId, // ✅ ID estável (Matter ServiceArea ID)
    name: r.name ?? `Room ${r.segmentId}`, // label
    // extras úteis (não obrigatórios no Matter):
    index: r.index ?? null,
    type: r.type ?? null,
    uniqueId: r.uniqueId ?? null,
  }));

  const result = {
    updatedAt: new Date().toISOString(),
    header: parsed.header,
    hasDataJson: !!parsed.dataJson,
    dataJsonKeys: parsed.dataJson ? Object.keys(parsed.dataJson) : [],
    hasSegInf: !!segInf,
    rooms,
    serviceAreas,
  };

  saveJsonCache(`rooms_from_rism_${deviceDid}.json`, result);
  return result;
}

export function loadRoomsCache(deviceDid) {
  return loadJsonCache(`rooms_from_rism_${deviceDid}.json`);
}

/* ============================================================
 * ACTION (envelope igual ao Python)
 * ============================================================ */

function randomId() {
  return Math.floor(100000000 + Math.random() * 900000000);
}

async function postDeviceSendCommand({
  accessToken,
  tenantId,
  deviceDid,
  innerMethod,
  innerParams,
  id,
}) {
  const s = decodeStrings();
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const url = `${baseUrl(s)}/dreame-iot-com-10000/device/sendCommand`;

  const payload = {
    did: String(deviceDid),
    id,
    data: {
      did: String(deviceDid),
      id,
      method: innerMethod,
      params: innerParams,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sendCommand HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

export async function callAction({
  accessToken,
  tenantId,
  deviceDid,
  deviceId,
  siid,
  aiid,
  inParams = [],
}) {
  const id = randomId();
  const params = {
    did: String(deviceId),
    siid: Number(siid),
    aiid: Number(aiid),
    in: inParams,
  };
  return postDeviceSendCommand({
    accessToken,
    tenantId,
    deviceDid,
    innerMethod: "action",
    innerParams: params,
    id,
  });
}

export async function startCleaning({
  accessToken,
  tenantId,
  deviceDid,
  deviceId,
}) {
  return callAction({
    accessToken,
    tenantId,
    deviceDid,
    deviceId,
    siid: 2,
    aiid: 1,
    inParams: [],
  });
}
export async function pauseCleaning({
  accessToken,
  tenantId,
  deviceDid,
  deviceId,
}) {
  return callAction({
    accessToken,
    tenantId,
    deviceDid,
    deviceId,
    siid: 2,
    aiid: 2,
    inParams: [],
  });
}
export async function goHome({ accessToken, tenantId, deviceDid, deviceId }) {
  return callAction({
    accessToken,
    tenantId,
    deviceDid,
    deviceId,
    siid: 3,
    aiid: 1,
    inParams: [],
  });
}

/**
 * SEGMENT CLEANING (START_CUSTOM)
 * status=18 ; piid1=status ; piid10=cleaning_properties(JSON string)
 */
export async function startSegmentCleaning({
  accessToken,
  tenantId,
  deviceDid,
  deviceId,
  segments,
  repeat = 1,
}) {
  if (!Array.isArray(segments) || segments.length === 0)
    throw new Error("startSegmentCleaning: segments vazio");

  const props = await getPropsCloud({
    accessToken,
    tenantId,
    deviceDid,
    keys: "4.4,4.5",
  });
  const map = Object.fromEntries(props.map((p) => [p.key, p.value]));
  const fan = Number(map["4.4"]);
  const water = Number(map["4.5"]);
  const fanSafe = Number.isFinite(fan) ? fan : 2;
  const waterSafe = Number.isFinite(water) ? water : 2;

  const selects = segments.map((segId) => [
    Number(segId),
    Math.max(1, repeat),
    fanSafe,
    waterSafe,
    1,
  ]);
  const cleaningPropsStr = JSON.stringify({ selects });

  const inParams = [
    { piid: 1, value: 18 },
    { piid: 10, value: cleaningPropsStr },
  ];

  const resp = await callAction({
    accessToken,
    tenantId,
    deviceDid,
    deviceId,
    siid: 4,
    aiid: 1,
    inParams,
  });
  return { resp, selects, fan: fanSafe, water: waterSafe };
}
