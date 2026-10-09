import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import type { Chart as ChartInstance } from 'chart.js';
import { Chart } from 'chart.js';
import { Mortgage, MortgageResult } from './mortgage-calculator';
import { ChartViewportComponent } from './chart-viewport';

const chartColors = ['#007f73', '#df765d', '#586b9c'];
const amortizationColors = ['#007f73', '#df765d', '#586b9c', '#d3a347', '#9b6db0', '#5a9bb5'];
const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Component({
  selector: 'app-amortization-schedule',
  imports: [ChartViewportComponent],
  templateUrl: './amortization-schedule.html',
})
export class AmortizationScheduleComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) detail!: { mortgage: Mortgage; result: MortgageResult };
  @ViewChild('detailChart') private detailCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: ChartInstance<'line'> | null = null;

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  amortizationColor(mortgage: Mortgage, id: string): string {
    const index = mortgage.amortizations.findIndex((item) => item.id === id);
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
  }
}