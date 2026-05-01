import { HeatmapBlockParams, HeatmapDataPoint, HeatmapDataPointFull, MetricType } from '../types';

// セルサイズ・レイアウト定数
const CELL = 14;
const GAP = 2;
const STEP = CELL + GAP;
const LABEL_LEFT = 44; // 時刻ラベル幅
const LABEL_TOP = 28;  // 日付ラベル高さ

// steps 用: 16段階グリーングラデーション (index 0 = グレー、1〜15 = 薄緑→濃緑)
const STEPS_COLORS: string[] = [
  '#ebedf0', // 0: データなし (グレー)
  '#d7f0dc', // 1
  '#c4ead0', // 2
  '#b0e3c3', // 3
  '#9be9a8', // 4
  '#85d99c', // 5
  '#6cd08e', // 6
  '#53c67f', // 7
  '#40c463', // 8
  '#34b558', // 9
  '#29a14d', // 10
  '#1e8d42', // 11
  '#147a37', // 12
  '#0c662d', // 13
  '#085222', // 14
  '#063d19', // 15
];

// calories 用: 16段階レッドグラデーション (index 0 = グレー、1〜15 = 薄赤→濃赤)
const CALORIES_COLORS: string[] = [
  '#ebedf0', // 0: データなし (グレー)
  '#fde8e8', // 1
  '#fbc7c7', // 2
  '#f8a6a6', // 3
  '#f58585', // 4
  '#f16464', // 5
  '#ec4444', // 6
  '#e52a2a', // 7
  '#db1515', // 8
  '#cb0d0d', // 9
  '#ba0808', // 10
  '#a70505', // 11
  '#920303', // 12
  '#7b0202', // 13
  '#620101', // 14
  '#4a0101', // 15
];

// sleep 用: 16段階ブルーグラデーション (index 0 = グレー、1〜15 = 薄青→濃青)
// minutes_asleep: 各時間スロットの睡眠分数。少ない→多いほど濃く
const SLEEP_COLORS: string[] = [
  '#ebedf0', // 0: データなし (グレー)
  '#d7e6f5', // 1
  '#bfd8f1', // 2
  '#a7caec', // 3
  '#8fbce7', // 4
  '#76ade2', // 5
  '#5c9fdc', // 6
  '#4291d7', // 7
  '#2883cd', // 8
  '#1974bb', // 9
  '#1265a8', // 10
  '#0c5695', // 11
  '#084782', // 12
  '#053870', // 13
  '#032a5d', // 14
  '#011c4a', // 15
];

// active_minutes 用: 16段階オレンジグラデーション (index 0 = グレー、1〜15 = 薄→濃)
const ACTIVE_COLORS: string[] = [
  '#ebedf0', // 0: データなし (グレー)
  '#fef2e2', // 1
  '#fde3c3', // 2
  '#fbd3a5', // 3
  '#f9c288', // 4
  '#f6af6a', // 5
  '#f29b4e', // 6
  '#ed8718', // 7
  '#da7410', // 8
  '#be620a', // 9
  '#a35108', // 10
  '#874206', // 11
  '#6c3304', // 12
  '#592803', // 13
  '#471d02', // 14
  '#361302', // 15
];

// 日次換算のカラースケール (heart_rate のみ固定しきい値)
const DAILY_SCALES: Record<'heart_rate', { thresholds: number[]; colors: string[] }> = {
  heart_rate: {
    thresholds: [50, 60, 70, 80],
    colors: ['#ebedf0', '#6fc3f7', '#40c463', '#e4a836', '#e05d5d'],
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

    // カラー関数 (steps は min/max から動的生成、その他は固定しきい値)
    const colorFn = this.makeColorFn(metric, agg, normalized);

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

  // カラー関数を生成 (steps/calories/sleep は動的16段階、その他は固定しきい値)
  private makeColorFn(
    metric: MetricType,
    agg: number,
    data: HeatmapDataPoint[]
  ): (value: number) => string {
    if (metric === 'steps')          return this.makeDynamicColorFn(data, STEPS_COLORS);
    if (metric === 'calories')       return this.makeDynamicColorFn(data, CALORIES_COLORS);
    if (metric === 'sleep')          return this.makeDynamicColorFn(data, SLEEP_COLORS);
    if (metric === 'active_minutes') return this.makeDynamicColorFn(data, ACTIVE_COLORS);

    // heart_rate のみ固定しきい値
    const base = DAILY_SCALES['heart_rate'];
    const { thresholds, colors } = base;

    return (value: number) => {
      if (value <= 0) return colors[0];
      for (let i = 0; i < thresholds.length; i++) {
        if (value < thresholds[i]) return colors[i];
      }
      return colors[colors.length - 1];
    };
  }

  // データの min/max から16段階に動的分類する汎用カラー関数
  private makeDynamicColorFn(
    data: HeatmapDataPoint[],
    colors: string[]  // colors[0]=グレー、colors[1〜15]=グラデーション
  ): (value: number) => string {
    const positiveValues = data.filter(d => d.value > 0).map(d => d.value);
    if (positiveValues.length === 0) return () => colors[0];

    const min = Math.min(...positiveValues);
    const max = Math.max(...positiveValues);
    const range = max - min;

    return (value: number) => {
      if (value <= 0) return colors[0];
      if (range === 0) return colors[colors.length - 1];
      // 第1階級(最小値付近) → colors[0](グレー)、第16階級(最大値) → colors[15]
      const idx = Math.min(colors.length - 1, Math.floor((value - min) / range * colors.length));
      return colors[idx];
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
