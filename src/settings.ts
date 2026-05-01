import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type HealthPlugin from './main';
import { OAuthManager } from './auth/OAuthManager';
import { CacheManager } from './data/CacheManager';
import { PluginData } from './types';

export const DEFAULT_PLUGIN_DATA: PluginData = {
  auth: { clientId: '', clientSecret: '' },
  cache: { ttlMs: 86_400_000, maxSizeBytes: 10 * 1024 * 1024 },
  ui: { defaultTheme: 'light' },
};

export function maskClientId(id: string): string {
  if (!id || id.length < 4) return '未設定';
  return '*'.repeat(Math.max(0, id.length - 4)) + id.slice(-4);
}

export class HealthPluginSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: HealthPlugin,
    private oauthManager: OAuthManager,
    private cacheManager: CacheManager
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Fitbit Health Sync Settings' });

    this.renderAuthSection(containerEl);
    this.renderCacheSection(containerEl);
    this.renderUiSection(containerEl);
  }

  private renderAuthSection(el: HTMLElement): void {
    el.createEl('h3', { text: '認証設定 (Fitbit)' });

    const statusText = this.oauthManager.isAuthenticated() ? '✅ 設定済み' : '❌ 未設定';
    el.createEl('p', { text: `認証状態: ${statusText}` });

    const maskedId = maskClientId(this.plugin.data.auth.clientId);
    if (maskedId !== '未設定') {
      el.createEl('p', {
        cls: 'setting-item-description',
        text: `クライアント ID: ${maskedId}`,
      });
    }

    el.createEl('p', {
      cls: 'setting-item-description',
      text: 'Fitbit Developer Console でアプリを登録し、リダイレクト URI に http://127.0.0.1:8085/callback を設定してください。',
    });

    let pendingClientId = '';
    let pendingClientSecret = '';

    new Setting(el)
      .setName('クライアント ID')
      .setDesc('Fitbit Developer Console で取得したクライアント ID')
      .addText(text =>
        text
          .setPlaceholder('クライアント ID を入力...')
          .onChange(value => {
            pendingClientId = value;
          })
      );

    new Setting(el)
      .setName('クライアントシークレット')
      .setDesc('Fitbit Developer Console で取得したシークレット（保存後は表示されません）')
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('シークレットを入力...')
          .onChange(value => {
            pendingClientSecret = value;
          });
      });

    new Setting(el)
      .addButton(btn =>
        btn
          .setButtonText('保存')
          .setCta()
          .onClick(async () => {
            if (pendingClientId) this.plugin.data.auth.clientId = pendingClientId;
            if (pendingClientSecret) {
              this.plugin.data.auth.clientSecret = pendingClientSecret;
              this.plugin.data.auth.tokenSet = undefined;
            }
            this.plugin.data.auth.lastConfigured = Date.now();
            await this.plugin.savePluginData();
            new Notice('認証情報を保存しました');
            this.display();
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('OAuth 認証を開始')
          .onClick(async () => {
            if (!this.plugin.data.auth.clientId || !this.plugin.data.auth.clientSecret) {
              new Notice('先にクライアント ID とシークレットを保存してください');
              return;
            }
            try {
              await this.oauthManager.startOAuthFlow();
              await this.plugin.savePluginData();
              this.display();
            } catch (e) {
              new Notice(`認証エラー: ${e instanceof Error ? e.message : String(e)}`);
            }
          })
      )
      .addButton(btn =>
        btn
          .setButtonText('認証情報をリセット')
          .setWarning()
          .onClick(async () => {
            await this.oauthManager.revokeTokens();
            this.plugin.data.auth.clientId = '';
            this.plugin.data.auth.clientSecret = '';
            await this.plugin.savePluginData();
            new Notice('認証情報をリセットしました');
            this.display();
          })
      );
  }

  private renderCacheSection(el: HTMLElement): void {
    el.createEl('h3', { text: 'キャッシュ設定' });

    new Setting(el)
      .setName('TTL（時間）')
      .setDesc('キャッシュの有効期間（1〜168 時間）')
      .addSlider(slider =>
        slider
          .setLimits(1, 168, 1)
          .setValue(Math.round(this.plugin.data.cache.ttlMs / 3_600_000))
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.data.cache.ttlMs = value * 3_600_000;
            await this.plugin.savePluginData();
          })
      );

    new Setting(el)
      .setName('最大サイズ（MB）')
      .setDesc('キャッシュの最大容量（1〜100 MB）')
      .addSlider(slider =>
        slider
          .setLimits(1, 100, 1)
          .setValue(Math.round(this.plugin.data.cache.maxSizeBytes / (1024 * 1024)))
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.data.cache.maxSizeBytes = value * 1024 * 1024;
            await this.plugin.savePluginData();
          })
      );

    this.cacheManager.getStats().then(stats => {
      const mb = (stats.totalSize / (1024 * 1024)).toFixed(2);
      el.createEl('p', {
        cls: 'setting-item-description',
        text: `現在のキャッシュ: ${stats.totalEntries} エントリ / ${mb} MB`,
      });
    });

    new Setting(el).addButton(btn =>
      btn
        .setButtonText('キャッシュをクリア')
        .setWarning()
        .onClick(async () => {
          await this.cacheManager.clearAll();
          new Notice('キャッシュをクリアしました');
          this.display();
        })
    );
  }

  private renderUiSection(el: HTMLElement): void {
    el.createEl('h3', { text: '表示設定' });

    new Setting(el)
      .setName('デフォルトテーマ')
      .addDropdown(dd =>
        dd
          .addOption('light', 'ライト')
          .addOption('dark', 'ダーク')
          .setValue(this.plugin.data.ui.defaultTheme)
          .onChange(async value => {
            this.plugin.data.ui.defaultTheme = value as 'light' | 'dark';
            await this.plugin.savePluginData();
          })
      );
  }
}
