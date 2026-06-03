import { Elysia, t } from 'elysia';

/**
 * Fleet Terminal chat — talk to any Oracle from the Mission Control dashboard.
 *
 * The Discord plugin only delivers bot-authored messages to Oracle sessions in
 * its BOT_RELAY channels (the shared channel + dev-team). Direct channels drop
 * bot messages. So Fleet Chat posts into the SHARED channel and @mentions the
 * target Oracle — the Oracle then receives it (relay-allowed) and replies.
 *
 * Reachable only behind Tailscale/LAN (dashboard has no public exposure).
 */

const DISCORD_API = 'https://discord.com/api/v10';

// Shared family channel — a BOT_RELAY channel, so Oracle sessions process
// messages posted here by Mr.0's bot (and we @mention the target Oracle).
const SHARED_CHANNEL = '1502747339843043388';

const ORACLES: Record<string, { name: string; emoji: string; userId: string }> = {
  '0': { name: 'Mr.0', emoji: '🕳️', userId: '1498282445345259660' },
  '1': { name: 'Mr.1', emoji: '⚡', userId: '1496144187131822261' },
  '2': { name: 'Ms.2', emoji: '🌸', userId: '1504531333098115277' },
  '3': { name: 'Ms.3', emoji: '✨', userId: '1509139966192779436' },
  '4': { name: 'Mr.4', emoji: '💪', userId: '1509141768069976164' },
};

function token(): string {
  return process.env.DISCORD_BOT_TOKEN || '';
}

// ป๊ะป๋า's own bot — used to SEND so the message author is "ป๊ะป๋า" (not any
// Oracle's own bot), letting every Oracle (incl Mr.0) receive + reply.
function papaToken(): string {
  return process.env.PAPA_BOT_TOKEN || '';
}

async function discord(path: string, init?: RequestInit, authToken?: string): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${authToken || token()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
}

export const chatEndpoint = new Elysia()
  .get('/dashboard/chat/oracles', () =>
    Object.entries(ORACLES).map(([id, o]) => ({ id, name: o.name, emoji: o.emoji })),
  )
  // Read the shared family conversation (where Oracle replies land)
  .get(
    '/dashboard/chat/:oracle',
    async () => {
      if (!token()) return { messages: [], error: 'no bot token configured' };
      try {
        const res = await discord(`/channels/${SHARED_CHANNEL}/messages?limit=25`);
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
          .reverse();
        return { messages };
      } catch {
        return { messages: [], error: 'discord unreachable' };
      }
    },
    { params: t.Object({ oracle: t.String() }) },
  )
  // Send to the shared channel, @mentioning the target Oracle so it replies
  .post(
    '/dashboard/chat/:oracle/send',
    async ({ params, body, set }) => {
      const o = ORACLES[params.oracle];
      if (!o) {
        set.status = 404;
        return { error: 'unknown oracle' };
      }
      if (!papaToken()) {
        set.status = 500;
        return { error: 'PAPA_BOT_TOKEN not configured' };
      }
      const text = (body as { content?: string }).content?.trim();
      if (!text) {
        set.status = 400;
        return { error: 'empty message' };
      }
      try {
        // Post as ป๊ะป๋า's bot so the target Oracle (incl Mr.0) sees it from
        // ป๊ะป๋า — not from its own bot — and replies.
        const res = await discord(
          `/channels/${SHARED_CHANNEL}/messages`,
          { method: 'POST', body: JSON.stringify({ content: `<@${o.userId}> ${text}` }) },
          papaToken(),
        );
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
