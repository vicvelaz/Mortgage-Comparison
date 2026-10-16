import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import type { Chart as ChartInstance } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { filter } from 'rxjs';
import {
  Mortgage,
  MortgageResult,
  calculateMortgage,
  createId,
  relativeCostPer100,
} from './mortgage-calculator';
import { MortgageFormComponent } from './mortgage-form';
import { AmortizationScheduleComponent } from './amortization-schedule';
import { ChartViewportComponent } from './chart-viewport';
import {
  STORAGE_KEY,
  loadMortgages,
  parseMortgageFile,
  serializeMortgages,
} from './mortgage-storage';
import { validateMortgage } from './mortgage-validation';
const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const chartColors = ['#007f73', '#df765d', '#586b9c', '#d3a347'];
const amortizationColors = ['#007f73', '#df765d', '#586b9c', '#d3a347', '#9b6db0', '#5a9bb5'];
Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

type ViewName = 'dashboard' | 'mortgages' | 'comparison';
type ResultKey = 'totalCost' | 'firstPayment' | 'totalInterest';

function emptyMortgage(): Mortgage {
  return {
    id: createId(),
    name: '',
    bank: '',
    amount: 180000,
    years: 25,
    interestRate: 3.1,
    rateType: 'fixed',
    bonuses: [],
    amortizations: [],
    updatedAt: new Date().toISOString(),
  };
}

