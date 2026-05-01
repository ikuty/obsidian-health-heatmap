import { DataProcessor } from '../src/data/DataProcessor';
import { GoogleHealthBucket } from '../src/types';

const processor = new DataProcessor();

function makeBucket(
  startMs: number,
  endMs: number,
  points: Array<{ intVal?: number; fpVal?: number }>
): GoogleHealthBucket {
  return {
    startTimeMillis: String(startMs),
    endTimeMillis: String(endMs),
    dataset: [
      {
        dataSourceId: 'test',
        point: points.map(v => ({
          startTimeNanos: String(startMs * 1_000_000),
          endTimeNanos: String(endMs * 1_000_000),
          value: [v],
        })),
      },
    ],
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const BASE = new Date('2024-07-01').getTime();

describe('DataProcessor.processSteps', () => {
  it('returns daily date string for daily buckets', () => {
    const b = makeBucket(BASE, BASE + DAY, [{ intVal: 8000 }]);
    const result = processor.processSteps([b]);
    expect(result[0].date).toBe('2024-07-01');
    expect(result[0].value).toBe(8000);
  });

  it('returns hourly date string for sub-day buckets', () => {
    const b = makeBucket(BASE, BASE + HOUR, [{ intVal: 500 }]);
    const result = processor.processSteps([b]);
    expect(result[0].date).toMatch(/T\d{2}:00$/);
  });

  it('returns 0 for empty bucket', () => {
    const b = makeBucket(BASE, BASE + DAY, []);
    const result = processor.processSteps([b]);
    expect(result[0].value).toBe(0);
  });
});

describe('DataProcessor.processHeartRate', () => {
  const pts = [{ fpVal: 60 }, { fpVal: 80 }, { fpVal: 70 }];

  it('returns average by default', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processHeartRate([b], 'average') as any[];
    expect(result[0].value).toBeCloseTo(70, 1);
  });

  it('returns min', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processHeartRate([b], 'min') as any[];
    expect(result[0].value).toBe(60);
  });

  it('returns max', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processHeartRate([b], 'max') as any[];
    expect(result[0].value).toBe(80);
  });

  it('returns full stats for all', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processHeartRate([b], 'all') as any[];
    expect(result[0]).toMatchObject({ avg: 70, min: 60, max: 80, count: 3 });
  });
});

describe('DataProcessor.processSleep', () => {
  it('computes sleep_ratio correctly: fully asleep (avg=1) → ratio=1', () => {
    const b = makeBucket(BASE, BASE + DAY, [{ intVal: 1 }, { intVal: 1 }]);
    const result = processor.processSleep([b], 'sleep_ratio');
    expect(result[0].value).toBe(1);
  });

  it('computes sleep_ratio correctly: fully awake (avg=2) → ratio=0', () => {
    const b = makeBucket(BASE, BASE + DAY, [{ intVal: 2 }, { intVal: 2 }]);
    const result = processor.processSleep([b], 'sleep_ratio');
    expect(result[0].value).toBe(0);
  });

  it('clamps sleep_ratio to [0, 1]', () => {
    const b = makeBucket(BASE, BASE + DAY, [{ intVal: 1 }]);
    const result = processor.processSleep([b], 'sleep_ratio');
    expect(result[0].value).toBeGreaterThanOrEqual(0);
    expect(result[0].value).toBeLessThanOrEqual(1);
  });
});

describe('DataProcessor.processCalories', () => {
  const pts = [{ fpVal: 100 }, { fpVal: 200 }, { fpVal: 300 }];

  it('returns sum by default', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processCalories([b], 'sum') as any[];
    expect(result[0].value).toBe(600);
  });

  it('returns all stats', () => {
    const b = makeBucket(BASE, BASE + DAY, pts);
    const result = processor.processCalories([b], 'all') as any[];
    expect(result[0]).toMatchObject({ sum: 600, min: 100, max: 300, count: 3 });
  });
});

describe('DataProcessor.processActiveMinutes', () => {
  it('sums values', () => {
    const b = makeBucket(BASE, BASE + DAY, [{ intVal: 10 }, { intVal: 20 }]);
    const result = processor.processActiveMinutes([b], 'sum') as any[];
    expect(result[0].value).toBe(30);
  });
});
