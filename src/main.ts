import { Plugin, WorkspaceLeaf } from 'obsidian';
import { OAuthManager } from './auth/OAuthManager';
import { HealthClient } from './api/HealthClient';
import { DataProcessor } from './data/DataProcessor';
import { CacheManager } from './data/CacheManager';
import { HeatmapBlock } from './ui/HeatmapBlock';
import { HealthHeatmapView, VIEW_TYPE_HEALTH_HEATMAP } from './ui/HealthHeatmapView';
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

    // パネルビューを登録
    this.registerView(VIEW_TYPE_HEALTH_HEATMAP, (leaf: WorkspaceLeaf) =>
      new HealthHeatmapView(
        leaf,
        this.oauthManager,
        this.healthClient,
        this.dataProcessor,
        this.cacheManager
      )
    );

    // リボンアイコンでパネルを開く
    this.addRibbonIcon('activity', 'Health Heatmap', () => this.activateView());

    // コマンドパレットからも開けるようにする
    this.addCommand({
      id: 'open-health-heatmap',
      name: 'Health Heatmap パネルを開く',
      callback: () => this.activateView(),
    });

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

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_HEALTH_HEATMAP)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_HEALTH_HEATMAP, active: true });
    }
    workspace.revealLeaf(leaf);
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
