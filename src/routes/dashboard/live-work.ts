import { Elysia } from 'elysia';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Live Work View — what each of the 5 Oracles is doing *right now*, read from
 * their Claude Code session transcripts (JSONL). Inspired by the tmux Fleet
 * Viewer, but reads transcripts instead of tmux panes (Oracles don't run in
 * tmux). Tail-reads the latest session file so it stays cheap even when a
 * transcript grows large.
 */

interface LiveWork {
  id: string;
  name: string;
  emoji: string;
  activity: string; // latest assistant text snippet, or "[tool:X]", or "idle"
  last_ts: string | null;
  age_sec: number | null;
  status: 'active' | 'idle' | 'offline';
}

const ROSTER = [
  { id: '0', name: 'Mr.0', emoji: '🕳️', dir: '-home-junior-ghq-github-com-Soul-Brews-Studio-arra-oracle-v3' },
  { id: '1', name: 'Mr.1', emoji: '⚡', dir: '-home-junior-ghq-github-com-varapask-tech-1412-mr1' },
  { id: '2', name: 'Ms.2', emoji: '🌸', dir: '-home-junior-ghq-github-com-varapask-tech-1412-mr2-investment' },
  { id: '3', name: 'Ms.3', emoji: '✨', dir: '-home-junior-ghq-github-com-varapask-tech-1412-ms3-creative' },
  { id: '4', name: 'Mr.4', emoji: '💪', dir: '-home-junior-ghq-github-com-varapask-tech-1412-mr4-wellness' },
] as const;

const TAIL_BYTES = 256 * 1024;
const ACTIVE_MS = 5 * 60 * 1000;
const IDLE_MS = 60 * 60 * 1000;

function latestSession(dir: string): string | null {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    let newest: { path: string; mtime: number } | null = null;
    for (const f of files) {
      const p = join(dir, f);
      const m = statSync(p).mtimeMs;
      if (!newest || m > newest.mtime) newest = { path: p, mtime: m };
    }
    return newest?.path ?? null;
  } catch {
    return null;
  }
}

function snippet(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  let out: string | null = null;
  for (const b of content) {
    if (b && typeof b === 'object') {
      const block = b as Record<string, unknown>;
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        out = block.text.trim().slice(0, 120).replace(/\s+/g, ' ');
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        out = `[tool: ${block.name}]`;
      }
    }
  }
  return out;
}

async function latestActivity(file: string): Promise<{ activity: string; ts: string | null }> {
  try {
    const f = Bun.file(file);
    const size = f.size;
    const text = await f.slice(Math.max(0, size - TAIL_BYTES), size).text();
    const lines = text.split('\n');
    lines.shift(); // drop possibly-partial first line
    let activity = 'idle';
    let ts: string | null = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const m = o.message as Record<string, unknown> | undefined;
      if (!m || m.role !== 'assistant') continue;
      const s = snippet(m.content);
      if (s) {
        activity = s;
        ts = (o.timestamp as string)?.slice(0, 19) ?? ts;
      }
    }
    return { activity, ts };
  } catch {
    return { activity: 'idle', ts: null };
  }
}

export const liveWorkEndpoint = new Elysia().get(
  '/dashboard/live-work',
  async () => {
    const now = Date.now();
    const base = join(homedir(), '.claude', 'projects');
    const members: LiveWork[] = [];
    for (const o of ROSTER) {
      const file = latestSession(join(base, o.dir));
      const { activity, ts } = file ? await latestActivity(file) : { activity: 'offline', ts: null };
      const ageMs = ts ? now - new Date(ts + 'Z').getTime() : null;
      let status: LiveWork['status'] = 'offline';
      if (ageMs != null) status = ageMs < ACTIVE_MS ? 'active' : ageMs < IDLE_MS ? 'idle' : 'offline';
      members.push({
        id: o.id,
        name: o.name,
        emoji: o.emoji,
        activity,
        last_ts: ts,
        age_sec: ageMs != null ? Math.floor(ageMs / 1000) : null,
        status,
      });
    }
    return { members, generated_at: new Date(now).toISOString() };
  },
  {
    detail: { tags: ['dashboard'], menu: { group: 'hidden' }, summary: 'Live Work — what each Oracle is doing now' },
  },
);
