import readline from "node:readline";
import {
  loginDreame,
  listDevices,
  deviceInfo,
  readRobotState,
  loadAuth,
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

    // “hack” simples para não mostrar caracteres
    rl._writeToOutput = function _writeToOutput() {
      // não escreve nada
    };
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

  console.log("✅ OK. Refresh token fica em auth.json (sem senha).");
} catch (err) {
  console.error("❌ FAIL");
  console.error(err?.message ?? err);
  process.exit(1);
}
