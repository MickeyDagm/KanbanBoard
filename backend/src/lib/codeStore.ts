import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Tiny TTL key-value store used for short-lived secrets (OTP codes, resend
 * counters). Redis when REDIS_URL is set, otherwise an in-process Map.
 *
 * Every Redis call is allowed to fail: on error we log once, mark the client
 * degraded and serve the request from the in-memory fallback instead, so a
 * Redis outage degrades OTP delivery rather than taking auth down.
 */
export interface CodeStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increments a counter, starting its TTL on the first increment. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  connect(): Promise<unknown>;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

interface Entry {
  value: string;
  expiresAt: number;
}

export class MemoryStore implements CodeStore {
  private map = new Map<string, Entry>();

  private live(key: string): Entry | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) {
      await this.set(key, '1', ttlSeconds);
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }
}

export class RedisStore implements CodeStore {
  private fallback = new MemoryStore();
  private down = false;

  constructor(private client: RedisLike) {
    this.client.on('error', (err) => this.noteDown(err));
    void this.client.connect().catch((err: Error) => this.noteDown(err));
  }

  private noteDown(err: Error) {
    if (this.down) return;
    this.down = true;
    if (!env.isTest) {
      console.warn(
        `[redis] unavailable (${err.message}) — using the in-memory store until it recovers`
      );
    }
  }

  private noteUp() {
    if (!this.down) return;
    this.down = false;
    if (!env.isTest) console.warn('[redis] connection restored');
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.client.get(key);
      this.noteUp();
      return value;
    } catch (err) {
      this.noteDown(err as Error);
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
      this.noteUp();
    } catch (err) {
      this.noteDown(err as Error);
      await this.fallback.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.noteUp();
    } catch (err) {
      this.noteDown(err as Error);
      await this.fallback.del(key);
    }
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    try {
      const value = await this.client.incr(key);
      // First increment starts the window; later ones keep the original TTL.
      if (value === 1) await this.client.expire(key, ttlSeconds);
      this.noteUp();
      return value;
    } catch (err) {
      this.noteDown(err as Error);
      return this.fallback.incr(key, ttlSeconds);
    }
  }
}

let store: CodeStore | null = null;

export function getCodeStore(): CodeStore {
  if (store) return store;
  if (env.isTest || !env.redisUrl) {
    store = new MemoryStore();
  } else {
    store = new RedisStore(
      new Redis(env.redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => Math.min(times * 500, 30_000),
      }) as unknown as RedisLike
    );
  }
  return store;
}

/** Test hook — drops the memoized store. */
export function resetCodeStore() {
  store = null;
}
