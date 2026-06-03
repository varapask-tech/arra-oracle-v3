import { Elysia } from 'elysia';

/**
 * Cross-oracle feed proxy — server-side fetch so sibling feeds stay LAN-only
 * (no browser CORS, no public exposure). Each feed is graceful: if the sibling
 * server is down/slow, we return { stale: true } instead of throwing, so one
 * dead feed never breaks the dashboard.
 *
 * Configure sibling base URLs via env; defaults to local dev ports.
 */

const FEEDS: Record<string, string> = {
  // Ms.2 — investment snapshot (1412-mr2-investment, port 4003)
  portfolio: process.env.MR2_FEED_URL || 'http://localhost:4003/api/mr2/snapshot',
  // Mr.1 — worker/queue health (telesale-bot). Base URL TBD — set MR1_FEED_URL.
  workers: process.env.MR1_FEED_URL || '',
  // Mr.4 — ป๊ะป๋า vitals (Apple Watch → Health Auto Export → :4747)
  vitals: process.env.MR4_FEED_URL || 'http://localhost:4747/api/mr4/vitals',
};

async function proxyFeed(url: string): Promise<unknown> {
  if (!url) return { stale: true, error: 'feed not configured' };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { stale: true, error: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { stale: true, error: 'feed offline' };
  }
}

export const feedsEndpoint = new Elysia()
  .get('/dashboard/feed/portfolio', () => proxyFeed(FEEDS.portfolio), {
    detail: { tags: ['dashboard'], menu: { group: 'hidden' }, summary: 'Proxy: Ms.2 portfolio snapshot' },
  })
  .get('/dashboard/feed/workers', () => proxyFeed(FEEDS.workers), {
    detail: { tags: ['dashboard'], menu: { group: 'hidden' }, summary: 'Proxy: Mr.1 worker/queue health' },
  })
  .get('/dashboard/feed/vitals', () => proxyFeed(FEEDS.vitals), {
    detail: { tags: ['dashboard'], menu: { group: 'hidden' }, summary: 'Proxy: Mr.4 ป๊ะป๋า vitals' },
  });
