import { parseBlockParams } from '../src/ui/HeatmapBlock';

describe('parseBlockParams', () => {
  it('parses minimal valid params', () => {
    const params = parseBlockParams('metric: steps\n');
    expect(params.metric).toBe('steps');
    expect(params.range).toBe(7);
    expect(params.agg).toBe(1);
    expect(params.theme).toBe('light');
  });

  it('parses agg parameter', () => {
    const params = parseBlockParams('metric: steps\nagg: 4\n');
    expect(params.agg).toBe(4);
  });

  it('clamps agg to 1-24', () => {
    expect(parseBlockParams('metric: steps\nagg: 0\n').agg).toBe(1);
    expect(parseBlockParams('metric: steps\nagg: 25\n').agg).toBe(24);
    expect(parseBlockParams('metric: steps\nagg: 24\n').agg).toBe(24);
  });

  it('defaults agg to 1 when invalid', () => {
    expect(parseBlockParams('metric: steps\nagg: abc\n').agg).toBe(1);
  });

  it('parses range and theme', () => {
    const source = ['metric: heart_rate', 'range: 30', 'agg: 2', 'theme: dark'].join('\n');
    const params = parseBlockParams(source);
    expect(params.metric).toBe('heart_rate');
    expect(params.range).toBe(30);
    expect(params.agg).toBe(2);
    expect(params.theme).toBe('dark');
  });

  it('throws for missing metric', () => {
    expect(() => parseBlockParams('range: 7\n')).toThrow(/metric/);
  });

  it('throws for invalid metric', () => {
    expect(() => parseBlockParams('metric: unknown\n')).toThrow(/metric/);
  });

  it('defaults range to 7 when invalid', () => {
    const params = parseBlockParams('metric: steps\nrange: abc\n');
    expect(params.range).toBe(7);
  });

  it('sets startDate when provided', () => {
    const params = parseBlockParams('metric: steps\nstartDate: 2024-01-01\n');
    expect(params.startDate).toBe('2024-01-01');
  });
});
