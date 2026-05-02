# Sleep Column Range 表示設計

## 概要

`metric: sleep` の表示を、現行の SVG ヒートマップから **Highcharts Column Range チャート**に切り替える。  
データソースは現行の **Fitbit Sleep API をそのまま使用**する。`FitbitSleepRecord` にすでに `startTime` / `endTime` が含まれているため、API・HealthClient の変更は不要。

---

## 1. API・HealthClient

**変更なし。**

現行エンドポイント `/1.2/user/-/sleep/date/{startDate}/{endDate}.json` のレスポンスに、
すでに必要なフィールドが含まれている。

```typescript
// types.ts — FitbitSleepRecord（現行、変更なし）
export interface FitbitSleepRecord {
  dateOfSleep: string;   // 就寝日: "2024-06-30"
  startTime:   string;   // 就寝時刻: "2024-06-30T23:00:00.000"
  endTime:     string;   // 起床時刻: "2024-07-01T07:30:00.000"
  minutesAsleep: number;
  efficiency:    number;
  isMainSleep:   boolean;
  // ...
}
```

---

## 2. 型定義の変更（types.ts）

追加するのは `SleepColumnRangePoint` のみ。

```typescript
// Renderer に渡すデータ形式（新規追加）
export interface SleepColumnRangePoint {
  date: string;   // 就寝日 (YYYY-MM-DD)
  low:  number;   // 就寝時刻（小数時間） 例: 23.5 = 23:30
  high: number;   // 起床時刻（小数時間）日をまたぐ場合は 24 超え 例: 31.5 = 翌 07:30
}
```

`SleepMetric` 型と `FitbitRawData` の `sleep` ケースは変更なし。

---

## 3. DataProcessor の変更

`processSleep()` の出力を `HeatmapDataPoint[]` から `SleepColumnRangePoint[]` に変更する。

```typescript
// Before: minutesAsleep / efficiency を返していた
private processSleep(
  agg: number,
  records: FitbitSleepRecord[],
  metric: SleepMetric
): HeatmapDataPoint[] { ... }

// After: startTime / endTime から low / high を計算して返す
private processSleep(
  _agg: number,
  records: FitbitSleepRecord[]
): SleepColumnRangePoint[] {
  const mainByDate = groupMainSleep(records); // 既存ヘルパーをそのまま利用

  return Array.from(mainByDate.values())
    .map(rec => {
      const midnight = new Date(rec.dateOfSleep + 'T00:00:00').getTime();
      const startMs  = new Date(rec.startTime).getTime();
      const endMs    = new Date(rec.endTime).getTime();

      return {
        date: rec.dateOfSleep,
        low:  round2((startMs - midnight) / 3_600_000),
        high: round2((endMs   - midnight) / 3_600_000),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

#### 変換例

| dateOfSleep | startTime | endTime | low | high |
|---|---|---|---|---|
| 2024-06-30 | 23:00 | 翌 07:30 | 23.0 | 31.5 |
| 2024-07-01 | 00:30 | 08:00 | 0.5 | 8.0 |
| 2024-07-02 | 22:45 | 翌 06:15 | 22.75 | 30.25 |

`process()` のシグネチャも戻り値の Union に `SleepColumnRangePoint[]` を追加する。

```typescript
process(
  raw: FitbitRawData,
  statisticType: StatisticType
): HeatmapDataPoint[] | HeatmapDataPointFull[] | SleepColumnRangePoint[] {
  switch (raw.kind) {
    case 'sleep':
      return this.processSleep(raw.agg, raw.records);
    // ...既存ケース
  }
}
```

---

## 4. HeatmapBlock の変更（分岐追加）

`metric === 'sleep'` のとき `SleepColumnRangeRenderer` を使う。

```typescript
if (params.metric === 'sleep') {
  const renderer = new SleepColumnRangeRenderer(container, params);
  renderer.paint(data as SleepColumnRangePoint[]);
} else {
  const renderer = new HeatmapRenderer(container, params);
  renderer.paint(data as HeatmapDataPoint[] | HeatmapDataPointFull[]);
}
```

---

## 5. SleepColumnRangeRenderer（新規作成）

### ファイル

`src/ui/SleepColumnRangeRenderer.ts`

### Y 軸設計（就寝日基準・24 超え表現）

就寝日の 00:00 を 0 として、時刻を小数時間で表す。  
日をまたいで起床した場合、起床時刻は 24 を超える値になる。

```
Y 軸の値 → 表示ラベル
  18.0  →  "18:00"
  20.0  →  "20:00"
  22.0  →  "22:00"
  24.0  →  "00:00"  ← 翌 00:00
  26.0  →  "02:00"
  28.0  →  "04:00"
  30.0  →  "06:00"
  32.0  →  "08:00"
  36.0  →  "12:00"
