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
    const isDark      = this.params.theme === 'dark';
    const textColor   = isDark ? '#ffffff' : '#333333';
    const gridColor   = isDark ? '#333344' : '#dddddd';
    const bgColor     = isDark ? '#1c1c2e' : 'transparent';
    const accentColor = getComputedStyle(this.container)
      .getPropertyValue('--color-accent').trim() || '#00AAFF';

    const labelStep = points.length > 60 ? 7 : points.length > 14 ? 3 : 1;
    const yMin = calcYMin(points);
    const yMax = calcYMax(points);

    const wrapper = this.container.createDiv({ cls: 'health-heatmap-sleep-wrapper' });
    wrapper.style.height = '300px';

    const labelStyle: Highcharts.CSSObject = {
      color: textColor,
      fontSize: '11px',
      fontWeight: 'bold',
      textOutline: 'none',
    };

    this.chart = Highcharts.chart(wrapper, {
      chart: {
        type: 'columnrange',
        inverted: true,
        backgroundColor: bgColor,
        style: { fontFamily: 'inherit' },
        marginLeft: 70,
      },

      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },

      xAxis: {
        categories: points.map(p => p.date),
        labels: {
          step: labelStep,
          align: 'right',
          style: { color: textColor, fontSize: '11px' },
          formatter() {
            return String(this.value).slice(5); // YYYY-MM-DD → MM-DD
          },
        },
        lineColor: isDark ? '#555566' : '#cccccc',
        tickWidth: 0,
        gridLineWidth: 0,
      },

      yAxis: {
        title: {
          text: 'Sleep duration',
          style: { color: textColor, fontSize: '11px' },
        },
        min: yMin,
        max: yMax,
        tickInterval: 2,
        labels: {
          style: { color: textColor, fontSize: '10px' },
          formatter() {
            return hoursToTimeStr(Number(this.value));
          },
        },
        gridLineColor: gridColor,
        lineWidth: 0,
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
        color: accentColor,
        borderWidth: 0,
        borderRadius: 6,
        // In Highcharts columnrange, dataLabels[0] is placed at the HIGH end,
        // dataLabels[1] at the LOW end.
        dataLabels: [{
          // HIGH end (right = wake time = 起床)
          enabled: true,
          inside: false,
          align: 'left',
          crop: false,
          overflow: 'allow' as Highcharts.OptionsOverflowValue,
          style: labelStyle,
          formatter() {
            const pt = this.point as Highcharts.Point & { low: number; high: number };
            return hoursToTimeStr(pt.high);
          },
        }, {
          // LOW end (left = bedtime = 入眠)
          enabled: true,
          inside: false,
          align: 'right',
          crop: false,
          overflow: 'allow' as Highcharts.OptionsOverflowValue,
          style: labelStyle,
          formatter() {
            const pt = this.point as Highcharts.Point & { low: number; high: number };
            return hoursToTimeStr(pt.low);
          },
        }],
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
