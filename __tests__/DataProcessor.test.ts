import { DataProcessor } from '../src/data/DataProcessor';
import { FitbitSleepRecord, SleepColumnRangePoint } from '../src/types';

const processor = new DataProcessor();

function makeSleepRecord(
  dateOfSleep: string,
  startTime: string,
  endTime: string,
  isMainSleep = true
): FitbitSleepRecord {
  return {
    dateOfSleep,
    startTime,
    endTime,
    duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
    efficiency: 90,
    minutesAsleep: 450,
    minutesAwake: 30,
    isMainSleep,
  };
}

describe('DataProcessor — sleep (columnrange)', () => {
  it('computes low and high from startTime and endTime', () => {
    const rec = makeSleepRecord(
      '2024-07-01',
      '2024-07-01T23:00:00.000',
      '2024-07-02T07:30:00.000'
    );
    const result = processor.process(
      { kind: 'sleep', agg: 24, records: [rec] },
      'columnrange'
    ) as SleepColumnRangePoint[];

    expect(result[0].date).toBe('2024-07-01');
    expect(result[0].low).toBe(23.0);
    expect(result[0].high).toBe(31.5);
  });

  it('handles sleep that starts after midnight (low < 24)', () => {
    const rec = makeSleepRecord(
      '2024-07-01',
      '2024-07-01T00:30:00.000',
      '2024-07-01T08:00:00.000'
    );
    const result = processor.process(
      { kind: 'sleep', agg: 24, records: [rec] },
      'columnrange'
    ) as SleepColumnRangePoint[];

    expect(result[0].low).toBe(0.5);
    expect(result[0].high).toBe(8.0);
  });

  it('prefers isMainSleep=true when multiple records for the same date', () => {
    const nap = makeSleepRecord(
      '2024-07-01',
      '2024-07-01T14:00:00.000',
      '2024-07-01T15:00:00.000',
      false
    );
    const main = makeSleepRecord(
      '2024-07-01',
      '2024-07-01T23:00:00.000',
      '2024-07-02T07:00:00.000',
      true
    );
    const result = processor.process(
      { kind: 'sleep', agg: 24, records: [nap, main] },
      'columnrange'
    ) as SleepColumnRangePoint[];

    expect(result).toHaveLength(1);
    expect(result[0].low).toBe(23.0);
  });

  it('returns results sorted by date', () => {
    const rec1 = makeSleepRecord('2024-07-02', '2024-07-02T23:00:00.000', '2024-07-03T07:00:00.000');
    const rec2 = makeSleepRecord('2024-07-01', '2024-07-01T23:00:00.000', '2024-07-02T07:00:00.000');
    const result = processor.process(
      { kind: 'sleep', agg: 24, records: [rec1, rec2] },
      'columnrange'
    ) as SleepColumnRangePoint[];

    expect(result[0].date).toBe('2024-07-01');
    expect(result[1].date).toBe('2024-07-02');
  });

  it('returns empty array when no records', () => {
    const result = processor.process(
      { kind: 'sleep', agg: 24, records: [] },
      'columnrange'
    ) as SleepColumnRangePoint[];

    expect(result).toHaveLength(0);
  });
});
