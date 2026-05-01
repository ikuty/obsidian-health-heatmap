import { CacheManager } from '../src/data/CacheManager';
import { Plugin } from 'obsidian';

function makePlugin() {
  const store: Record<string, unknown> = {};
  const plugin = new Plugin() as any;
  plugin.loadData = jest.fn().mockImplementation(() => Promise.resolve({ ...store }));
  plugin.saveData = jest.fn().mockImplementation((data: any) => {
    Object.assign(store, data);
    return Promise.resolve();
  });
  return plugin;
}

describe('CacheManager', () => {
  it('stores and retrieves data', async () => {
    const cm = new CacheManager(makePlugin());
    const key = cm.buildKey('steps', '2024-01-01', '2024-01-07', 'daily', 'raw');
    await cm.set(key, [{ date: '2024-01-01', value: 1000 }]);
    const result = await cm.get(key);
    expect(result).toEqual([{ date: '2024-01-01', value: 1000 }]);
  });

  it('returns null for missing key', async () => {
    const cm = new CacheManager(makePlugin());
    const result = await cm.get('nonexistent:key');
    expect(result).toBeNull();
  });

  it('returns null and removes expired entries', async () => {
    const plugin = makePlugin();
    const cm = new CacheManager(plugin, { ttl: 1 }); // 1ms TTL
    const key = cm.buildKey('steps', '2024-01-01', '2024-01-07', 'daily', 'raw');
    await cm.set(key, [{ value: 999 }], 1);
    await new Promise(r => setTimeout(r, 10));
    const result = await cm.get(key);
    expect(result).toBeNull();
  });

  it('clears all entries', async () => {
    const plugin = makePlugin();
    const cm = new CacheManager(plugin);
    const key = cm.buildKey('steps', '2024-01-01', '2024-01-07', 'daily', 'raw');
    await cm.set(key, [{ value: 1 }]);
    await cm.clearAll();
    expect(await cm.get(key)).toBeNull();
  });

  it('clearByMetric removes only matching prefix', async () => {
    const plugin = makePlugin();
    const cm = new CacheManager(plugin);
    const stepsKey = cm.buildKey('steps', '2024-01-01', '2024-01-07', 'daily', 'raw');
    const hrKey = cm.buildKey('heart_rate', '2024-01-01', '2024-01-07', 'daily', 'average');
    await cm.set(stepsKey, [{ value: 1 }]);
    await cm.set(hrKey, [{ value: 2 }]);
    await cm.clearByMetric('steps');
    expect(await cm.get(stepsKey)).toBeNull();
    expect(await cm.get(hrKey)).not.toBeNull();
  });
});
