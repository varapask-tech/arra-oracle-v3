import { Elysia, t } from 'elysia';

/**
 * Fleet Terminal chat — read + send messages to an Oracle's Discord channel,
 * using Mr.0's bot token (Discord REST). Lets ป๊ะป๋า talk to any Oracle from
 * the Mission Control dashboard (Tab/iPad) without leaving the page.
 *
 * Reachable only behind Tailscale/LAN (dashboard has no public exposure).
 */

const DISCORD_API = 'https://discord.com/api/v10';

// Oracle → its direct Discord channel (where that Oracle replies without @)
const ORACLE_CHANNELS: Record<string, { name: string; emoji: string; channel: string }> = {
  '0': { name: 'Mr.0', emoji: '🕳️', channel: '1498278390241951744' },
  '1': { name: 'Mr.1', emoji: '⚡', channel: '1502687083586916402' },
  '2': { name: 'Ms.2', emoji: '🌸', channel: '1504532620250316920' },
  '3': { name: 'Ms.3', emoji: '✨', channel: '1509142210619244595' },
  '4': { name: 'Mr.4', emoji: '💪', channel: '1509142280517451847' },
};

function token(): string {
  return process.env.DISCORD_BOT_TOKEN || '';
}

async function discord(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
}

export const chatEndpoint = new Elysia()
  // List the chat-able Oracles
  .get('/dashboard/chat/oracles', () =>
    Object.entries(ORACLE_CHANNELS).map(([id, o]) => ({ id, name: o.name, emoji: o.emoji })),
  )
  // Read recent messages of an Oracle's channel
  .get(
    '/dashboard/chat/:oracle',
    async ({ params, set }) => {
      const o = ORACLE_CHANNELS[params.oracle];
      if (!o) {
        set.status = 404;
        return { error: 'unknown oracle' };
      }
      if (!token()) return { messages: [], error: 'no bot token configured' };
      try {
        const res = await discord(`/channels/${o.channel}/messages?limit=20`);
        if (!res.ok) return { messages: [], error: `discord ${res.status}` };
        const raw = (await res.json()) as Array<Record<string, any>>;
        const messages = raw
          .map((m) => ({
            id: m.id,
            author: m.author?.global_name || m.author?.username || '?',
            is_bot: !!m.author?.bot,
            content: m.content || '',
            ts: m.timestamp,
          }))
          .reverse(); // oldest → newest for display
        return { oracle: params.oracle, messages };
      } catch {
        return { messages: [], error: 'discord unreachable' };
      }
    },
    { params: t.Object({ oracle: t.String() }) },
  )
  // Send a message to an Oracle's channel (as Mr.0's bot, tagged from ป๊ะป๋า via Tab)
  .post(
    '/dashboard/chat/:oracle/send',
    async ({ params, body, set }) => {
      const o = ORACLE_CHANNELS[params.oracle];
      if (!o) {
        set.status = 404;
        return { error: 'unknown oracle' };
      }
      if (!token()) {
        set.status = 500;
        return { error: 'no bot token configured' };
      }
      const text = (body as { content?: string }).content?.trim();
      if (!text) {
        set.status = 400;
        return { error: 'empty message' };
      }
      try {
        const res = await discord(`/channels/${o.channel}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: `🖥️ [ป๊ะป๋า · via Tab] ${text}` }),
        });
        if (!res.ok) {
          set.status = 502;
          return { ok: false, error: `discord ${res.status}` };
        }
        return { ok: true };
      } catch {
        set.status = 502;
        return { ok: false, error: 'discord unreachable' };
      }
    },
    { params: t.Object({ oracle: t.String() }), body: t.Object({ content: t.String() }) },
  );
