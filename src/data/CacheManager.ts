import { Plugin } from 'obsidian';

const CACHE_STORE_KEY = 'health-data-cache';
const CACHE_VERSION = 1;

interface CacheEntry {
  timestamp: number;
  ttl: number;
  expiresAt: number;
  data: unknown;
  size: number;
  accessCount: number;
  lastAccessTime: number;
}

interface CacheStore {
  version: number;
  lastCleanup: number;
  entries: Record<string, CacheEntry>;
  totalSize: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  entries: Array<{ key: string; size: number; expiresAt: number }>;
}

export class CacheManager {
  private readonly maxEntrySize = 50 * 1024; // 50KB
  private maxCacheSize: number;
  private defaultTTL: number;

  constructor(private plugin: Plugin, options?: { maxSize?: number; ttl?: number }) {
    this.maxCacheSize = options?.maxSize ?? 10 * 1024 * 1024; // 10MB
    this.defaultTTL = options?.ttl ?? 86_400_000; // 24h
  }

  buildKey(
    metric: string,
    startDate: string,
    endDate: string,
    aggregationPeriod: string,
    statisticType: string
  ): string {
    return `${metric}:${startDate}:${endDate}:${aggregationPeriod}:${statisticType}`;
  }

  async get(key: string): Promise<unknown | null> {
    try {
      const store = await this.load();
      const entry = store.entries[key];
      if (!entry) return null;

      if (Date.now() > entry.expiresAt) {
        delete store.entries[key];
        store.totalSize -= entry.size;
        await this.save(store);
        return null;
      }

      entry.accessCount++;
      entry.lastAccessTime = Date.now();
      await this.save(store);
      return entry.data;
    } catch {
      return null;
    }
  }

  async set(key: string, data: unknown, ttl?: number): Promise<boolean> {
    try {
      const size = JSON.stringify(data).length;
      if (size > this.maxEntrySize) return false;

      const store = await this.load();

      if (store.totalSize + size > this.maxCacheSize) {
        this.evictExpired(store);
      }
      if (store.totalSize + size > this.maxCacheSize) {
        this.evictLRU(store, size);
      }

      const now = Date.now();
      const resolvedTtl = ttl ?? this.defaultTTL;
      store.entries[key] = {
        timestamp: now,
        ttl: resolvedTtl,
        expiresAt: now + resolvedTtl,
        data,
        size,
        accessCount: 0,
        lastAccessTime: now,
      };
      store.totalSize += size;
      await this.save(store);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const store = await this.load();
    const entry = store.entries[key];
    if (entry) {
      store.totalSize -= entry.size;
      delete store.entries[key];
      await this.save(store);
    }
  }

  async clearAll(): Promise<void> {
    const pluginData = (await this.plugin.loadData()) ?? {};
    pluginData[CACHE_STORE_KEY] = this.emptyStore();
    await this.plugin.saveData(pluginData);
  }

  async clearByMetric(metric: string): Promise<void> {
    const store = await this.load();
    const prefix = `${metric}:`;
    for (const key of Object.keys(store.entries)) {
      if (key.startsWith(prefix)) {
        store.totalSize -= store.entries[key].size;
        delete store.entries[key];
      }
    }
    await this.save(store);
  }

  async getStats(): Promise<CacheStats> {
    const store = await this.load();
    return {
      totalEntries: Object.keys(store.entries).length,
      totalSize: store.totalSize,
      entries: Object.entries(store.entries).map(([key, e]) => ({
        key,
        size: e.size,
        expiresAt: e.expiresAt,
      })),
    };
  }

  private evictExpired(store: CacheStore): void {
    const now = Date.now();
    for (const [key, entry] of Object.entries(store.entries)) {
      if (now > entry.expiresAt) {
        store.totalSize -= entry.size;
        delete store.entries[key];
      }
    }
  }

  private evictLRU(store: CacheStore, required: number): void {
    const sorted = Object.entries(store.entries).sort(
      (a, b) => a[1].lastAccessTime - b[1].lastAccessTime
    );
    for (const [key, entry] of sorted) {
      if (store.totalSize + required <= this.maxCacheSize) break;
      store.totalSize -= entry.size;
      delete store.entries[key];
    }
  }

  private async load(): Promise<CacheStore> {
    const pluginData = (await this.plugin.loadData()) ?? {};
    const store = pluginData[CACHE_STORE_KEY] as CacheStore | undefined;
    if (!store || store.version !== CACHE_VERSION) return this.emptyStore();
    return store;
  }

  private async save(store: CacheStore): Promise<void> {
    const pluginData = (await this.plugin.loadData()) ?? {};
    pluginData[CACHE_STORE_KEY] = store;
    await this.plugin.saveData(pluginData);
  }

  private emptyStore(): CacheStore {
    return { version: CACHE_VERSION, lastCleanup: Date.now(), entries: {}, totalSize: 0 };
  }
}
