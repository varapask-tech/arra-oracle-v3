import { Elysia } from 'elysia';
import { statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Fleet status — liveness of the 5 Oracles of Universe 1412.
 * "Last activity" is derived from each Oracle's Discord channel state dir
 * mtime (most recent file touched). It is a heuristic, not a live heartbeat.
 */

interface FleetMember {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: 'active' | 'idle' | 'offline';
  last_seen: string | null;
}

const ROSTER = [
  { id: '0', name: 'Mr.0', emoji: '🕳️', role: 'Guardian / Overseer', dir: 'discord-mr0' },
  { id: '1', name: 'Mr.1', emoji: '⚡', role: 'Dev / Infra', dir: 'discord-mr1' },
  { id: '2', name: 'Ms.2', emoji: '🌸', role: 'Investment', dir: 'discord-mr2' },
  { id: '3', name: 'Ms.3', emoji: '✨', role: 'Dev / Planner', dir: 'discord-ms3' },
  { id: '4', name: 'Mr.4', emoji: '💪', role: 'Health / Wellness', dir: 'discord-mr4' },
] as const;

const ACTIVE_MS = 10 * 60 * 1000; // < 10 min  → active
const IDLE_MS = 24 * 60 * 60 * 1000; // < 24 h → idle, else offline

function latestMtime(dir: string): number {
  let newest = 0;
  try {
    newest = statSync(dir).mtimeMs;
    for (const f of readdirSync(dir)) {
      try {
        const m = statSync(join(dir, f)).mtimeMs;
        if (m > newest) newest = m;
      } catch {
        /* skip unreadable entry */
      }
    }
  } catch {
    return 0; // dir missing → offline
  }
  return newest;
}

function statusFor(mtime: number, now: number): FleetMember['status'] {
  if (mtime <= 0) return 'offline';
  const age = now - mtime;
  if (age < ACTIVE_MS) return 'active';
  if (age < IDLE_MS) return 'idle';
  return 'offline';
}

export const fleetEndpoint = new Elysia().get(
  '/dashboard/fleet',
  () => {
    const now = Date.now();
    const channels = join(homedir(), '.claude', 'channels');
    const members: FleetMember[] = ROSTER.map((o) => {
      const mtime = latestMtime(join(channels, o.dir));
      return {
        id: o.id,
        name: o.name,
        emoji: o.emoji,
        role: o.role,
        status: statusFor(mtime, now),
        last_seen: mtime > 0 ? new Date(mtime).toISOString() : null,
      };
    });
    return { members, generated_at: new Date(now).toISOString() };
  },
  {
    detail: {
      tags: ['dashboard'],
      menu: { group: 'hidden' },
      summary: 'Fleet status — liveness of the 5 Oracles',
    },
  },
);
