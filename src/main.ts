import { Plugin } from 'obsidian';
import { OAuthManager } from './auth/OAuthManager';
import { HealthClient } from './api/HealthClient';
import { DataProcessor } from './data/DataProcessor';
import { CacheManager } from './data/CacheManager';
import { HeatmapBlock } from './ui/HeatmapBlock';
import { HealthPluginSettingTab, DEFAULT_PLUGIN_DATA } from './settings';
import { PluginData } from './types';

export default class HealthPlugin extends Plugin {
  data!: PluginData;

  private oauthManager!: OAuthManager;
  private healthClient!: HealthClient;
  private dataProcessor!: DataProcessor;
  private cacheManager!: CacheManager;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.oauthManager = new OAuthManager(
      this,
      this.data.auth,
      async updated => {
        this.data.auth = updated;
        await this.savePluginData();
      }
    );

    this.cacheManager = new CacheManager(this, {
      maxSize: this.data.cache.maxSizeBytes,
      ttl: this.data.cache.ttlMs,
    });

    this.healthClient = new HealthClient(this.oauthManager);
    this.dataProcessor = new DataProcessor();

    const block = new HeatmapBlock(
      this.oauthManager,
      this.healthClient,
      this.dataProcessor,
      this.cacheManager
    );

    this.registerMarkdownCodeBlockProcessor('health-heatmap', (source, el, ctx) =>
      block.render(source, el, ctx)
    );

    this.addSettingTab(
      new HealthPluginSettingTab(this.app, this, this.oauthManager, this.cacheManager)
    );
  }

  async loadPluginData(): Promise<void> {
    const saved = (await this.loadData()) ?? {};
    this.data = {
      auth: Object.assign({}, DEFAULT_PLUGIN_DATA.auth, saved.auth),
      cache: Object.assign({}, DEFAULT_PLUGIN_DATA.cache, saved.cache),
      ui: Object.assign({}, DEFAULT_PLUGIN_DATA.ui, saved.ui),
    };
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }
}
