import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["src/index.js"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 30000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "kuna-mcp-smoke", version: "1.0.0" },
  });
  if (init.error) throw new Error(JSON.stringify(init.error));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const list = await request("tools/list");
  const names = (list.result?.tools || []).map((tool) => tool.name);
  if (!names.includes("kuna_version") || !names.includes("kuna_decompile")) {
    throw new Error(`missing tools: ${names.join(", ")}`);
  }

  const call = await request("tools/call", {
    name: "kuna_version",
    arguments: {},
  });
  const payload = JSON.parse(call.result.content[0].text);
  if (payload.exitCode !== 0) throw new Error(payload.stderr || "kuna_version failed");
  console.log(`OK: ${names.length} tools; ${payload.stdout.trim()}`);
} finally {
  child.kill();
}
