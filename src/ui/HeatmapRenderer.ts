import { HeatmapBlockParams, HeatmapDataPoint, HeatmapDataPointFull, MetricType } from '../types';

// セルサイズ・レイアウト定数
const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;
const LABEL_LEFT = 44; // 時刻ラベル幅
const LABEL_TOP = 28;  // 日付ラベル高さ

// 日次換算のカラースケール (agg に応じてしきい値を比例縮小)
const DAILY_SCALES: Record<
  MetricType,
  { thresholds: number[]; colors: string[] }
> = {
  steps: {
    thresholds: [1000, 5000, 8000, 10000],
    colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
  heart_rate: {
    thresholds: [50, 60, 70, 80],
    colors: ['#ebedf0', '#6fc3f7', '#40c463', '#e4a836', '#e05d5d'],
  },
  calories: {
    thresholds: [500, 1000, 1500, 2000],
    colors: ['#ebedf0', '#9be9a8', '#40c463', '#e4a836', '#e05d5d'],
  },
  sleep: {
    thresholds: [0.3, 0.5, 0.7, 0.9],
    colors: ['#e05d5d', '#e4a836', '#40c463', '#30a14e', '#216e39'],
  },
  active_minutes: {
    thresholds: [10, 20, 30, 45],
    colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
};

export class HeatmapRenderer {
  constructor(
    private container: HTMLElement,
    private params: HeatmapBlockParams
  ) {}

  paint(data: HeatmapDataPoint[] | HeatmapDataPointFull[]): void {
    const { range, agg, startDate, theme, metric } = this.params;
    const rows = Math.floor(24 / agg); // 縦方向の時間スロット数

    // データを HeatmapDataPoint[] に正規化
    const normalized = this.normalize(data);
    const valueMap = new Map<string, number>(normalized.map(d => [d.date, d.value]));

    // X 軸: 日付リスト (startDate〜endDate の全日)
    const dates = this.buildDates(startDate, this.params.endDate);

    // カラー関数 (agg に応じてしきい値をスケール)
    const colorFn = this.makeColorFn(metric, agg);

    // SVG サイズ
    const svgW = LABEL_LEFT + dates.length * STEP;
    const svgH = LABEL_TOP + rows * STEP;

    const wrapper = this.container.createDiv({ cls: 'health-heatmap-wrapper' });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));
    if (theme === 'dark') svg.setAttribute('data-theme', 'dark');

    // --- X 軸: 日付ラベル (日にちのみ、土=水色・火=赤) ---
    const interval = range <= 14 ? 1 : range <= 45 ? 7 : 14;
    dates.forEach((date, col) => {
      if (col % interval !== 0) return;
      const x = LABEL_LEFT + col * STEP + CELL / 2;
      const dow = new Date(date + 'T00:00:00').getDay(); // 0=日 6=土
      const dowClass = dow === 6 ? 'hh-day-sat' : dow === 0 ? 'hh-day-sun' : null;
      const dayNum = String(parseInt(date.slice(8))); // 先頭ゼロなしの日にち
      const text = mkText(NS, String(x), String(LABEL_TOP - 5), dayNum, 'middle');
      if (dowClass) text.setAttribute('class', dowClass);
      svg.appendChild(text);
    });

    // --- Y 軸: 時刻ラベル + セル ---
    for (let row = 0; row < rows; row++) {
      const startHour = row * agg;
      const y = LABEL_TOP + row * STEP;

      // 時刻ラベル
      svg.appendChild(
        mkText(NS, String(LABEL_LEFT - 4), String(y + CELL / 2 + 3), pad(startHour) + ':00', 'end')
      );

      // 各日のセル
      dates.forEach((date, col) => {
        const key = agg >= 24 ? date : `${date}T${pad(startHour)}:00`;
        const value = valueMap.get(key) ?? 0;
        const x = LABEL_LEFT + col * STEP;

        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(CELL));
        rect.setAttribute('height', String(CELL));
        rect.setAttribute('rx', '2');
        rect.setAttribute('fill', colorFn(value));

        // ツールチップ
        const endHour = agg < 24 ? `–${pad(startHour + agg)}:00` : '';
        const title = document.createElementNS(NS, 'title');
        title.textContent = `${date} ${pad(startHour)}:00${endHour}  ${value.toLocaleString()}`;
        rect.appendChild(title);

        svg.appendChild(rect);
      });
    }

    wrapper.appendChild(svg);
  }

  destroy(): void {}

  // HeatmapDataPointFull → HeatmapDataPoint (主値を選択)
  private normalize(data: (HeatmapDataPoint | HeatmapDataPointFull)[]): HeatmapDataPoint[] {
    return data.map(d =>
      'value' in d ? (d as HeatmapDataPoint) : { date: d.date, value: d.avg ?? d.sum ?? d.max ?? 0 }
    );
  }

  // startDate〜endDate の全日付を生成 (両端含む、ローカル時刻基準)
  private buildDates(startDate: string, endDate: string): string[] {
    const result: string[] = [];
    const cur = new Date(startDate + 'T00:00:00');
    const last = new Date(endDate + 'T00:00:00');
    while (cur <= last) {
      result.push(localDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  // agg に応じてしきい値を比例縮小したカラー関数を返す
  private makeColorFn(metric: MetricType, agg: number): (value: number) => string {
    const base = DAILY_SCALES[metric] ?? DAILY_SCALES.steps;
    const factor = agg / 24;
    // heart_rate と sleep はスケーリング不要 (絶対値ベース)
    const noScale = metric === 'heart_rate' || metric === 'sleep';
    const thresholds = noScale
      ? base.thresholds
      : base.thresholds.map(t => Math.max(1, Math.round(t * factor)));
    const colors = base.colors;

    return (value: number) => {
      if (value <= 0) return colors[0];
      for (let i = 0; i < thresholds.length; i++) {
        if (value < thresholds[i]) return colors[i];
      }
      return colors[colors.length - 1];
    };
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mkText(
  NS: string, x: string, y: string, text: string, anchor: string
): SVGTextElement {
  const el = document.createElementNS(NS, 'text') as SVGTextElement;
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('font-size', '9');
  el.setAttribute('fill', 'currentColor');
  el.textContent = text;
  return el;
}
