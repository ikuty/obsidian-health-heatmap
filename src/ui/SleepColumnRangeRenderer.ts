import Highcharts from 'highcharts';
import HighchartsMore from 'highcharts/highcharts-more';
import { HeatmapBlockParams, SleepColumnRangePoint } from '../types';

let moreApplied = false;

export class SleepColumnRangeRenderer {
  private chart: Highcharts.Chart | null = null;

  constructor(
    private container: HTMLElement,
    private params: HeatmapBlockParams
  ) {}

  paint(points: SleepColumnRangePoint[]): void {
    if (!moreApplied) {
      HighchartsMore(Highcharts);
      moreApplied = true;
    }
    const isDark    = this.params.theme === 'dark';
    const textColor = isDark ? '#cdd6f4' : '#333333';
    const gridColor = isDark ? '#3a3a4a' : '#e0e0e0';

    const labelStep = points.length > 60 ? 7 : points.length > 14 ? 3 : 1;
    const yMin = calcYMin(points);
    const yMax = calcYMax(points);

    const wrapper = this.container.createDiv({ cls: 'health-heatmap-sleep-wrapper' });
    wrapper.style.height = '400px';

    this.chart = Highcharts.chart(wrapper, {
      chart: {
        type: 'columnrange',
        backgroundColor: 'transparent',
        style: { fontFamily: 'inherit' },
      },

      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },

      xAxis: {
        categories: points.map(p => p.date),
        labels: {
          step: labelStep,
          style: { color: textColor, fontSize: '10px' },
          formatter() {
            return String(this.value).slice(5); // YYYY-MM-DD → MM-DD
          },
        },
        lineColor: textColor,
        tickColor: textColor,
      },

      yAxis: {
        title: { text: null },
        min: yMin,
        max: yMax,
        tickInterval: 2,
        reversed: true,
        labels: {
          style: { color: textColor, fontSize: '10px' },
          formatter() {
            return hoursToTimeStr(Number(this.value));
          },
        },
        gridLineColor: gridColor,
      },

      tooltip: {
        useHTML: true,
        formatter() {
          const pt   = this.point as Highcharts.Point & { low: number; high: number };
          const low  = hoursToTimeStr(pt.low);
          const high = hoursToTimeStr(pt.high);
          const dur  = hoursToHHMM(pt.high - pt.low);
          return `<b>${this.x}</b><br>就寝: ${low}<br>起床: ${high}<br>睡眠時間: ${dur}`;
        },
        backgroundColor: isDark ? '#2a2a3a' : '#ffffff',
        style: { color: textColor },
      },

      series: [{
        type: 'columnrange',
        name: 'Sleep',
        data: points.map((p, i) => [i, p.low, p.high]),
        color: '#5b8dee',
        borderWidth: 0,
        borderRadius: 2,
      }] as Highcharts.SeriesOptionsType[],
    });
  }

  destroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }
}

// 小数時間 → "HH:MM"（負値・24超え対応: -1 → "23:00"）
function hoursToTimeStr(hours: number): string {
  const totalMins = Math.round(((hours * 60) % 1440 + 1440) % 1440);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${pad(h)}:${pad(m)}`;
}

// 小数時間差 → "Xh Ym"
function hoursToHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function calcYMin(points: SleepColumnRangePoint[]): number {
  if (points.length === 0) return 0;
  const minLow = Math.min(...points.map(p => p.low));
  return Math.floor(Math.min(minLow, 0));
}

function calcYMax(points: SleepColumnRangePoint[]): number {
  if (points.length === 0) return 12;
  const maxHigh = Math.max(...points.map(p => p.high));
  return Math.ceil(Math.max(maxHigh, 12));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
