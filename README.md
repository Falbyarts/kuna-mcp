# kuna-mcp

> Jembatan MCP yang membawa **Kuna decompiler** ke agent AI lewat Model Context Protocol.
> Tidak terikat harness tertentu: bisa dipanggil Zeron, OpenCode, Claude Code, Codex, atau host MCP lain.

Kuna adalah decompiler agent-first berbasis CLI. Kuna **sendiri bukan server MCP**, jadi agent tidak bisa memanggilnya lewat MCP secara langsung. Repo ini membungkus perintah CLI Kuna menjadi 14 tool MCP dengan argumen tetap (tanpa shell), sehingga agent bisa memakai Kuna seperti tool native.

Baca juga: [English README](README.en.md).

---

## 1. Prasyarat

- **Node.js 22 ke atas** (disarankan LTS terbaru).
- **Kuna CLI** sudah terpasang dan bisa dijalankan. Cek dengan:

```bash
kuna --version
```

Jika Kuna tidak ada di `PATH`, set variabel `KUNA_COMMAND` ke path absolut executable Kuna.

---

## 2. Pasang

```bash
git clone https://github.com/Falbyarts/kuna-mcp.git
cd kuna-mcp
npm install
```

Uji installation:

```bash
npm test
```

Perintah ini memulai server MCP, membaca daftar tool, dan memanggil `kuna_version`.

---

## 3. Daftarkan ke Zeron

Buka **Zeron → Settings → MCP → tambah server lokal**:

| Kolom | Nilai |
| --- | --- |
| Nama | `kuna` |
| Command | `node` |
| Args |`<path-ke-repo>/src/index.js` |

Atau lewat konfigurasi lain, bentuk umumnya:

```json
{
  "mcpServers": {
    "kuna": {
      "command": "node",
      "args": ["/path/ke/kuna-mcp/src/index.js"],
      "env": {
        "KUNA_COMMAND": "/path/ke/kuna"
      }
    }
  }
}
```

Server baru biasanya tersedia untuk **chat yang dibuat setelah server terhubung**. Setelah itu cukup minta agent, misalnya: *"pakai kuna, sebutkan fungsi dalam binary ini lalu decompile fungsi utamanya."*

---

## 4. Variabel lingkungan

| Nama | Default | Fungsi |
| --- | --- | --- |
| `KUNA_COMMAND` | `kuna.exe` di Windows, `kuna` di sistem lain | Executable Kuna yang dipanggil. Isi path absolut jika tidak ada di `PATH`. |
| `KUNA_MCP_TIMEOUT_MS` | `300000` | Batas waktu satu perintah Kuna (milidetik). |
| `KUNA_MCP_MAX_OUTPUT` | `120000` | Batas karakter stdout/stderr yang dikembalikan. |

---

## 5. Tool yang tersedia

| Tool | Fungsi ringkas |
| --- | --- |
| `kuna_version` | Versi Kuna yang terpasang. |
| `kuna_docs` | Dokumentasi bawaan Kuna, opsional per topik. |
| `kuna_catalog` | Daftar opsi transform/analysis/core. |
| `kuna_modes` | Daftar mode dekompilasi. |
| `kuna_functions` | Daftar fungsi/import dalam binary. |
| `kuna_decompile` | Pseudocode satu fungsi (nama atau alamat). |
| `kuna_decompile_all` | Dekompilasi banyak fungsi dalam satu proses. |
| `kuna_decompile_project` | Export seluruh program ke folder (`.c`, `.h`, `.asm`, README). |
| `kuna_disassemble` | Assembly label untuk fungsi atau rentang alamat. |
| `kuna_read` | Hexdump rentang alamat. |
| `kuna_xrefs` | Referensi masuk (`to`) atau keluar (`from`). |
| `kuna_strings` | Kandidat string dengan filter literal/regex. |
| `kuna_crypto` | Indikator algoritma kripto dan xref-nya. |
| `kuna_unpack` | Unpack container yang didukung ke folder output. |

---

## 6. Alur yang disarankan untuk agent

1. `kuna_functions` atau `kuna_strings` untuk orientasi awal.
2. `kuna_decompile` untuk satu fungsi yang menarik.
3. `kuna_xrefs` untuk melihat siapa yang memanggil fungsi itu.
4. `kuna_decompile_project` hanya jika export penuh memang diperlukan.

Gunakan **path absolut** ke binary. Keluaran `stdout`/`stderr`, `exitCode`, dan informasi truncate dikembalikan sebagai satu blok JSON agar agent bisa memeriksa keberhasilan perintah.

---

## 7. Keamanan

- Tidak ada `shell: true`; argumen dilempar sebagai array tetap, bukan string shell.
- Hanya executable Kuna yang dipanggil.
- Tool bersifat baca kecuali `kuna_decompile_project` dan `kuna_unpack`, yang menulis ke folder yang kamu tentukan.
- Batas waktu dan batas keluaran bisa diatur lewat env di atas.

---

## 8. Lisensi

MIT. Silakan pakai, modifikasi, dan laporkan issue.
