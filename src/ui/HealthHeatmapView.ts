import { ItemView, WorkspaceLeaf } from 'obsidian';
import { OAuthManager, AuthError } from '../auth/OAuthManager';
import { HealthClient, ApiError } from '../api/HealthClient';
import { DataProcessor } from '../data/DataProcessor';
import { CacheManager } from '../data/CacheManager';
import { HeatmapRenderer } from './HeatmapRenderer';
import { SleepColumnRangeRenderer } from './SleepColumnRangeRenderer';
import {
  MetricType,
  HeatmapBlockParams,
  HeatmapDataPoint,
  HeatmapDataPointFull,
  SleepColumnRangePoint,
  StatisticType,
} from '../types';

export const VIEW_TYPE_HEALTH_HEATMAP = 'health-heatmap-view';

const PANEL_METRICS: { key: MetricType; label: string }[] = [
  { key: 'steps',          label: 'Steps' },
  { key: 'calories',       label: 'Calories' },
  { key: 'sleep',          label: 'Sleep' },
  { key: 'active_minutes', label: 'Active' },
];

function resolveStatisticType(metric: MetricType): StatisticType {
  switch (metric) {
    case 'calories':       return 'sum';
    case 'sleep':          return 'columnrange';
    case 'active_minutes': return 'sum';
    default:               return 'sum' as StatisticType;
  }
}

function localDateStr(d: Date): string {
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export class HealthHeatmapView extends ItemView {
  private currentMetric: MetricType = 'steps';
  private renderer?: { destroy(): void };
  private contentEl!: HTMLElement;
  private btnMap: Map<MetricType, HTMLButtonElement> = new Map();

  constructor(
    leaf: WorkspaceLeaf,
    private oauthManager: OAuthManager,
    private healthClient: HealthClient,
    private dataProcessor: DataProcessor,
    private cacheManager: CacheManager
  ) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_HEALTH_HEATMAP; }
  getDisplayText(): string { return 'Health Heatmap'; }
  getIcon(): string { return 'activity'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('health-heatmap-panel');

    // --- メトリック選択ボタンバー ---
    const btnBar = root.createDiv({ cls: 'health-heatmap-btn-bar' });
    for (const { key, label } of PANEL_METRICS) {
      const btn = btnBar.createEl('button', {
        text: label,
        cls: 'health-heatmap-metric-btn',
      }) as HTMLButtonElement;

      if (key === this.currentMetric) btn.addClass('is-active');

      btn.addEventListener('click', async () => {
        this.currentMetric = key;
        this.btnMap.forEach((b, k) => {
          k === key ? b.addClass('is-active') : b.removeClass('is-active');
        });
        await this.refreshContent();
      });

      this.btnMap.set(key, btn);
    }

    // --- コンテンツエリア ---
    this.contentEl = root.createDiv({ cls: 'health-heatmap-content' });

    await this.refreshContent();
  }

  async onClose(): Promise<void> {
    this.renderer?.destroy();
  }

  private async refreshContent(): Promise<void> {
    this.contentEl.empty();
    this.renderer?.destroy();
    this.renderer = undefined;

    const params = this.buildParams();

    try {
      const statisticType = resolveStatisticType(params.metric);
      const cacheKey = this.cacheManager.buildKey(
        params.metric,
        params.startDate,
        params.endDate,
        String(params.agg),
        statisticType
      );

      let data = (await this.cacheManager.get(cacheKey)) as
        | HeatmapDataPoint[]
        | HeatmapDataPointFull[]
        | SleepColumnRangePoint[]
        | null;

      if (!data) {
        const raw = await this.healthClient.fetch(
          params.metric,
          params.startDate,
          params.endDate,
          params.agg
        );
        data = this.dataProcessor.process(raw, statisticType);
        await this.cacheManager.set(cacheKey, data);
      }

      if (params.metric === 'sleep') {
        const renderer = new SleepColumnRangeRenderer(this.contentEl, params);
        this.renderer = renderer;
        renderer.paint(data as SleepColumnRangePoint[]);
      } else {
        const renderer = new HeatmapRenderer(this.contentEl, params);
        this.renderer = renderer;
        renderer.paint(data as HeatmapDataPoint[] | HeatmapDataPointFull[]);
      }
    } catch (err) {
      const msg =
        err instanceof AuthError && err.code === 'NOT_AUTHENTICATED'
          ? '未認証: プラグイン設定から OAuth 認証を行ってください。'
          : err instanceof ApiError
          ? `API エラー: ${err.code} (HTTP ${err.statusCode ?? '?'})`
          : `エラー: ${err instanceof Error ? err.message : String(err)}`;

      this.contentEl.createEl('div', { cls: 'health-heatmap-error', text: `\u26a0 ${msg}` });
    }
  }

  private buildParams(): HeatmapBlockParams {
    const today = new Date();
    const endDate = localDateStr(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 13);
    const startDate = localDateStr(start);

    return {
      metric:          this.currentMetric,
      range:           14,
      agg:             2,
      startDate,
      endDate,
      heartRateMetric: 'average',
      calorieMetric:   'sum',
      sleepMetric:     'columnrange',
      activeMetric:    'sum',
      theme:           'light',
    };
  }
}
