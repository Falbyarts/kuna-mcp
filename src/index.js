#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const KUNA_COMMAND =
  process.env.KUNA_COMMAND || (process.platform === "win32" ? "kuna.exe" : "kuna");
const TIMEOUT_MS = Number.parseInt(process.env.KUNA_MCP_TIMEOUT_MS || "300000", 10);
const MAX_OUTPUT_CHARS = Number.parseInt(
  process.env.KUNA_MCP_MAX_OUTPUT || "120000",
  10,
);

const str = { type: "string" };
const bool = { type: "boolean" };
const int = { type: "integer" };
const isa = { type: "string", enum: ["auto", "arm", "thumb"] };
const mode = {
  type: "string",
  enum: ["auto", "reliable", "aggressive", "fast"],
};
const language = { type: "string", enum: ["auto", "c", "rust"] };

function binaryProp() {
  return {
    type: "string",
    description: "Path to the target binary. Relative paths resolve from the MCP host's working directory.",
  };
}

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: { type: "object", properties, required },
  };
}

const TOOLS = [
  tool("kuna_version", "Report the installed Kuna CLI version.", {}),
  tool("kuna_docs", "Read Kuna's built-in documentation, optionally for one topic.", {
    topic: str,
  }),
  tool("kuna_catalog", "List Kuna transform/analysis/core options.", {
    format: { type: "string", enum: ["json", "markdown", "check"] },
    tier: { type: "string", enum: ["transform", "analysis", "core"] },
  }),
  tool("kuna_modes", "List Kuna decompilation modes.", {}),
  tool(
    "kuna_functions",
    "List callable functions/procedures in a binary, including import slots.",
    { binary: binaryProp(), isa, jobs: { ...int, minimum: 1 }, json: bool },
    ["binary"],
  ),
  tool(
    "kuna_decompile",
    "Decompile one function to pseudocode. Use `addr: true` when target is a numeric address.",
    {
      binary: binaryProp(),
      target: { type: "string", description: "Function name or address." },
      addr: bool,
      isa,
      language,
      mode,
      max_fn_memory: int,
    },
    ["binary", "target"],
  ),
  tool(
    "kuna_decompile_all",
    "Decompile selected functions (or the whole inventory) in one CLI run.",
    {
      binary: binaryProp(),
      functions: {
        type: "string",
        description: "Comma-separated function names/addresses, e.g. main,0x401040.",
      },
      isa,
      json: bool,
      no_vars: bool,
      max_fn_seconds: int,
    },
    ["binary"],
  ),
  tool(
    "kuna_decompile_project",
    "Export a whole-program decompilation into a directory for reuse by other tools.",
    {
      binary: binaryProp(),
      output_dir: { type: "string", description: "Directory REA/Kuna-owned export files are written to." },
      functions: str,
      isa,
      max_fn_seconds: int,
      max_fn_memory: int,
    },
    ["binary", "output_dir"],
  ),
  tool(
    "kuna_disassemble",
    "Disassemble a function or address range to labeled assembly.",
    {
      binary: binaryProp(),
      target: { type: "string", description: "Name, address, or start-end range." },
      addr: bool,
      as: { type: "string", enum: ["code", "data", "auto"] },
      count: int,
      bytes: int,
      json: bool,
      isa,
      mode,
    },
    ["binary", "target"],
  ),
  tool(
    "kuna_read",
    "Hexdump view of a function or address range (raw bytes).",
    {
      binary: binaryProp(),
      target: str,
      addr: bool,
      bytes: int,
      count: int,
      json: bool,
      isa,
    },
    ["binary", "target"],
  ),
  tool(
    "kuna_xrefs",
    "Find incoming (to) or outgoing (from) references for a name or address.",
    {
      binary: binaryProp(),
      direction: { type: "string", enum: ["to", "from"] },
      target: str,
      kind: { type: "string", description: "Comma-separated: call,jump,data,read,write." },
      json: bool,
      isa,
      mode,
    },
    ["binary", "direction", "target"],
  ),
  tool(
    "kuna_strings",
    "List typed string candidates with optional literal/regex filtering.",
    {
      binary: binaryProp(),
      min_length: int,
      filter: str,
      encoding: { type: "string", enum: ["ascii", "utf16", "all"] },
      section: str,
      no_xrefs: bool,
      json: bool,
      isa,
    },
    ["binary"],
  ),
  tool(
    "kuna_crypto",
    "Scan a binary for crypto algorithm indicators and their cross-references.",
    {
      binary: binaryProp(),
      algorithm: str,
      section: str,
      no_xrefs: bool,
      json: bool,
      isa,
    },
    ["binary"],
  ),
  tool(
    "kuna_unpack",
    "Unpack a supported container into an output directory.",
    {
      binary: binaryProp(),
      output_dir: str,
      json: bool,
    },
    ["binary"],
  ),
];

function flag(args, name, value) {
  if (value === undefined || value === null || value === false) return;
  args.push(name);
  if (value !== true) args.push(String(value));
}