@Component({
  selector: 'app-workspace',
  imports: [
    DecimalPipe,
    MatCheckboxModule,
    RouterLink,
    AmortizationScheduleComponent,
    MortgageFormComponent,
    ChartViewportComponent,
  ],
  templateUrl: './workspace.html',
})
export class Workspace implements AfterViewInit, OnDestroy {
  @ViewChild('overviewChart') private overviewCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('comparisonChart') private comparisonCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('costChart') private costCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly initialLoad = loadMortgages(localStorage);
  readonly mortgages = signal(this.initialLoad.mortgages);
  readonly activeView = signal<ViewName>('dashboard');
  readonly selectedIds = signal(
    this.mortgages()
      .slice(0, 2)
      .map((mortgage) => mortgage.id),
  );
  readonly status = signal(
    this.initialLoad.notice ?? 'Tus datos se guardan automáticamente en este dispositivo.',
  );
  readonly mortgageResults = computed(() =>
    this.mortgages().map((mortgage) => ({ mortgage, result: calculateMortgage(mortgage) })),
  );
  readonly selectedResults = computed(() =>
    this.mortgageResults().filter(({ mortgage }) => this.selectedIds().includes(mortgage.id)),
  );
  readonly editingResult = computed(
    () => this.mortgageResults().find(({ mortgage }) => mortgage.id === this.editingId()) ?? null,
  );
  readonly cheapest = computed(() => this.lowest('totalCost'));
  readonly smallestPayment = computed(() => this.lowest('firstPayment'));
  readonly leastInterest = computed(() => this.lowest('totalInterest'));
  readonly comparable = computed(() => {
    const rows = this.selectedResults();
    const first = rows[0]?.mortgage;
    return (
      !first ||
      rows.every(
        ({ mortgage }) => mortgage.amount === first.amount && mortgage.years === first.years,
      )
    );
  });
  readonly lowestRelativeCost = computed(() =>
    this.selectedResults()
      .map((item) => ({ ...item, relativeCost: this.relativeCost(item) }))
      .sort((left, right) => left.relativeCost - right.relativeCost)[0] ?? null,
  );
  readonly totalBonuses = computed(() =>
    this.selectedResults().reduce((total, item) => total + item.result.bonusCost, 0),
  );
  readonly totalSavings = computed(() =>
    this.selectedResults().reduce((total, item) => total + item.result.amortizationSavings, 0),
  );
  readonly lastModified = computed(() => {
    const last = this.mortgages()
      .map((item) => item.updatedAt)
      .sort()
      .at(-1);
    return last
      ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(last))
      : 'Sin datos';
  });

  draft = emptyMortgage();
  editingId = signal<string | null>(null);

  private overviewChart: ChartInstance<'line'> | null = null;
  private comparisonChart: ChartInstance<'line'> | null = null;
  private costChart: ChartInstance<'bar'> | null = null;

  constructor(private readonly router: Router) {
    this.activeView.set(this.viewFromUrl());
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.activeView.set(this.viewFromUrl()));
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.overviewChart?.destroy();
    this.comparisonChart?.destroy();
    this.costChart?.destroy();
  }

  setView(view: ViewName): void {
    void this.router.navigateByUrl(`/${view}`);
  }

  openNewMortgage(): void {
    this.draft = emptyMortgage();
    this.editingId.set(null);
    this.setView('mortgages');
    this.refreshCharts();
  }

  editMortgage(mortgage: Mortgage): void {
    this.draft = structuredClone(mortgage);
    this.editingId.set(mortgage.id);
    this.setView('mortgages');
    this.refreshCharts();
  }

  saveMortgage(): void {
    const error = validateMortgage(this.draft);
    if (error) {
      this.status.set(error);
      return;
    }
    const saved = {
      ...this.draft,
      name: this.draft.name.trim(),
      bank: this.draft.bank.trim(),
      updatedAt: new Date().toISOString(),
    };
    const exists = this.mortgages().some((mortgage) => mortgage.id === saved.id);
    this.mortgages.set(
      exists
        ? this.mortgages().map((mortgage) => (mortgage.id === saved.id ? saved : mortgage))
        : [saved, ...this.mortgages()],
    );
    this.draft = structuredClone(saved);
    this.editingId.set(saved.id);
    this.status.set('Oferta guardada.');
    this.commitChanges();
  }

  deleteMortgage(mortgage: Mortgage): void {
    if (!confirm(`¿Eliminar la oferta “${mortgage.name}”?`)) return;
    this.mortgages.set(this.mortgages().filter((item) => item.id !== mortgage.id));
    this.selectedIds.update((ids) => ids.filter((id) => id !== mortgage.id));
    if (this.editingId() === mortgage.id) {
      this.editingId.set(null);
      this.draft = emptyMortgage();
    }
    this.status.set('Oferta eliminada.');
    this.commitChanges();
  }

  toggleComparison(id: string, checked: boolean): void {
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
    this.refreshCharts();
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  calculateMortgageFor(id: string): MortgageResult {
    return this.mortgageResults().find((item) => item.mortgage.id === id)!.result;
  }

  selectedLowest(key: ResultKey): { mortgage: Mortgage; result: MortgageResult } | null {
    return (
      [...this.selectedResults()].sort((left, right) => left.result[key] - right.result[key])[0] ??
      null
    );
  }

  markerColor(id: string): string {
    const selectedIndex = this.selectedIds().indexOf(id);
    const mortgageIndex = this.mortgages().findIndex((mortgage) => mortgage.id === id);
    return chartColors[(selectedIndex >= 0 ? selectedIndex : mortgageIndex) % chartColors.length];
  }

  amortizationColor(mortgage: Mortgage, id: string): string {
    const index = mortgage.amortizations.findIndex((item) => item.id === id);
    return amortizationColors[(index < 0 ? 0 : index) % amortizationColors.length];
  }

  rateTypeLabel(type: Mortgage['rateType']): string {
    return type === 'fixed' ? 'Fija' : 'Variable';
  }

  relativeCost(item: { mortgage: Mortgage; result: MortgageResult }): number {
    return relativeCostPer100(item.mortgage, item.result);
  }

  exportData(): void {
    const blob = new Blob([serializeMortgages(this.mortgages())], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hipoteca-escenarios.json';
    link.click();
    URL.revokeObjectURL(url);
    this.status.set('Escenarios exportados en JSON.');
  }

  async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = parseMortgageFile(await file.text());
      if (!result.ok) {
        this.status.set(`No se pudo importar. ${result.error}`);
        return;
      }
      const mortgages = result.value;
      this.mortgages.set(mortgages);
      this.selectedIds.set(mortgages.slice(0, 2).map((mortgage) => mortgage.id));
      this.editingId.set(null);
      this.draft = emptyMortgage();
      this.status.set('Importación completada.');
      this.commitChanges();
    } catch {
      this.status.set('No se pudo leer el archivo seleccionado.');
    } finally {
      input.value = '';
    }
  }

  trackMortgage(_index: number, mortgage: Mortgage): string {
    return mortgage.id;
  }

  private viewFromUrl(): ViewName {
    const segment = this.router.url.split('?')[0].split('/').filter(Boolean)[0];
    return segment === 'mortgages' || segment === 'comparison' ? segment : 'dashboard';
  }

  private lowest(key: ResultKey): Mortgage | null {
    return (
      [...this.mortgageResults()].sort((left, right) => left.result[key] - right.result[key])[0]
        ?.mortgage ?? null
    );
  }

  private commitChanges(): void {
    try {
      localStorage.setItem(STORAGE_KEY, serializeMortgages(this.mortgages()));
    } catch {
      this.status.set(
        'No se pudo guardar en este dispositivo. Exporta los escenarios para conservarlos.',
      );
    }
    this.refreshCharts();
  }

  private refreshCharts(): void {
    requestAnimationFrame(() => this.renderCharts());
  }

  private renderCharts(): void {
    const rows = this.selectedResults();
    const longest = rows.reduce<MortgageResult | null>(
      (best, item) =>
        !best || item.result.rows.length > best.rows.length ? item.result : best,
      null,
    );
    const labels = longest?.rows.map((row) => row.month) ?? [];
    const lineData = rows.map((item, index) => ({
      label: item.mortgage.name,
      data: item.result.rows.map((row) => row.remainingCapital),
      borderColor: chartColors[index % chartColors.length],
      backgroundColor: chartColors[index % chartColors.length],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.24,
    }));
    const lineOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 7 } },
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'Mes' } },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: string | number) =>
              new Intl.NumberFormat('es-ES', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(Number(value)),
          },
        },
      },
    };
    if (this.overviewCanvas) {
      this.overviewChart?.destroy();
      this.overviewChart = new Chart(this.overviewCanvas.nativeElement, {
        type: 'line',
        data: { labels, datasets: lineData },
        options: lineOptions,
      });
    }
    if (this.comparisonCanvas) {
      this.comparisonChart?.destroy();
      this.comparisonChart = new Chart(this.comparisonCanvas.nativeElement, {
        type: 'line',
        data: { labels, datasets: lineData },
        options: lineOptions,
      });
    }
    if (this.costCanvas) {
      this.costChart?.destroy();
      this.costChart = new Chart(this.costCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels: ['Coste total', 'Intereses', 'Bonificaciones'],
          datasets: rows.map((item, index) => ({
            label: item.mortgage.name,
            data: [item.result.totalCost, item.result.totalInterest, item.result.bonusCost],
            backgroundColor: chartColors[index % chartColors.length],
            borderRadius: 3,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7 } } },
          scales: {
            x: { grid: { display: false } },
            y: {
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
}
