export type MetricType = 'steps' | 'heart_rate' | 'calories' | 'sleep' | 'active_minutes';
export type HeartRateMetric = 'average' | 'min' | 'max' | 'all';
export type CalorieMetric = 'sum' | 'average' | 'min' | 'max' | 'all';
export type SleepMetric = 'columnrange';
export type ActiveMetric = 'sum' | 'average' | 'min' | 'max' | 'all';
export type StatisticType = HeartRateMetric | CalorieMetric | SleepMetric | ActiveMetric;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthSettings {
  clientId: string;
  clientSecret: string;
  tokenSet?: TokenSet;
  lastConfigured?: number;
}

export interface CacheSettings {
  ttlMs: number;
  maxSizeBytes: number;
}

export interface UiSettings {
  defaultTheme: 'light' | 'dark';
}

export interface PluginData {
  auth: AuthSettings;
  cache: CacheSettings;
  ui: UiSettings;
}

// ---- Fitbit API response types ----

export interface FitbitDailyEntry {
  dateTime: string;   // YYYY-MM-DD
  value: string;      // numeric string
}

export interface FitbitHeartZone {
  name: string;
  min: number;
  max: number;
  minutes: number;
}

export interface FitbitHeartDailyEntry {
  dateTime: string;
  value: {
    restingHeartRate?: number;
    heartRateZones: FitbitHeartZone[];
  };
}

export interface FitbitIntradayEntry {
  time: string;   // HH:MM:SS
  value: number;
}

export interface FitbitSleepLevel {
  dateTime: string;
  level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'restless' | 'awake';
  seconds: number;
}

export interface FitbitSleepRecord {
  dateOfSleep: string;
  duration: number;
  efficiency: number;
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  isMainSleep: boolean;
  type?: 'classic' | 'stages';
  levels?: {
    data: FitbitSleepLevel[];
    shortData?: FitbitSleepLevel[];
    summary: Record<string, { count: number; minutes: number }>;
  };
}

export type FitbitRawData =
  | { kind: 'daily'; metric: MetricType; entries: (FitbitDailyEntry | FitbitHeartDailyEntry)[] }
  | { kind: 'intraday'; metric: MetricType; agg: number; days: Record<string, FitbitIntradayEntry[]> }
  | { kind: 'sleep'; agg: number; records: FitbitSleepRecord[] };

// ---- Sleep column range types ----

export interface SleepColumnRangePoint {
  date: string;   // 就寝日 (YYYY-MM-DD)
  low: number;    // 就寝時刻（小数時間） 例: 23.5 = 23:30
  high: number;   // 起床時刻（小数時間）日をまたぐ場合は 24 超え 例: 31.5 = 翌 07:30
}

// ---- Heatmap UI types ----

export interface HeatmapDataPoint {
  date: string;
  value: number;
}

export interface HeatmapDataPointFull {
  date: string;
  avg?: number;
  min?: number;
  max?: number;
  sum?: number;
  count?: number;
}

export interface HeatmapBlockParams {
  metric: MetricType;
  range: number;
  agg: number;       // 1-24: hours per time slot
  startDate: string;
  endDate: string;
  heartRateMetric: HeartRateMetric;
  calorieMetric: CalorieMetric;
  sleepMetric: SleepMetric;
  activeMetric: ActiveMetric;
  theme: 'light' | 'dark';
}