function fileArg(input, key) {
  if (typeof input[key] !== "string" || !input[key].trim()) {
    throw new Error(`\`${key}\` must be a non-empty path.`);
  }
  const full = resolve(input[key]);
  if (!existsSync(full)) throw new Error(`Path does not exist: ${full}`);
  if (!statSync(full).isFile()) throw new Error(`Not a regular file: ${full}`);
  return full;
}

function dirArg(input, key) {
  if (typeof input[key] !== "string" || !input[key].trim()) {
    throw new Error(`\`${key}\` must be a non-empty directory.`);
  }
  const full = resolve(input[key]);
  mkdirSync(full, { recursive: true });
  return full;
}

function buildArgs(name, input) {
  const args = [];
  switch (name) {
    case "kuna_version":
      args.push("--version");
      break;
    case "kuna_docs":
      args.push("docs");
      if (input.topic) args.push(String(input.topic));
      break;
    case "kuna_catalog":
      args.push("catalog");
      flag(args, "--format", input.format);
      flag(args, "--tier", input.tier);
      break;
    case "kuna_modes":
      args.push("modes");
      break;
    case "kuna_functions":
      args.push("functions", fileArg(input, "binary"));
      flag(args, "--isa", input.isa);
      flag(args, "--jobs", input.jobs);
      flag(args, "--json", input.json !== false);
      break;
    case "kuna_decompile":
      args.push("decompile", fileArg(input, "binary"), String(input.target));
      flag(args, "--addr", input.addr);
      flag(args, "--isa", input.isa);
      flag(args, "--language", input.language);
      flag(args, "--mode", input.mode);
      flag(args, "--max-fn-memory", input.max_fn_memory);
      break;
    case "kuna_decompile_all":
      args.push("decompile-all", fileArg(input, "binary"));
      flag(args, "--functions", input.functions);
      flag(args, "--isa", input.isa);
      flag(args, "--json", input.json !== false);
      flag(args, "--no-vars", input.no_vars);
      flag(args, "--max-fn-seconds", input.max_fn_seconds);
      break;
    case "kuna_decompile_project":
      args.push("decompile-project", fileArg(input, "binary"));
      flag(args, "--output", dirArg(input, "output_dir"));
      flag(args, "--functions", input.functions);
      flag(args, "--isa", input.isa);
      flag(args, "--max-fn-seconds", input.max_fn_seconds);
      flag(args, "--max-fn-memory", input.max_fn_memory);
      break;
    case "kuna_disassemble":
      args.push("disassemble", fileArg(input, "binary"), String(input.target));
      flag(args, "--addr", input.addr);
      flag(args, "--as", input.as);
      flag(args, "--count", input.count);
      flag(args, "--bytes", input.bytes);
      flag(args, "--json", input.json !== false);
      flag(args, "--isa", input.isa);
      flag(args, "--mode", input.mode);
      break;
    case "kuna_read":
      args.push("read", fileArg(input, "binary"), String(input.target));
      flag(args, "--addr", input.addr);
      flag(args, "--bytes", input.bytes);
      flag(args, "--count", input.count);
      flag(args, "--json", input.json !== false);
      flag(args, "--isa", input.isa);
      break;
    case "kuna_xrefs":
      args.push("xrefs", fileArg(input, "binary"), `--${input.direction}`, String(input.target));
      flag(args, "--kind", input.kind);
      flag(args, "--json", input.json !== false);
      flag(args, "--isa", input.isa);
      flag(args, "--mode", input.mode);
      break;
    case "kuna_strings":
      args.push("strings", fileArg(input, "binary"));
      flag(args, "--min-length", input.min_length);
      flag(args, "--filter", input.filter);
      flag(args, "--encoding", input.encoding);
      flag(args, "--section", input.section);
      flag(args, "--no-xrefs", input.no_xrefs);
      flag(args, "--json", input.json !== false);
      flag(args, "--isa", input.isa);
      break;
    case "kuna_crypto":
      args.push("crypto", fileArg(input, "binary"));
      flag(args, "--algorithm", input.algorithm);
      flag(args, "--section", input.section);
      flag(args, "--no-xrefs", input.no_xrefs);
      flag(args, "--json", input.json !== false);
      flag(args, "--isa", input.isa);
      break;
    case "kuna_unpack":
      args.push("unpack", fileArg(input, "binary"));
      if (input.output_dir) flag(args, "-o", dirArg(input, "output_dir"));
      flag(args, "--json", input.json !== false);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  return args;
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  return {
    text:
      text.slice(0, MAX_OUTPUT_CHARS) +
      `\n\n[truncated ${text.length - MAX_OUTPUT_CHARS} chars; raise KUNA_MCP_MAX_OUTPUT if needed]`,
    truncated: true,
  };
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(KUNA_COMMAND, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = truncate(stdout);
      const err = truncate(stderr);
      resolve({
        command: [KUNA_COMMAND, ...args],
        exitCode: code,
        timedOut,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      });
    });
  });
}

const server = new Server(
  { name: "kuna-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: input = {} } = request.params;
  try {
    const result = await run(buildArgs(name, input));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: result.exitCode !== 0 || result.timedOut,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: error instanceof Error ? error.message : String(error) },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
