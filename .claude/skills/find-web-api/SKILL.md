---
origin: Mr.0 Oracle — Universe 1412 (Soul Brews Studio family). Custom skill, not part of arra-oracle-skills installer registry.
name: find-web-api
description: 'L-SKLL | ส่องเว็บแล้วค้น API + เขียน client ให้อัตโนมัติ (reverse-api-engineer agent). ใช้เมื่อ user พูดว่า "หา API ของเว็บ", "ส่อง API", "reverse engineer API", "find web API", หรืออยาก integrate กับเว็บที่ไม่มี API doc. ⚠️ มีค่าใช้จ่าย ~$1.26/run (Claude API จริง) — ถามก่อนรันถ้า user ยังไม่ยืนยัน.'
---

# /find-web-api

ให้ oracle ส่องเว็บ → ค้น API endpoints เอง → gen typed client (Python/JS/TS) + README.
ห่อ `reverse-api-engineer` (kalil0321, MIT) ที่ติดตั้งบนเครื่องแล้ว (ดู memory `reference_reverse_api_engineer`).

## ⚠️ ก่อนรัน — ต้องรู้
- **ค่าใช้จ่าย ~$1.26/run** (ใช้ Claude Sonnet API จริง). **ถ้า user ยังไม่ยืนยัน ให้ถามก่อน** ว่าโอเคไหม.
- auth ใช้ claude login ที่มีอยู่ — ไม่ต้องตั้ง `ANTHROPIC_API_KEY`.
- ต้องมี `~/.local/bin` ใน PATH (ที่อยู่ของ `uv` + binary). ถ้าเรียก `reverse-api-engineer` ไม่เจอ: `export PATH="$HOME/.local/bin:$PATH"`.

## วิธีใช้ (agent mode — autonomous)

```bash
export PATH="$HOME/.local/bin:$PATH"
reverse-api-engineer agent \
  -p "<สิ่งที่อยากได้ เช่น: ค้น API ที่หน้านี้ใช้โหลดสินค้า + pagination>" \
  -u "<url ของเว็บเป้าหมาย>" \
  -m claude-sonnet-4-6 \
  --headless --json-stream
```

- ตรวจก่อนด้วย `--dry-run` (validate prompt/url/env ไม่เปิด browser ไม่เสียเงิน) ถ้าอยากชัวร์.
- output อยู่ที่ `~/.reverse-api/runs/scripts/<run_id>/` (api_client.py + README.md).
- ดูรายการที่เคยรัน: `reverse-api-engineer list` · ดูรายละเอียด: `reverse-api-engineer show <run_id>`.

## โหมดอื่น
- `reverse-api-engineer manual` — ป้อน HAR file เอง (ไม่ต้องให้ agent เปิดเว็บ ไม่เสียค่า browse).
- `reverse-api-engineer engineer` — rerun reverse-engineering จาก run เดิม.
- `reverse-api-engineer run <run_id>` — รัน client ที่ gen ไว้.

## ข้อจำกัด (สำคัญ)
- **เว็บที่มี API เปิด/probe ได้ทาง HTTP → ใช้ได้เลย** (fallback เป็น WebFetch/curl ได้แม้ไม่มี browser).
- **เว็บ browser-only** (JS หนัก / ต้อง login / XHR เห็นเฉพาะในเบราว์เซอร์) → ต้องต่อ **Chrome MCP** เพิ่ม. `playwright install chromium` ลงตรงไม่ได้บน Ubuntu 26.04. agent รองรับ mode: `auto` / `chrome-mcp` / `agent-browser`.

## หลังรัน
- รายงานผลให้ user: API ที่เจอ (endpoint/params/auth), path ของ client ที่ gen, และค่าใช้จ่ายจริงจาก field `usage.total_cost_usd` ใน JSON result.
- **เคารพ Principle 4 (Curiosity Creates Existence)** — แต่ไม่ส่องเว็บที่ละเมิด ToS/กฎหมาย. ใช้กับเว็บที่ได้รับอนุญาต/ของเราเอง/sandbox เท่านั้น.
