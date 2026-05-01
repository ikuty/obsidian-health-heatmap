import { requestUrl } from 'obsidian';
import { OAuthManager } from '../auth/OAuthManager';
import {
  MetricType,
  FitbitRawData,
  FitbitDailyEntry,
  FitbitHeartDailyEntry,
  FitbitIntradayEntry,
  FitbitSleepRecord,
} from '../types';

const FITBIT_BASE = 'https://api.fitbit.com';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public statusCode?: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export class HealthClient {
  constructor(private oauthManager: OAuthManager) {}

  async fetch(
    metric: MetricType,
    startDate: string,
    endDate: string,
    agg: number
  ): Promise<FitbitRawData> {
    const token = await this.oauthManager.getAccessToken();

    if (metric === 'sleep') {
      return this.fetchSleep(token, startDate, endDate, agg);
    }

    if (agg >= 24) {
      return this.fetchDaily(token, metric, startDate, endDate);
    } else {
      return this.fetchIntraday(token, metric, startDate, endDate, agg);
    }
  }

  // --- Daily endpoints ---

  private async fetchDaily(
    token: string,
    metric: MetricType,
    startDate: string,
    endDate: string
  ): Promise<FitbitRawData> {
    switch (metric) {
      case 'steps':
      case 'calories':
        return this.fetchDailyActivity(token, metric, startDate, endDate);
      case 'heart_rate':
        return this.fetchDailyHeart(token, startDate, endDate);
      case 'active_minutes':
        return this.fetchDailyActiveMinutes(token, startDate, endDate);
    }
  }

  private async fetchDailyActivity(
    token: string,
    metric: 'steps' | 'calories',
    startDate: string,
    endDate: string
  ): Promise<FitbitRawData> {
    const data = await this.get(
      token,
      `/1/user/-/activities/${metric}/date/${startDate}/${endDate}.json`
    );
    const entries = (data[`activities-${metric}`] ?? []) as FitbitDailyEntry[];
    return { kind: 'daily', metric, entries };
  }

  private async fetchDailyHeart(
    token: string,
    startDate: string,
    endDate: string
  ): Promise<FitbitRawData> {
    const data = await this.get(
      token,
      `/1/user/-/activities/heart/date/${startDate}/${endDate}.json`
    );
    const entries = (data['activities-heart'] ?? []) as FitbitHeartDailyEntry[];
    return { kind: 'daily', metric: 'heart_rate', entries };
  }

  private async fetchDailyActiveMinutes(
    token: string,
    startDate: string,
    endDate: string
  ): Promise<FitbitRawData> {
    const [fairlyData, veryData] = await Promise.all([
      this.get(token, `/1/user/-/activities/minutesFairlyActive/date/${startDate}/${endDate}.json`),
      this.get(token, `/1/user/-/activities/minutesVeryActive/date/${startDate}/${endDate}.json`),
    ]);

    const fairly = (fairlyData['activities-minutesFairlyActive'] ?? []) as FitbitDailyEntry[];
    const very = (veryData['activities-minutesVeryActive'] ?? []) as FitbitDailyEntry[];

    const veryMap = new Map(very.map(e => [e.dateTime, parseInt(e.value) || 0]));
    const entries: FitbitDailyEntry[] = fairly.map(e => ({
      dateTime: e.dateTime,
      value: String((parseInt(e.value) || 0) + (veryMap.get(e.dateTime) ?? 0)),
    }));

    return { kind: 'daily', metric: 'active_minutes', entries };
  }

  private async fetchSleep(
    token: string,
    startDate: string,
    endDate: string,
    agg: number
  ): Promise<FitbitRawData> {
    const data = await this.get(token, `/1.2/user/-/sleep/date/${startDate}/${endDate}.json`);
    const records = (data['sleep'] ?? []) as FitbitSleepRecord[];
    return { kind: 'sleep', agg, records };
  }

  // --- Intraday endpoints (1-min data, parallel per-day calls) ---

  private async fetchIntraday(
    token: string,
    metric: MetricType,
    startDate: string,
    endDate: string,
    agg: number
  ): Promise<FitbitRawData> {
    const dates = buildDateRange(startDate, endDate);

    const days: Record<string, FitbitIntradayEntry[]> = {};
    await Promise.all(
      dates.map(async date => {
        days[date] = await this.fetchIntradayForDate(token, metric, date);
      })
    );

    return { kind: 'intraday', metric, agg, days };
  }

  private async fetchIntradayForDate(
    token: string,
    metric: MetricType,
    date: string
  ): Promise<FitbitIntradayEntry[]> {
    switch (metric) {
      case 'steps':
      case 'calories': {
        const data = await this.get(
          token,
          `/1/user/-/activities/${metric}/date/${date}/1d/1min.json`
        );
        return (data[`activities-${metric}-intraday`]?.dataset ?? []) as FitbitIntradayEntry[];
      }
      case 'heart_rate': {
        const data = await this.get(
          token,
          `/1/user/-/activities/heart/date/${date}/1d/1min.json`
        );
        return (data['activities-heart-intraday']?.dataset ?? []) as FitbitIntradayEntry[];
      }
      case 'active_minutes': {
        const [fairlyData, veryData] = await Promise.all([
          this.get(token, `/1/user/-/activities/minutesFairlyActive/date/${date}/1d/1min.json`),
          this.get(token, `/1/user/-/activities/minutesVeryActive/date/${date}/1d/1min.json`),
        ]);
        const fairly = (fairlyData['activities-minutesFairlyActive-intraday']?.dataset ?? []) as FitbitIntradayEntry[];
        const very = (veryData['activities-minutesVeryActive-intraday']?.dataset ?? []) as FitbitIntradayEntry[];
        const veryMap = new Map(very.map((e: FitbitIntradayEntry) => [e.time, e.value]));
        return fairly.map((e: FitbitIntradayEntry) => ({
          time: e.time,
          value: e.value + (veryMap.get(e.time) ?? 0),
        }));
      }
      default:
        return [];
    }
  }

  // --- HTTP helper ---

  private async get(token: string, path: string): Promise<any> {
    const response = await requestUrl({
      url: `${FITBIT_BASE}${path}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new ApiError('UNAUTHORIZED', 401);
    if (response.status === 403) throw new ApiError('FORBIDDEN', 403);
    if (response.status === 429) throw new ApiError('RATE_LIMITED', 429);
    if (response.status >= 500) throw new ApiError('SERVER_ERROR', response.status);
    if (response.status !== 200) throw new ApiError('NETWORK_ERROR', response.status);

    return response.json;
  }
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const last = new Date(endDate + 'T00:00:00');
  while (cur <= last) {
    dates.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
