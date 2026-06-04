/**
 * Dashboard Routes (Elysia) — /api/dashboard/*, /api/session/stats
 */
import { Elysia } from 'elysia';
import { summaryEndpoint } from './summary.ts';
import { activityEndpoint } from './activity.ts';
import { growthEndpoint } from './growth.ts';
import { sessionStatsEndpoint } from './session-stats.ts';
import { fleetEndpoint } from './fleet.ts';
import { feedsEndpoint } from './feeds.ts';
import { liveWorkEndpoint } from './live-work.ts';
import { chatEndpoint } from './chat.ts';
import { wipEndpoint } from './wip.ts';

export const dashboardRoutes = new Elysia({ prefix: '/api' })
  .use(summaryEndpoint)
  .use(activityEndpoint)
  .use(growthEndpoint)
  .use(sessionStatsEndpoint)
  .use(fleetEndpoint)
  .use(feedsEndpoint)
  .use(liveWorkEndpoint)
  .use(chatEndpoint)
  .use(wipEndpoint);
