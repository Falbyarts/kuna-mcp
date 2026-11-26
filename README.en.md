# kuna-mcp

> An MCP bridge that brings the **Kuna decompiler** to AI agents over the Model Context Protocol.
> Harness-agnostic: usable from Zeron, OpenCode, Claude Code, Codex, or any other MCP host.

Kuna is an agent-first, CLI-driven decompiler. Kuna itself is **not** an MCP server, so an agent cannot call it over MCP directly. This project wraps the Kuna CLI into 14 MCP tools with fixed argv (no shell), making Kuna feel like a native tool to an agent.

See also: [README in Indonesian](README.md).

---

## 1. Requirements

- **Node.js 22 or newer** (latest LTS recommended).
- **Kuna CLI** installed and runnable. Verify with:

```bash
kuna --version
```

If Kuna is not on `PATH`, set `KUNA_COMMAND` to the absolute path of the executable.

---

## 2. Install

```bash
git clone https://github.com/Falbyarts/kuna-mcp.git
cd kuna-mcp
npm install
```

Verify:

```bash
npm test
```

This starts the MCP server, lists the tools, and calls `kuna_version`.

---

## 3. Register with Zeron

Open **Zeron → Settings → MCP → add a local server**:

| Field | Value |
| --- | --- |
| Name | `kuna` |
| Command | `node` |
| Args |`<path-to-repo>/src/index.js` |

For other clients the shape is the same:

```json
{
  "mcpServers": {
    "kuna": {
      "command": "node",
      "args": ["/path/to/kuna-mcp/src/index.js"],
      "env": {
        "KUNA_COMMAND": "/path/to/kuna"
      }
    }
  }
}
```

New servers normally reach **chats started after the connection**. Then just ask the agent, for example: *"use kuna to list functions in this binary and decompile main."*

---

## 4. Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `KUNA_COMMAND` | `kuna.exe` on Windows, `kuna` elsewhere | Kuna executable to spawn. Use an absolute path if it is not on `PATH`. |
| `KUNA_MCP_TIMEOUT_MS` | `300000` | Per-command timeout in milliseconds. |
| `KUNA_MCP_MAX_OUTPUT` | `120000` | Max stdout/stderr characters returned per call. |

---

## 5. Available tools

| Tool | Purpose |
| --- | --- |
| `kuna_version` | Installed Kuna version. |
| `kuna_docs` | Built-in Kuna docs, optionally for one topic. |
| `kuna_catalog` | List transform/analysis/core options. |
| `kuna_modes` | List decompilation modes. |
| `kuna_functions` | List functions/import slots in a binary. |
| `kuna_decompile` | Pseudocode for one function (name or address). |
| `kuna_decompile_all` | Decompile selected functions in one CLI run. |
| `kuna_decompile_project` | Export the whole program to a folder (`.c`, `.h`, `.asm`, README). |
| `kuna_disassemble` | Labeled assembly for a function or address range. |
| `kuna_read` | Hexdump of an address range. |
| `kuna_xrefs` | Incoming (`to`) or outgoing (`from`) references. |
| `kuna_strings` | String candidates with literal/regex filters. |
| `kuna_crypto` | Crypto algorithm indicators and their xrefs. |
| `kuna_unpack` | Unpack a supported container into an output directory. |

---

## 6. Suggested agent workflow

1. `kuna_functions` or `kuna_strings` for orientation.
2. `kuna_decompile` for one interesting function.
3. `kuna_xrefs` to see who calls it.
4. `kuna_decompile_project` only when a full export is actually needed.

Use **absolute paths** to binaries. `stdout`, `stderr`, `exitCode`, and truncation info are returned together as one JSON block so the agent can verify the command result.

---

## 7. Security

- No `shell: true`; arguments are passed as a fixed array, not a shell string.
- Only the configured Kuna executable is spawned.
- Tools are read-only except `kuna_decompile_project` and `kuna_unpack`, which write to a directory you choose.
- Timeout and output limits are configurable through the environment variables above.

---

## 8. License

MIT. Use, modify, and report issues freely.
