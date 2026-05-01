import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { OAuthManager, AuthError } from '../auth/OAuthManager';
import { HealthClient, ApiError } from '../api/HealthClient';
import { DataProcessor } from '../data/DataProcessor';
import { CacheManager } from '../data/CacheManager';
import { HeatmapRenderer } from './HeatmapRenderer';
import {
  MetricType,
  HeartRateMetric,
  CalorieMetric,
  SleepMetric,
  ActiveMetric,
  HeatmapBlockParams,
  StatisticType,
  HeatmapDataPoint,
  HeatmapDataPointFull,
} from '../types';

export class HeatmapBlock {
  constructor(
    private oauthManager: OAuthManager,
    private healthClient: HealthClient,
    private dataProcessor: DataProcessor,
    private cacheManager: CacheManager
  ) {}

  async render(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    let params: HeatmapBlockParams;
    try {
      params = parseBlockParams(source);
    } catch (e) {
      createErrorEl(el, e instanceof Error ? e.message : String(e));
      return;
    }

    const child = new HeatmapRenderChild(el);
    ctx.addChild(child);

    try {
      const statisticType = resolveStatisticType(params);

      const cacheKey = this.cacheManager.buildKey(
        params.metric,
        params.startDate,
        params.endDate,
        String(params.agg),
        statisticType
      );

      let data = await this.cacheManager.get(cacheKey) as
        | HeatmapDataPoint[]
        | HeatmapDataPointFull[]
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

      const renderer = new HeatmapRenderer(el, params);
      child.renderer = renderer;
      renderer.paint(data);
    } catch (err) {
      if (err instanceof AuthError && err.code === 'NOT_AUTHENTICATED') {
        createErrorEl(el, '未認証: プラグイン設定から Fitbit OAuth 認証を行ってください。');
      } else if (err instanceof ApiError) {
        createErrorEl(el, `API エラー: ${err.code} (HTTP ${err.statusCode ?? '?'})`);
      } else {
        createErrorEl(el, `エラー: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

class HeatmapRenderChild extends MarkdownRenderChild {
  renderer?: HeatmapRenderer;

  constructor(el: HTMLElement) {
    super(el);
  }

  onunload(): void {
    this.renderer?.destroy();
  }
}

export function parseBlockParams(source: string): HeatmapBlockParams {
  const raw: Record<string, string> = {};
  for (const line of source.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) raw[key] = val;
  }

  const metric = raw['metric'] as MetricType;
  const validMetrics: MetricType[] = [
    'steps', 'heart_rate', 'calories', 'sleep', 'active_minutes',
  ];
  if (!metric || !validMetrics.includes(metric)) {
    throw new Error(`metric が不正です: "${raw['metric'] ?? '未指定'}"`);
  }

  const range = Math.max(1, parseInt(raw['range'] ?? '7') || 7);
  const aggRaw = parseInt(raw['agg'] ?? '1') || 1;
  const agg = Math.min(24, Math.max(1, aggRaw));

  const todayLocal = new Date();
  const endDate = localDateStr(todayLocal);
  const startDate = raw['startDate'] ?? (() => {
    const d = new Date(todayLocal);
    d.setDate(d.getDate() - (range - 1));
    return localDateStr(d);
  })();

  return {
    metric,
    range,
    agg,
    startDate,
    endDate,
    heartRateMetric: (raw['heartRateMetric'] as HeartRateMetric) ?? 'average',
    calorieMetric: (raw['calorieMetric'] as CalorieMetric) ?? 'sum',
    sleepMetric: (raw['sleepMetric'] as SleepMetric) ?? 'minutes_asleep',
    activeMetric: (raw['activeMetric'] as ActiveMetric) ?? 'sum',
    theme: (raw['theme'] as 'light' | 'dark') ?? 'light',
  };
}

function resolveStatisticType(params: HeatmapBlockParams): StatisticType {
  switch (params.metric) {
    case 'heart_rate':     return params.heartRateMetric;
    case 'calories':       return params.calorieMetric;
    case 'sleep':          return params.sleepMetric;
    case 'active_minutes': return params.activeMetric;
    default:               return 'sum' as StatisticType;
  }
}

function createErrorEl(container: HTMLElement, message: string): void {
  container.createEl('div', {
    cls: 'health-heatmap-error',
    text: `⚠ health-heatmap: ${message}`,
  });
}

function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
