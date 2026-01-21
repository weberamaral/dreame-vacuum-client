import readline from "node:readline";
import { loadAuth } from "./dreameClient.js";
import { DreameController } from "./dreameController.js";

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

function usage() {
  console.log(`
Uso:
  node src/index.js status
  node src/index.js start
  node src/index.js pause
  node src/index.js resume
  node src/index.js stop
  node src/index.js home
  node src/index.js watch

Dica:
  - A primeira vez pede username/senha (uma vez) e salva refreshToken em auth.json.
`);
}

const cmd = (process.argv[2] ?? "status").toLowerCase();

try {
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(0);
  }

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

  const ctrl = new DreameController();
  const initInfo = await ctrl.init({ username, password });

  console.log("✅ INIT OK", initInfo);

  if (cmd === "status") {
    const { state } = await ctrl.status();
    console.log("✅ state:", state);
    process.exit(0);
  }

  if (cmd === "watch") {
    console.log("👀 watch: mostrando estado a cada 2s (Ctrl+C para sair)");
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { state } = await ctrl.status();
      console.log(new Date().toISOString(), state);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (cmd === "start") {
    console.log("▶️ START ...");
    const r = await ctrl.start();
    console.log("✅ result:", r.ok, "resp:", r.resp, "state:", r.state);
    process.exit(r.ok ? 0 : 2);
  }

  if (cmd === "pause") {
    console.log("⏸️ PAUSE ...");
    const r = await ctrl.pause();
    console.log("✅ result:", r.ok, "resp:", r.resp, "state:", r.state);
    process.exit(r.ok ? 0 : 2);
  }

  if (cmd === "resume") {
    console.log("▶️ RESUME ...");
    const r = await ctrl.resume();
    console.log("✅ result:", r.ok, "resp:", r.resp, "state:", r.state);
    process.exit(r.ok ? 0 : 2);
  }

  if (cmd === "stop") {
    console.log("⏹️ STOP ...");
    const r = await ctrl.stop();
    console.log("✅ result:", r.ok, "resp:", r.resp, "state:", r.state);
    process.exit(r.ok ? 0 : 2);
  }

  if (cmd === "home") {
    console.log("🏠 HOME ...");
    const r = await ctrl.home();
    console.log("✅ result:", r.ok, "resp:", r.resp, "state:", r.state);
    process.exit(r.ok ? 0 : 2);
  }

  console.log(`Comando desconhecido: ${cmd}`);
  usage();
  process.exit(1);
} catch (err) {
  console.error("❌ FAIL");
  console.error(err);
  process.exit(1);
}
