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
  Amortization,
  Bonus,
  Mortgage,
  MortgageResult,
  calculateMortgage,
  createId,
} from './mortgage-calculator';
import { MortgageFormComponent } from './mortgage-form';
import { AmortizationScheduleComponent } from './amortization-schedule';
import { ChartViewportComponent } from './chart-viewport';

const STORAGE_KEY = 'hipoteca-comparador-v1';
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

function parseMortgage(value: unknown): Mortgage | null {
  if (!isRecord(value)) return null;
  const { id, name, bank, amount, years, interestRate, bonuses, amortizations } = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof bank !== 'string' ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof years !== 'number' ||
    !Number.isFinite(years) ||
    years <= 0 ||
    !Number.isInteger(years * 12) ||
    typeof interestRate !== 'number' ||
    !Number.isFinite(interestRate) ||
    interestRate < 0 ||
    !Array.isArray(bonuses) ||
    !Array.isArray(amortizations)
  )
    return null;

  const parsedBonuses: Bonus[] = [];
  for (const item of bonuses) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['name'] !== 'string' ||
      typeof item['active'] !== 'boolean' ||
      typeof item['interestReduction'] !== 'number' ||
      !Number.isFinite(item['interestReduction']) ||
      item['interestReduction'] < 0 ||
      typeof item['annualCost'] !== 'number' ||
      !Number.isFinite(item['annualCost']) ||
      item['annualCost'] < 0 ||
      (item['startMonth'] !== undefined &&
        (typeof item['startMonth'] !== 'number' ||
          !Number.isInteger(item['startMonth']) ||
          item['startMonth'] < 1)) ||
      (item['endMonth'] !== undefined &&
        (typeof item['endMonth'] !== 'number' ||
          !Number.isInteger(item['endMonth']) ||
          item['endMonth'] < 1)) ||
      (typeof item['startMonth'] === 'number' &&
        typeof item['endMonth'] === 'number' &&
        item['endMonth'] < item['startMonth'])
    )
      return null;
    parsedBonuses.push(item as unknown as Bonus);
  }

  const parsedAmortizations: Amortization[] = [];
  for (const [index, item] of amortizations.entries()) {
    const reductionType = isRecord(item) ? item['reductionType'] : undefined;
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      (item['type'] !== 'single' && item['type'] !== 'recurring') ||
      (item['active'] !== undefined && typeof item['active'] !== 'boolean') ||
      (reductionType !== undefined && reductionType !== 'term' && reductionType !== 'payment') ||
      (item['name'] !== undefined && typeof item['name'] !== 'string') ||
      typeof item['amount'] !== 'number' ||
      !Number.isFinite(item['amount']) ||
      item['amount'] <= 0 ||
      typeof item['month'] !== 'number' ||
      !Number.isInteger(item['month']) ||
      item['month'] < 1 ||
      (item['type'] === 'recurring' &&
        (typeof item['frequencyMonths'] !== 'number' ||
          !Number.isInteger(item['frequencyMonths']) ||
          item['frequencyMonths'] < 1))
    )
      return null;
    parsedAmortizations.push({
      id: item['id'],
      name:
        typeof item['name'] === 'string' && item['name'].trim()
          ? item['name'].trim()
          : `Amortización ${index + 1}`,
      active: typeof item['active'] === 'boolean' ? item['active'] : true,
      type: item['type'],
      reductionType: reductionType === 'term' ? 'term' : 'payment',
      amount: item['amount'],
      month: item['month'],
      ...(typeof item['frequencyMonths'] === 'number'
        ? { frequencyMonths: item['frequencyMonths'] }
        : {}),
    });
  }

  return {
    id,
    name,
    bank,
    amount,
    years,
    interestRate,
    rateType: value['rateType'] === 'variable' ? 'variable' : 'fixed',
    startDate: typeof value['startDate'] === 'string' ? value['startDate'] : undefined,
    bonuses: parsedBonuses,
    amortizations: parsedAmortizations,
    updatedAt:
      typeof value['updatedAt'] === 'string' ? value['updatedAt'] : new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMortgages(): Mortgage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || !Array.isArray(parsed['mortgages'])) return [];
    const mortgages = parsed['mortgages'].map(parseMortgage);
    return mortgages.every((mortgage) => mortgage !== null) ? (mortgages as Mortgage[]) : [];
  } catch {
    return [];
  }
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

  readonly mortgages = signal(readMortgages());
  readonly activeView = signal<ViewName>('dashboard');
  readonly selectedIds = signal(
    this.mortgages()
      .slice(0, 2)
      .map((mortgage) => mortgage.id),
  );
  readonly status = signal('Tus datos se guardan automáticamente en este dispositivo.');
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
    if (
      !this.draft.name.trim() ||
      !this.draft.bank.trim() ||
      this.draft.amount <= 0 ||
      this.draft.years <= 0 ||
      !Number.isInteger(this.draft.years * 12)
    ) {
      this.status.set('Completa nombre, entidad, capital y plazo con valores válidos.');
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

  exportData(): void {
    const blob = new Blob([JSON.stringify({ mortgages: this.mortgages() }, null, 2)], {
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
      const content: unknown = JSON.parse(await file.text());
      if (!isRecord(content) || !Array.isArray(content['mortgages'])) throw new Error('invalid');
      const mortgages = content['mortgages'].map(parseMortgage);
      const valid = mortgages.every((mortgage) => mortgage !== null);
      const ids = mortgages.map((mortgage) => mortgage?.id);
      if (!valid || new Set(ids).size !== ids.length) throw new Error('invalid');
      this.mortgages.set(mortgages as Mortgage[]);
      this.selectedIds.set((mortgages as Mortgage[]).slice(0, 2).map((mortgage) => mortgage.id));
      this.editingId.set(null);
      this.draft = emptyMortgage();
      this.status.set('Importación completada.');
      this.commitChanges();
    } catch {
      this.status.set('No se pudo importar: revisa que sea un JSON válido.');
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mortgages: this.mortgages() }));
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
    const labels = rows[0]?.result.rows.map((row) => row.month) ?? [];
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