```

変換式: `Math.floor(hours) % 24` → `HH:MM` 文字列

### Highcharts 設定

```typescript
import Highcharts from 'highcharts';
import HighchartsMore from 'highcharts/highcharts-more';
HighchartsMore(Highcharts);

Highcharts.chart(container, {
  chart: { type: 'columnrange' },

  xAxis: {
    categories: points.map(p => p.date),
    labels: {
      // 表示間隔を range に応じて間引く
      step: points.length > 60 ? 7 : points.length > 14 ? 3 : 1,
      formatter() { return formatDateLabel(String(this.value)); },
    },
  },

  yAxis: {
    title: { text: null },
    min: 18,          // デフォルト下限: 18:00
    max: 36,          // デフォルト上限: 翌 12:00
    tickInterval: 2,
    labels: {
      formatter() { return hoursToTimeStr(Number(this.value)); },
    },
  },

  tooltip: {
    formatter() {
      const low  = hoursToTimeStr(this.point.low);
      const high = hoursToTimeStr(this.point.high);
      const dur  = hoursToHHMM(this.point.high - this.point.low);
      return `${this.x}<br>就寝: ${low}<br>起床: ${high}<br>睡眠時間: ${dur}`;
    },
  },

  series: [{
    type: 'columnrange',
    name: 'Sleep',
    data: points.map((p, i) => [i, p.low, p.high]),
    color: '#5b8dee',
  }],

  legend: { enabled: false },
  credits: { enabled: false },
});
```

### ヘルパー関数

```typescript
// 小数時間 → "HH:MM"（24 超え対応）
function hoursToTimeStr(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours % 1) * 60);
  return `${pad(h)}:${pad(m)}`;
}

// 小数時間差 → "Xh Ym"
function hoursToHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
```

---

## 6. コードブロックパラメータの変更

`sleepMetric` と `aggregationPeriod` は sleep では無効になる。

```markdown
```health-heatmap
metric: sleep
range: 90
startDate: 2025-01-01
theme: dark
```
```

---

## 7. 依存ライブラリの追加

```bash
npm install highcharts
```

`esbuild.config.mjs` の `external` リストには追加しない（バンドル対象とする）。

---

## 8. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/types.ts` | 変更 | `SleepColumnRangePoint` 型を追加 |
| `src/data/DataProcessor.ts` | 変更 | `processSleep()` を `startTime`/`endTime` → `SleepColumnRangePoint[]` に変更 |
| `src/ui/HeatmapBlock.ts` | 変更 | `metric === 'sleep'` 時に `SleepColumnRangeRenderer` へ分岐 |
| `src/ui/SleepColumnRangeRenderer.ts` | 新規 | Highcharts columnrange 描画クラス |
| `package.json` | 変更 | `highcharts` 依存追加 |

HealthClient・HealthClient のテスト・認証まわりは**変更なし**。

---

## 9. 未決事項

- **昼寝の扱い**: 同日に複数セッションがある場合、現設計では `isMainSleep=true` を優先し最長を採用。昼寝も表示したい場合は同一カテゴリに複数バーを重ねる対応が必要（要確認）。
- **Y 軸の自動調整**: min/max をデータの実際の範囲から算出する実装も検討（早起き・深夜帰宅ユーザー対応）。
- **Highcharts ライセンス**: 商用利用には有償ライセンスが必要。非商用プラグインとして公開する場合は Creative Commons ライセンスの適用範囲を確認すること。
