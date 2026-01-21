import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Strings Dreame extraídas do projeto Python
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
const AUTH_PATH = path.join(__dirname, "auth.json");

/**
 * Região Dreame (para sua conta funcionou "us")
 */
const REGION = "us";

/**
 * Lê auth.json (se existir)
 */
export function loadAuth() {
  try {
    const raw = fs.readFileSync(AUTH_PATH, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/**
 * Salva auth.json (somente refresh token e metadados; sem senha)
 */
export function saveAuth(data) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Headers comuns JSON
 */
function buildHeadersJson(s, { accessToken, tenantId }) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    [s[47]]: s[3], // User-Agent
    [s[49]]: s[5], // Authorization (Basic ...)
    [s[50]]: tenantId, // Tenant-Id
    [s[51]]: s[52], // Content-Type: application/json
    [s[46]]: accessToken, // Dreame-Auth
  };
  if (REGION === "cn") headers[s[48]] = s[4];
  return headers;
}

/**
 * Chama /dreame-auth/oauth/token com:
 * - refresh token, ou
 * - username/password (md5 + salt)
 */
async function tokenRequest({ refreshToken, username, password }) {
  const s = decodeStrings();
  const baseUrl = `https://${REGION}${s[0]}:${s[1]}`;
  const url = baseUrl + s[17]; // /dreame-auth/oauth/token

  let body;
  if (refreshToken) {
    // refresh_token&refresh_token=
    body = `${s[12]}${s[13]}${encodeURIComponent(refreshToken)}`;
  } else {
    if (!username || !password)
      throw new Error("Missing credentials (username/password)");
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
    [s[47]]: s[3], // User-Agent
    [s[49]]: s[5], // Authorization (Basic ...)
    [s[50]]: s[6], // Tenant-Id default
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
    expiresIn: json.expires_in,
    baseUrl,
    region: REGION,
  };
}

/**
 * LOGIN:
 * - tenta refresh token do auth.json
 * - se não existir/der erro, exige username/password uma única vez
 */
export async function loginDreame({ username, password } = {}) {
  const stored = loadAuth();

  // 1) tenta refresh token
  if (stored?.refreshToken) {
    try {
      const auth = await tokenRequest({ refreshToken: stored.refreshToken });
      saveAuth({
        region: REGION,
        tenantId: auth.tenantId,
        refreshToken: auth.refreshToken ?? stored.refreshToken,
        updatedAt: new Date().toISOString(),
      });
      return auth;
    } catch {
      // cai para user/pass se fornecido
    }
  }

  // 2) fallback user/pass
  if (!username || !password) {
    throw new Error(
      "No refresh token available; username/password required once.",
    );
  }

  const auth = await tokenRequest({ username, password });
  saveAuth({
    region: REGION,
    tenantId: auth.tenantId,
    refreshToken: auth.refreshToken,
    updatedAt: new Date().toISOString(),
  });
  return auth;
}

/**
 * Listar devices (para pegar did e bindDomain)
 */
export async function listDevices({ accessToken, tenantId }) {
  const s = decodeStrings();
  const baseUrl = `https://${REGION}${s[0]}:${s[1]}`;
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const path = `${s[23]}/${s[24]}/${s[27]}/${s[28]}`; // .../device/listV2
  const url = `${baseUrl}/${path}`;

  const res = await fetch(url, { method: "POST", headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`listDevices HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(
      `listDevices code=${json.code}: ${json.msg || json.message || text}`,
    );

  return json.data;
}

/**
 * device/info (necessário para obter o cloud deviceId -> info.data.id)
 */
export async function deviceInfo({ accessToken, tenantId, did }) {
  const s = decodeStrings();
  const baseUrl = `https://${REGION}${s[0]}:${s[1]}`;
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const path = `${s[23]}/${s[24]}/${s[27]}/${s[29]}`; // .../device/info
  const url = `${baseUrl}/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ did: String(did) }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`deviceInfo HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(
      `deviceInfo code=${json.code}: ${json.msg || json.message || text}`,
    );

  return json;
}

/**
 * iotstatus/props
 * keys deve ser CSV: "2.1,2.2,3.1,3.2,4.1"
 */
export async function getPropsCloud({
  accessToken,
  tenantId,
  deviceDid,
  keys,
}) {
  const s = decodeStrings();
  const baseUrl = `https://${REGION}${s[0]}:${s[1]}`;
  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const path = `${s[23]}/${s[25]}/${s[41]}`; // .../iotstatus/props
  const url = `${baseUrl}/${path}`;

  const bodyObj = { did: String(deviceDid), keys };
  console.log("DEBUG getPropsCloud json:", JSON.stringify(bodyObj));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`getPropsCloud HTTP ${res.status}: ${text}`);

  const json = JSON.parse(text);
  if (json.code !== 0)
    throw new Error(
      `getPropsCloud code=${json.code}: ${json.msg || json.message || text}`,
    );

  return json.data;
}

/**
 * Parser com regras confirmadas pelos seus snapshots (r2423):
 * - docked/charging: chargingRaw == 1 (e fallback state=13/status=14)
 * - running: stateRaw == 1
 * - paused:  stateRaw == 3
 */
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

/**
 * Lê estado via iotstatus/props
 */
export async function readRobotState({ accessToken, tenantId, deviceDid }) {
  const keys = "2.1,2.2,3.1,3.2,4.1";
  const props = await getPropsCloud({ accessToken, tenantId, deviceDid, keys });
  return { props, state: parsePropsToState(props) };
}

/**
 * Envia MIoT Action via cloud, replicando o comportamento do Python.
 *
 * CRÍTICO:
 * - params.did = deviceId (cloud id do device/info.data.id), NÃO é o deviceDid (2015...)
 * - payload "envelopado" dentro de data.method="action"
 */
export async function callActionCloud({
  accessToken,
  tenantId,
  deviceDid, // ex: "2015119151"
  deviceId, // ex: "1994858719174369281" (info.data.id)
  bindDomain, // ex: "10000.mt.us.iot.dreame.tech:19973"
  siid,
  aiid,
  inParams = [],
  timeoutMs = 8000,
}) {
  const s = decodeStrings();

  const hostPrefix = bindDomain?.split(".")?.[0];
  const hostSuffix = hostPrefix ? `-${hostPrefix}` : "";

  const baseUrl = `https://${REGION}${s[0]}:${s[1]}`;
  const url = `${baseUrl}/${s[37]}${hostSuffix}/${s[27]}/${s[38]}`; // /dreame-iot-com-10000/device/sendCommand

  const headers = buildHeadersJson(s, { accessToken, tenantId });

  const id = Math.floor(Math.random() * 1e9);

  const payload = {
    did: String(deviceDid),
    id,
    data: {
      did: String(deviceDid),
      id,
      method: "action",
      params: {
        did: String(deviceId), // 🔥 cloud id
        siid,
        aiid,
        in: inParams,
      },
    },
  };

  console.log("DEBUG callActionCloud url:", url);
  console.log("DEBUG callActionCloud payload:", JSON.stringify(payload));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`callActionCloud HTTP ${res.status}: ${text}`);

    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Helpers de comando (mínimo essencial)
 * Tabela (confirmada no dreame-vacuum):
 * - START/RESUME: siid=2 aiid=1
 * - PAUSE:        siid=2 aiid=2
 * - HOME/CHARGE:  siid=3 aiid=1
 * - STOP:         siid=4 aiid=2
 */
export async function startCleaning(ctx) {
  return callActionCloud({ ...ctx, siid: 2, aiid: 1 });
}

export async function pauseCleaning(ctx) {
  return callActionCloud({ ...ctx, siid: 2, aiid: 2 });
}

export async function goHome(ctx) {
  return callActionCloud({ ...ctx, siid: 3, aiid: 1 });
}

export async function stopCleaning(ctx) {
  return callActionCloud({ ...ctx, siid: 4, aiid: 2 });
}
