import readline from "node:readline";
import {
  loginDreame,
  listDevices,
  deviceInfo,
  readRobotState,
  loadAuth,
  startCleaning,
  pauseCleaning,
  goHome,
  stopCleaning,
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

// senha sem ecoar no terminal
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

try {
  const stored = loadAuth();
  let auth;

  if (stored?.refreshToken) {
    console.log("ℹ️ auth.json encontrado (vou usar refresh token).");
    auth = await loginDreame();
  } else {
    console.log(
      "ℹ️ Primeira execução: preciso de username/senha uma única vez.",
    );
    const username = await ask("Username (email): ");
    const password = await askHidden("Password: ");
    auth = await loginDreame({ username, password });
  }

  console.log("✅ LOGIN OK", {
    tenantId: auth.tenantId,
    baseUrl: auth.baseUrl,
  });

  const devices = await listDevices({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
  });
  const records = devices?.page?.records ?? devices?.records ?? [];
  if (!records.length) throw new Error("Nenhum device encontrado");

  const dev = records[0];
  console.log("✅ DEVICE", {
    did: String(dev.did),
    model: dev.model,
    bindDomain: dev.bindDomain,
  });

  const info = await deviceInfo({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
    did: dev.did,
  });
  console.log("ℹ️ device/info.online:", info.data?.online);
  console.log("ℹ️ device/info.latestStatus:", info.data?.latestStatus);

  const { props, state } = await readRobotState({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
    deviceDid: dev.did,
  });

  console.log("✅ iotstatus/props result:", props);
  console.log("✅ parsed state:", state);

  // Contexto necessário para comandos MIoT action
  const ctx = {
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
    deviceDid: dev.did,
    deviceId: info.data.id, // 🔥 cloud device id
    bindDomain: dev.bindDomain,
  };

  // =========================
  // TESTE DE COMANDO (mude aqui conforme quiser)
  // =========================

  if (state.running) {
    console.log("⏸️ PAUSE (action) ...");
    const r = await pauseCleaning(ctx);
    console.log("✅ pause response:", r);
  } else if (state.paused) {
    console.log("▶️ RESUME/START (action) ...");
    const r = await startCleaning(ctx);
    console.log("✅ start response:", r);
  } else if (state.docked) {
    console.log("▶️ START (action) ...");
    const r = await startCleaning(ctx);
    console.log("✅ start response:", r);
  } else {
    console.log("🏠 HOME (action) ...");
    const r = await goHome(ctx);
    console.log("✅ home response:", r);
  }

  // Aguarda e lê novamente
  await new Promise((r) => setTimeout(r, 3000));

  const after = await readRobotState({
    accessToken: auth.accessToken,
    tenantId: auth.tenantId,
    deviceDid: dev.did,
  });

  console.log("🔄 state after command:", after.state);
  console.log("✅ OK.");
} catch (err) {
  console.error("❌ FAIL");
  console.error(err);
  process.exit(1);
}
