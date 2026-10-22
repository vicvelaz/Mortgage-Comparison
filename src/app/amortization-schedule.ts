import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import type { Chart as ChartInstance } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { AmortizationRow, Mortgage, MortgageResult, Scenario } from './mortgage-calculator';
import { ChartViewportComponent } from './chart-viewport';

Chart.register(BarController, BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const chartColors = ['#dcc084', '#8bbde0', '#8fc8aa'];
const amortizationColors = ['#dcc084', '#8bbde0', '#8fc8aa', '#ee9c96', '#c7a6c9', '#aeb8c4'];
const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentageFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type PaymentChartPeriod = 'annual' | 'monthly';

export interface PaymentBreakdownPeriod {
  label: string;
  interest: number;
  principal: number;
  extraPayment: number;
}

export function aggregatePaymentBreakdown(
  rows: readonly AmortizationRow[],
  period: PaymentChartPeriod,
): PaymentBreakdownPeriod[] {
  const chunks =
    period === 'monthly'
      ? rows.map((row) => [row])
      : Array.from({ length: Math.ceil(rows.length / 12) }, (_, year) =>
          rows.slice(year * 12, year * 12 + 12),
        );
  return chunks.map((chunk, index) => ({
    label: period === 'monthly' ? `${chunk[0].month}` : `Año ${index + 1}`,
    interest: sumCents(chunk.map((row) => row.interest)),
    principal: sumCents(chunk.map((row) => row.principal)),
    extraPayment: sumCents(chunk.map((row) => row.extraPayment)),
  }));
}

function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}

@Component({
  selector: 'app-amortization-schedule',
  imports: [ChartViewportComponent],
  templateUrl: './amortization-schedule.html',
})
export class AmortizationScheduleComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) detail!: {
    mortgage: Mortgage;
    scenario: Scenario;
    result: MortgageResult;
  };
  @ViewChild('detailChart') private detailCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('breakdownChart') private breakdownCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: ChartInstance<'line'> | null = null;
  private breakdownChart: ChartInstance<'bar'> | null = null;
  chartPeriod: PaymentChartPeriod = 'annual';

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.breakdownChart?.destroy();
  }

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  paymentPercentage(value: number, payment: number): string {
    return `${percentageFormatter.format(payment === 0 ? 0 : (value / payment) * 100)}%`;
  }

  paymentSummaryRows(): MortgageResult['rows'] {
    const rows = this.detail.result.rows;
    return rows.length > 1 ? [rows[0], rows[rows.length - 1]] : rows;
  }

  paymentSummaryLabel(month: number): string {
    return month === 1 ? 'Mes 1' : `Último mes · ${month}`;
  }

  setChartPeriod(period: PaymentChartPeriod): void {
    this.chartPeriod = period;
    this.renderBreakdownChart();
  }

  amortizationColor(scenario: Scenario, id: string): string {
    const index = scenario.amortizations.findIndex((item) => item.id === id);
    return amortizationColors[(index < 0 ? 0 : index) % amortizationColors.length];
  }

  private renderChart(): void {
    this.chart?.destroy();
    this.chart = null;
    if (!this.detailCanvas || !this.detail) return;

    const rows = this.detail.result.rows;
    this.chart = new Chart(this.detailCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: rows.map((row) => row.month),
        datasets: [
          {
            label: 'Capital pendiente',
            data: rows.map((row) => row.remainingCapital),
            borderColor: chartColors[0],
            backgroundColor: chartColors[0],
            yAxisID: 'capital',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Intereses acumulados',
            data: rows.map((row) => row.cumulativeInterest),
            borderColor: chartColors[1],
            backgroundColor: chartColors[1],
            yAxisID: 'accumulated',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Capital amortizado',
            data: rows.map((row) => row.cumulativePrincipal),
            borderColor: chartColors[2],
            backgroundColor: chartColors[2],
            yAxisID: 'accumulated',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7 } } },
        scales: {
          x: { grid: { display: false }, title: { display: true, text: 'Mes' } },
          capital: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: {
              callback: (value) =>
                new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(Number(value)),
            },
          },
          accumulated: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (value) =>
                new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(Number(value)),
            },
          },
        },
      },
    });
    this.renderBreakdownChart();
  }

  private renderBreakdownChart(): void {
    this.breakdownChart?.destroy();
    this.breakdownChart = null;
    if (!this.breakdownCanvas || !this.detail) return;

    const periods = aggregatePaymentBreakdown(this.detail.result.rows, this.chartPeriod);
    this.breakdownChart = new Chart(this.breakdownCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: periods.map((item) => item.label),
        datasets: [
          {
            label: 'Intereses',
            data: periods.map((item) => item.interest),
            backgroundColor: chartColors[1],
            stack: 'payment',
          },
          {
            label: 'Capital ordinario',
            data: periods.map((item) => item.principal),
            backgroundColor: chartColors[0],
            stack: 'payment',
          },
          {
            label: 'Amortización extra',
            data: periods.map((item) => item.extraPayment),
            backgroundColor: chartColors[2],
            stack: 'payment',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7 } },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            title: { display: true, text: this.chartPeriod === 'annual' ? 'Año' : 'Mes' },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              callback: (value) =>
                new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(Number(value)),
            },
          },
        },
      },
    });
  }
}
