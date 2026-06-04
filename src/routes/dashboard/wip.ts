import { Elysia } from 'elysia';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * In-Flight Work board — reads a fleet-shared WIP file (`~/.claude/fleet-wip.json`)
 * listing current work items + stage (plan→build→review→live→done) + owner +
 * blocker. The board on Mission Control renders it so ป๊ะป๋า sees what the whole
 * fleet is working on at a glance. Any Oracle can update the file.
 */

interface WipItem {
  title: string;
  owner: string[]; // oracle ids "0".."4"
  stage: 'plan' | 'build' | 'review' | 'live' | 'done';
  note: string;
  blocker: string;
}

const WIP_PATH = process.env.FLEET_WIP_PATH || join(homedir(), '.claude', 'fleet-wip.json');

export const wipEndpoint = new Elysia().get(
  '/dashboard/wip',
  async () => {
    try {
      const f = Bun.file(WIP_PATH);
      if (!(await f.exists())) return { items: [], updated_at: null, error: 'no wip file' };
      const data = (await f.json()) as { items?: WipItem[]; updated_at?: string };
      return { items: data.items ?? [], updated_at: data.updated_at ?? null };
    } catch {
      return { items: [], updated_at: null, error: 'wip unreadable' };
    }
  },
  {
    detail: { tags: ['dashboard'], menu: { group: 'hidden' }, summary: 'In-Flight Work board (fleet WIP)' },
  },
);
