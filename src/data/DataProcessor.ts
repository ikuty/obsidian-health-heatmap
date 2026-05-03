import {
  FitbitRawData,
  FitbitDailyEntry,
  FitbitHeartDailyEntry,
  FitbitIntradayEntry,
  FitbitSleepRecord,
  MetricType,
  StatisticType,
  HeartRateMetric,
  CalorieMetric,
  ActiveMetric,
  HeatmapDataPoint,
  HeatmapDataPointFull,
  SleepColumnRangePoint,
} from '../types';

export class DataProcessor {
  process(
    raw: FitbitRawData,
    statisticType: StatisticType
  ): HeatmapDataPoint[] | HeatmapDataPointFull[] | SleepColumnRangePoint[] {
    switch (raw.kind) {
      case 'daily':
        return this.processDaily(raw.metric, raw.entries, statisticType);
      case 'intraday':
        return this.processIntraday(raw.metric, raw.agg, raw.days, statisticType);
      case 'sleep':
        return this.processSleep(raw.records);
    }
  }

  // --- Daily ---

  private processDaily(
    metric: MetricType,
    entries: (FitbitDailyEntry | FitbitHeartDailyEntry)[],
    statisticType: StatisticType
  ): HeatmapDataPoint[] | HeatmapDataPointFull[] {
    if (metric === 'heart_rate') {
      return this.processDailyHeart(entries as FitbitHeartDailyEntry[], statisticType as HeartRateMetric);
    }
    return (entries as FitbitDailyEntry[]).map(e => ({
      date: e.dateTime,
      value: parseFloat(e.value) || 0,
    }));
  }

  private processDailyHeart(
    entries: FitbitHeartDailyEntry[],
    metric: HeartRateMetric
  ): HeatmapDataPoint[] | HeatmapDataPointFull[] {
    return entries.map(e => {
      const resting = e.value.restingHeartRate ?? 0;
      if (metric === 'all') {
        const zones = e.value.heartRateZones;
        const fatBurn = zones.find(z => z.name === 'Fat Burn')?.min ?? 0;
        return { date: e.dateTime, avg: resting, min: fatBurn, max: resting, count: 1 };
      }
      return { date: e.dateTime, value: resting };
    });
  }

  // --- Intraday ---

  private processIntraday(
    metric: MetricType,
    agg: number,
    days: Record<string, FitbitIntradayEntry[]>,
    statisticType: StatisticType
  ): HeatmapDataPoint[] | HeatmapDataPointFull[] {
    const result: (HeatmapDataPoint | HeatmapDataPointFull)[] = [];

    for (const [date, entries] of Object.entries(days)) {
      const slots = aggregateIntoSlots(entries, agg);

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const startHour = slotIndex * agg;
        const key = `${date}T${pad(startHour)}:00`;
        const values = slots[slotIndex].filter(v => v > 0);

        if (metric === 'heart_rate') {
          result.push(...this.makeHeartSlot(key, values, statisticType as HeartRateMetric));
        } else if (metric === 'calories') {
          result.push(this.makeCalorieSlot(key, slots[slotIndex], statisticType as CalorieMetric));
        } else {
          // steps, active_minutes: sum
          result.push({ date: key, value: slots[slotIndex].reduce((a, v) => a + v, 0) });
        }
      }
    }

    return result;
  }

  private makeHeartSlot(
    key: string,
    values: number[],
    metric: HeartRateMetric
  ): HeatmapDataPoint[] | HeatmapDataPointFull[] {
    if (values.length === 0) return [{ date: key, value: 0 }];

    const avg = round1(values.reduce((a, v) => a + v, 0) / values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (metric === 'all') return [{ date: key, avg, min, max, count: values.length }];
    if (metric === 'min') return [{ date: key, value: min }];
    if (metric === 'max') return [{ date: key, value: max }];
    return [{ date: key, value: avg }];
  }

  private makeCalorieSlot(
    key: string,
    values: number[],
    metric: CalorieMetric
  ): HeatmapDataPoint | HeatmapDataPointFull {
    if (values.length === 0) return { date: key, value: 0 };

    const sum = round1(values.reduce((a, v) => a + v, 0));
    const avg = round1(sum / values.length);
    const min = round1(Math.min(...values));
    const max = round1(Math.max(...values));

    if (metric === 'all') return { date: key, sum, avg, min, max, count: values.length };
    if (metric === 'average') return { date: key, value: avg };
    if (metric === 'min') return { date: key, value: min };
    if (metric === 'max') return { date: key, value: max };
    return { date: key, value: sum };
  }

  // --- Sleep ---

  private processSleep(records: FitbitSleepRecord[]): SleepColumnRangePoint[] {
    const mainByDate = groupMainSleep(records);

    return Array.from(mainByDate.values())
      .map(rec => {
        const startDt = new Date(rec.startTime);
        const endMs   = new Date(rec.endTime).getTime();

        // 基準 00:00 の決定:
        //   入眠が 12:00 以降 (夕方〜深夜) → 翌 00:00 を基準 → 入眠は負の値になる
        //   入眠が 12:00 未満 (深夜過ぎ〜朝) → 当日 00:00 を基準
        const dateMidnight = new Date(startDt);
        dateMidnight.setHours(0, 0, 0, 0);
        const refMs = startDt.getHours() >= 12
          ? dateMidnight.getTime() + 24 * 3_600_000
          : dateMidnight.getTime();

        return {
          date: rec.dateOfSleep,
          low:  round2((startDt.getTime() - refMs) / 3_600_000),
          high: round2((endMs             - refMs) / 3_600_000),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

// Group sleep records by dateOfSleep; prefer isMainSleep=true, else first record
function groupMainSleep(records: FitbitSleepRecord[]): Map<string, FitbitSleepRecord> {
  const map = new Map<string, FitbitSleepRecord>();
  for (const rec of records) {
    const existing = map.get(rec.dateOfSleep);
    if (!existing || (!existing.isMainSleep && rec.isMainSleep)) {
      map.set(rec.dateOfSleep, rec);
    }
  }
  return map;
}

// Split 1-min entries array into agg-hour buckets (array of value arrays per slot)
function aggregateIntoSlots(entries: FitbitIntradayEntry[], agg: number): number[][] {
  const slotsPerDay = Math.floor(24 / agg);
  const slots: number[][] = Array.from({ length: slotsPerDay }, () => []);

  for (const entry of entries) {
    const [h, m] = entry.time.split(':').map(Number);
    const totalMin = h * 60 + m;
    const slotIndex = Math.floor(totalMin / (agg * 60));
    if (slotIndex < slotsPerDay) slots[slotIndex].push(entry.value);
  }

  return slots;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
