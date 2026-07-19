#!/usr/bin/env node
/**
 * Docker healthcheck: verify worker heartbeat key in Redis.
 * Exit 0 if heartbeat exists and is fresh (<= 90s).
 */
import Redis from 'ioredis';

const KEY = 'cardon:worker:heartbeat';
const MAX_AGE_MS = 90_000;
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('REDIS_URL is not set');
  process.exit(1);
}

const client = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  lazyConnect: true,
});

try {
  await client.connect();
  const value = await client.get(KEY);
  if (!value) {
    console.error('Worker heartbeat missing');
    process.exit(1);
  }
  const ageMs = Date.now() - Number.parseInt(value, 10);
  if (Number.isNaN(ageMs) || ageMs > MAX_AGE_MS) {
    console.error(`Worker heartbeat stale (${ageMs}ms)`);
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.quit().catch(() => undefined);
}
