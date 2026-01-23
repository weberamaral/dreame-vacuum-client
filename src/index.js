import readline from "node:readline";
import {
  loadAuth,
  loginDreame,
  listDevices,
  deviceInfo,
  readRobotState,
  syncRoomsFromRism,
  loadRoomsCache,
  startSegmentCleaning,
  startCleaning,
  pauseCleaning,
  goHome,
} from "./dreameClient.js";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

async function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.question(prompt, (value) => {
      rl.history = rl.history.slice(1);
      rl.close();
      console.log();
      resolve(value);
    });
    rl._writeToOutput = function _writeToOutput() {};
  });
}

function parseCsvInts(s) {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

const cmd = (process.argv[2] ?? "status").toLowerCase();
const arg1 = process.argv[3] ?? "";

try {
  const stored = loadAuth();
  let username;
  let password;

  if (stored?.refreshToken) {
    console.log("ℹ️ auth.json encontrado (vou usar refresh token).");
  } else {
    console.log(
      "ℹ️ Primeira execução: preciso de username/senha uma única vez.",
    );
    username = await ask("Username (email): ");
    password = await askHidden("Password: ");
  }

  const auth = await loginDreame({ username, password });
  console.log("✅ LOGIN OK", {
    tenantId: auth.tenantId,
    baseUrl: auth.baseUrl,
  });

  const devs = await listDevices({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
  });
  const records = devs?.page?.records ?? devs?.records ?? [];
  const device = records[0];
  if (!device) throw new Error("Nenhum device encontrado");

  const info = await deviceInfo({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
    did: device.did,
  });
  const model = info?.data?.model ?? device.model;
  const deviceId = info?.data?.id;

  if (!model) throw new Error("Model não encontrado.");
  if (!deviceId) throw new Error("deviceId (info.data.id) não encontrado.");

  console.log("✅ DEVICE", {
    did: device.did,
    model,
    bindDomain: device.bindDomain,
    deviceId,
    masterUid: info?.data?.masterUid,
  });

  if (cmd === "status") {
    const { state } = await readRobotState({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
    });
    console.log("✅ state:", state);
    process.exit(0);
  }

  if (cmd === "sync-rooms") {
    console.log("🗺️ SYNC ROOMS (from rism) ...");
    const result = syncRoomsFromRism(device.did);
    console.log(`✅ rooms: ${result.rooms.length}`);
    console.log(`✅ serviceAreas: ${result.serviceAreas.length}`);
    console.log("ℹ️ cache:", `src/cache/rooms_from_rism_${device.did}.json`);
    process.exit(0);
  }

  if (cmd === "rooms") {
    const cached = loadRoomsCache(device.did);
    if (!cached) {
      console.log("ℹ️ rooms cache não existe ainda. Rode:");
      console.log("  node src/index.js sync-rooms");
      process.exit(1);
    }
    console.log(`✅ rooms (cache): ${cached.rooms?.length ?? 0}`);
    for (const r of cached.rooms ?? []) {
      console.log("-", {
        segmentId: r.segmentId,
        name: r.name,
        type: r.type,
        index: r.index,
        uniqueId: r.uniqueId,
      });
    }
    console.log(`✅ serviceAreas (cache): ${cached.serviceAreas?.length ?? 0}`);
    for (const a of cached.serviceAreas ?? []) {
      console.log("-", { id: a.id, name: a.name, index: a.index });
    }
    process.exit(0);
  }

  if (cmd === "clean-rooms") {
    const segments = parseCsvInts(arg1);
    if (!segments.length)
      throw new Error('Use: node src/index.js clean-rooms "2,7"');

    console.log("🧹 clean-rooms:", segments);
    const r = await startSegmentCleaning({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
      deviceId,
      segments,
      repeat: 1,
    });

    console.log("✅ sent selects:", r.selects);
    console.log("✅ fan/water:", { fan: r.fan, water: r.water });
    console.log("✅ response:", r.resp);

    const { state } = await readRobotState({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
    });
    console.log("🔄 state after command:", state);
    process.exit(0);
  }

  if (cmd === "start") {
    console.log("▶️ START ...");
    const resp = await startCleaning({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
      deviceId,
    });
    console.log("✅ start response:", resp);
    const { state } = await readRobotState({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
    });
    console.log("🔄 state after start:", state);
    process.exit(0);
  }

  if (cmd === "pause") {
    console.log("⏸️ PAUSE ...");
    const resp = await pauseCleaning({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
      deviceId,
    });
    console.log("✅ pause response:", resp);
    const { state } = await readRobotState({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
    });
    console.log("🔄 state after pause:", state);
    process.exit(0);
  }

  if (cmd === "home") {
    console.log("🏠 HOME ...");
    const resp = await goHome({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
      deviceId,
    });
    console.log("✅ home response:", resp);
    const { state } = await readRobotState({
      accessToken: auth.accessToken,
      tenantId: auth.tenantId,
      deviceDid: device.did,
    });
    console.log("🔄 state after home:", state);
    process.exit(0);
  }

  console.log("Comando inválido. Use:");
  console.log("  node src/index.js status");
  console.log("  node src/index.js sync-rooms");
  console.log("  node src/index.js rooms");
  console.log('  node src/index.js clean-rooms "2,7"');
  console.log("  node src/index.js start");
  console.log("  node src/index.js pause");
  console.log("  node src/index.js home");
  process.exit(1);
} catch (e) {
  console.error("❌ FAIL");
  console.error(e);
  process.exit(1);
}
