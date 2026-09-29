import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, RedisStore, type CodeStore } from '../src/lib/codeStore.js';

describe('MemoryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores, reads and deletes values', async () => {
    const store = new MemoryStore();
    await store.set('a', 'one', 60);
    expect(await store.get('a')).toBe('one');
    await store.del('a');
    expect(await store.get('a')).toBeNull();
  });

  it('expires values once the TTL passes', async () => {
    const store = new MemoryStore();
    await store.set('a', 'one', 30);
    vi.advanceTimersByTime(29_000);
    expect(await store.get('a')).toBe('one');
    vi.advanceTimersByTime(2_000);
    expect(await store.get('a')).toBeNull();
  });

  it('counts increments inside a window', async () => {
    const store = new MemoryStore();
    expect(await store.incr('n', 60)).toBe(1);
    expect(await store.incr('n', 60)).toBe(2);
    vi.advanceTimersByTime(61_000);
    expect(await store.incr('n', 60)).toBe(1);
  });
});

/** Minimal client that always fails — RedisStore must survive it. */
class DownClient {
  on() {
    return this;
  }
  connect() {
    return Promise.reject(new Error('connection refused'));
  }
  get() {
    return Promise.reject(new Error('connection refused'));
  }
  set() {
    return Promise.reject(new Error('connection refused'));
  }
  del() {
    return Promise.reject(new Error('connection refused'));
  }
  incr() {
    return Promise.reject(new Error('connection refused'));
  }
  expire() {
    return Promise.reject(new Error('connection refused'));
  }
}

describe('RedisStore', () => {
  it('falls back to memory instead of throwing when Redis is down', async () => {
    const store = new RedisStore(new DownClient() as never);

    await store.set('otp:verify:a@b.c', '{"code":"123456"}', 60);
    expect(await store.get('otp:verify:a@b.c')).toBe('{"code":"123456"}');
    expect(await store.incr('n', 60)).toBe(1);
    await store.del('otp:verify:a@b.c');
    expect(await store.get('otp:verify:a@b.c')).toBeNull();
  });
});

describe('fake redis', () => {
  it('goes to Redis while it answers and recovers after an outage', async () => {
    let down = true;
    const data = new Map<string, string>();
    const client = {
      on: () => client,
      connect: () => Promise.resolve(),
      get: async (k: string) => {
        if (down) throw new Error('down');
        return data.get(k) ?? null;
      },
      set: async (k: string, v: string) => {
        if (down) throw new Error('down');
        data.set(k, v);
        return 'OK';
      },
      del: async (k: string) => {
        if (down) throw new Error('down');
        return data.delete(k) ? 1 : 0;
      },
      incr: async (k: string) => {
        if (down) throw new Error('down');
        const next = Number(data.get(k) ?? 0) + 1;
        data.set(k, String(next));
        return next;
      },
      expire: async () => 1,
    };

    const store: CodeStore = new RedisStore(client as never);

    down = true;
    await store.set('k', 'from-memory', 60);
    expect(await store.get('k')).toBe('from-memory');

    down = false;
    // The outage value lives in the fallback; Redis answers for new keys.
    await store.set('k2', 'from-redis', 60);
    expect(data.get('k2')).toBe('from-redis');
    expect(await store.get('k2')).toBe('from-redis');
  });
});
