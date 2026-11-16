import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
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
  Scenario,
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
import {
  FirebaseAuthService,
  type FirebaseAuthState,
  type FirebaseUserSummary,
} from './firebase-auth';
import { FirebaseMortgageSyncService, reconcileGuestOffers } from './firebase-mortgage-sync';
const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const chartColors = ['#dcc084', '#8bbde0', '#8fc8aa', '#ee9c96'];
const amortizationColors = ['#dcc084', '#8bbde0', '#8fc8aa', '#ee9c96', '#c7a6c9', '#aeb8c4'];
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
Chart.defaults.color = '#aaaab3';
Chart.defaults.borderColor = '#36363e';

type ViewName = 'dashboard' | 'mortgages' | 'comparison';
type ResultKey = 'totalCost' | 'firstPayment' | 'totalInterest';

interface ScenarioResult {
  mortgage: Mortgage;
  scenario: Scenario;
  result: MortgageResult;
}

interface AccountReconciliation {
  uid: string;
  guest: Mortgage[];
  account: Mortgage[];
  merged: Mortgage[];
  transfer: Mortgage[];
}

type CloudMutation =
  | { kind: 'upsert'; mortgage: Mortgage }
  | { kind: 'delete'; mortgageId: string }
  | { kind: 'replace'; previous: Mortgage[]; updatedAt: string };

export function comparisonMonthLabels(results: readonly { result: MortgageResult }[]): number[] {
  const longest = results.reduce<MortgageResult | null>(
    (best, item) => (!best || item.result.rows.length > best.rows.length ? item.result : best),
    null,
  );
  return longest?.rows.map((row) => row.month) ?? [];
}

function emptyMortgage(): Mortgage {
  return {
    id: createId(),
    name: '',
    bank: '',
    amount: 180000,
    years: 25,
    interestRate: 3.1,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: [
      {
        id: createId(),
        name: 'Base',
        bonuses: [],
        amortizations: [],
        mode: 'reduceInstallment',
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function scenarioKey(mortgageId: string, scenarioId: string): string {
  return JSON.stringify([mortgageId, scenarioId]);
}

function differenceInCents(left: number, right: number): number {
  return (Math.round(left * 100) - Math.round(right * 100)) / 100;
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido.';
}

@Component({
  selector: 'app-workspace',
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    MatCheckboxModule,
    MatIconModule,
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
      .flatMap((mortgage) =>
        mortgage.scenarios.slice(0, 1).map((scenario) => scenarioKey(mortgage.id, scenario.id)),
      ),
  );
  readonly selectedScenarioId = signal(this.mortgages()[0]?.scenarios[0]?.id ?? '');
  readonly status = signal(
    this.initialLoad.notice ?? 'Tus datos se guardan automáticamente en este dispositivo.',
  );
  readonly reconciliation = signal<AccountReconciliation | null>(null);
  readonly accountSyncActive = signal(false);
  readonly mortgageResults = computed(() =>
    this.mortgages().flatMap((mortgage) =>
      mortgage.scenarios.map((scenario) => ({
        mortgage,
        scenario,
        result: calculateMortgage(mortgage, scenario),
      })),
    ),
  );
  readonly selectedResults = computed(() =>
    this.mortgageResults().filter(({ mortgage, scenario }) =>
      this.selectedIds().includes(scenarioKey(mortgage.id, scenario.id)),
    ),
  );
  readonly offerGroups = computed(() =>
    this.mortgages().map((mortgage) => ({
      mortgage,
      items: this.mortgageResults().filter((item) => item.mortgage.id === mortgage.id),
    })),
  );
  readonly editingResult = computed(
    () =>
      this.mortgageResults().find(
        ({ mortgage, scenario }) =>
          mortgage.id === this.editingId() && scenario.id === this.selectedScenarioId(),
      ) ?? null,
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
  readonly comparisonDifferences = computed(() => {
    const rows = this.selectedResults();
    const mortgage = rows[0]?.mortgage;
    if (!mortgage || rows.length < 2 || rows.some((item) => item.mortgage.id !== mortgage.id)) {
      return null;
    }
    const baseScenario = mortgage.scenarios[0];
    const base = this.mortgageResults().find(
      (item) => item.mortgage.id === mortgage.id && item.scenario.id === baseScenario?.id,
    );
    if (!base) return null;
    return rows.map((item) => ({
      ...item,
      interestSavings: differenceInCents(base.result.totalInterest, item.result.totalInterest),
      totalCostSavings: differenceInCents(base.result.totalCost, item.result.totalCost),
      monthsSaved: base.result.rows.length - item.result.rows.length,
      initialPaymentDifference: differenceInCents(
        item.result.firstPayment,
        base.result.firstPayment,
      ),
    }));
  });
  readonly lowestRelativeCost = computed(
    () =>
      this.selectedResults()
        .filter((item) => !this.hasUnpaidBalance(item))
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
  private activeAccountUid: string | null = null;
  private deferredAccountUid: string | null = null;
  private accountTransition = 0;
  private previousAuthKind: FirebaseAuthState['kind'] | null = null;

  get authentication() {
    return this.firebaseAuth.state;
  }

  get cloudStatus() {
    return this.cloudSync.status;
  }

  get accountEmail(): string | null {
    const state = this.firebaseAuth.state();
    return state.kind === 'authenticated' ? state.user.email : null;
  }

  constructor(
    private readonly router: Router,
    private readonly firebaseAuth: FirebaseAuthService,
    private readonly cloudSync: FirebaseMortgageSyncService,
  ) {
    this.activeView.set(this.viewFromUrl());
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.activeView.set(this.viewFromUrl()));
    effect(() => {
      const state = this.firebaseAuth.state();
      const previousState = this.previousAuthKind;
      this.previousAuthKind = state.kind;
      if (state.kind === 'authenticated') {
        void this.connectAccount(state.user);
      } else if (state.kind === 'guest') {
        this.accountTransition += 1;
        this.activeAccountUid = null;
        this.accountSyncActive.set(false);
        this.reconciliation.set(null);
        this.cloudSync.stop();
        if (previousState === 'authenticated' || previousState === 'loading') {
          this.loadGuestData();
        }
      }
    });
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.overviewChart?.destroy();
    this.comparisonChart?.destroy();
    this.costChart?.destroy();
    this.cloudSync.stop();
  }

  async signInWithGoogle(): Promise<void> {
    const result = await this.firebaseAuth.signInWithGoogle();
    if (result === 'unavailable') {
      this.status.set('La sincronización no está configurada; puedes seguir como invitado.');
    } else if (result === 'cancelled' || result === 'error') {
      const state = this.firebaseAuth.state();
      this.status.set(
        state.kind === 'cancelled' || state.kind === 'error'
          ? state.message
          : 'No se inició sesión.',
      );
    }
  }

  async signOut(): Promise<void> {
    this.cloudSync.stop();
    this.activeAccountUid = null;
    this.accountSyncActive.set(false);
    this.reconciliation.set(null);
    await this.firebaseAuth.signOut();
  }

  retryAccountSync(): void {
    const state = this.firebaseAuth.state();
    if (state.kind !== 'authenticated') return;
    this.deferredAccountUid = null;
    void this.connectAccount(state.user, true);
  }

  confirmAccountTransfer(): void {
    const reconciliation = this.reconciliation();
    if (!reconciliation) return;
    this.reconciliation.set(null);
    this.activateAccount(reconciliation.uid, reconciliation.merged, reconciliation.transfer);
  }

  deferAccountTransfer(): void {
    const reconciliation = this.reconciliation();
    if (!reconciliation) return;
    this.deferredAccountUid = reconciliation.uid;
    this.reconciliation.set(null);
    this.status.set('La conciliación se aplazó. Tus ofertas invitadas no se han modificado.');
  }

  cancelAccountTransfer(): void {
    this.status.set('Inicio cancelado. Sigues como invitado y tus ofertas locales se conservan.');
    void this.signOut();
  }

  continueAsGuest(): void {
    if (this.authentication().kind === 'authenticated') {
      this.cancelAccountTransfer();
      return;
    }
    this.status.set('Modo invitado: tus ofertas se guardan en este dispositivo.');
  }

  setView(view: ViewName): void {
    void this.router.navigateByUrl(`/${view}`);
  }

  openNewMortgage(): void {
    this.draft = emptyMortgage();
    this.selectedScenarioId.set(this.draft.scenarios[0].id);
    this.editingId.set(null);
    this.setView('mortgages');
    this.refreshCharts();
  }

  editMortgage(mortgage: Mortgage, scenarioId?: string): void {
    this.draft = structuredClone(mortgage);
    this.selectedScenarioId.set(
      this.draft.scenarios.find((scenario) => scenario.id === scenarioId)?.id ??
        this.draft.scenarios[0]?.id ??
        '',
    );
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
    this.commitChanges({ kind: 'upsert', mortgage: saved });
  }

  activeScenario(): Scenario | null {
    return (
      this.draft.scenarios.find((scenario) => scenario.id === this.selectedScenarioId()) ??
      this.draft.scenarios[0] ??
      null
    );
  }

  portfolioMortgages(): Mortgage[] {
    return this.editingId()
      ? this.mortgages().map((mortgage) =>
          mortgage.id === this.editingId() ? this.draft : mortgage,
        )
      : [this.draft, ...this.mortgages()];
  }

  selectPortfolioScenario(mortgage: Mortgage, scenarioId: string): void {
    if (mortgage.id === this.draft.id) {
      this.selectedScenarioId.set(scenarioId);
    } else {
      this.editMortgage(mortgage, scenarioId);
    }
  }

  createScenario(): void {
    const scenario: Scenario = {
      id: createId(),
      name: `Escenario ${this.draft.scenarios.length + 1}`,
      bonuses: [],
      amortizations: [],
      mode: 'reduceInstallment',
    };
    this.draft.scenarios = [...this.draft.scenarios, scenario];
    this.selectedScenarioId.set(scenario.id);
  }

  duplicateScenario(): void {
    const selected = this.activeScenario();
    if (!selected) return;
    const copy: Scenario = {
      ...structuredClone(selected),
      id: createId(),
      name: `${selected.name} (copia)`,
      bonuses: selected.bonuses.map((bonus) => ({ ...structuredClone(bonus), id: createId() })),
      amortizations: selected.amortizations.map((item) => ({
        ...structuredClone(item),
        id: createId(),
      })),
    };
    this.draft.scenarios = [...this.draft.scenarios, copy];
    this.selectedScenarioId.set(copy.id);
  }

  renameScenario(): void {
    const selected = this.activeScenario();
    if (!selected) return;
    const name = prompt('Nombre del escenario', selected.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      this.status.set('El nombre del escenario no puede estar vacío.');
      return;
    }
    this.draft.scenarios = this.draft.scenarios.map((scenario) =>
      scenario.id === selected.id ? { ...scenario, name: trimmed } : scenario,
    );
  }

  deleteScenario(): void {
    const selected = this.activeScenario();
    if (!selected) return;
    if (this.draft.scenarios.length <= 1) {
      this.status.set('La hipoteca debe tener al menos un escenario.');
      return;
    }
    if (!confirm(`¿Eliminar el escenario “${selected.name}”?`)) return;
    this.draft.scenarios = this.draft.scenarios.filter((scenario) => scenario.id !== selected.id);
    this.selectedScenarioId.set(this.draft.scenarios[0].id);
  }

  deleteMortgage(mortgage: Mortgage): void {
    if (!confirm(`¿Eliminar la oferta “${mortgage.name}”?`)) return;
    this.mortgages.set(this.mortgages().filter((item) => item.id !== mortgage.id));
    const removedKeys = new Set(
      mortgage.scenarios.map((scenario) => scenarioKey(mortgage.id, scenario.id)),
    );
    this.selectedIds.update((ids) => ids.filter((id) => !removedKeys.has(id)));
    if (this.editingId() === mortgage.id) {
      this.editingId.set(null);
      this.draft = emptyMortgage();
      this.selectedScenarioId.set(this.draft.scenarios[0].id);
    }
    this.status.set('Oferta eliminada.');
    this.commitChanges({ kind: 'delete', mortgageId: mortgage.id });
  }

  toggleComparison(mortgageId: string, scenarioId: string, checked: boolean): void {
    const id = scenarioKey(mortgageId, scenarioId);
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
    this.refreshCharts();
  }

  isSelected(mortgageId: string, scenarioId: string): boolean {
    return this.selectedIds().includes(scenarioKey(mortgageId, scenarioId));
  }

  selectedVariantCount(mortgage: Mortgage): number {
    return mortgage.scenarios
      .slice(1)
      .filter((scenario) => this.isSelected(mortgage.id, scenario.id)).length;
  }

  savedScenarioResult(mortgageId: string, scenarioId: string): ScenarioResult | undefined {
    return this.mortgageResults().find(
      (item) => item.mortgage.id === mortgageId && item.scenario.id === scenarioId,
    );
  }

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  selectedLowest(key: ResultKey): ScenarioResult | null {
    return (
      [...this.selectedResults()]
        .filter((item) => !this.hasUnpaidBalance(item))
        .sort((left, right) => left.result[key] - right.result[key])[0] ?? null
    );
  }

  hasUnpaidBalance(item: ScenarioResult): boolean {
    return Math.round(item.result.remainingCapital * 100) > 1;
  }

  markerColor(mortgageId: string, scenarioId: string): string {
    const key = scenarioKey(mortgageId, scenarioId);
    const selectedIndex = this.selectedIds().indexOf(key);
    const mortgageIndex = this.mortgageResults().findIndex(
      (item) => scenarioKey(item.mortgage.id, item.scenario.id) === key,
    );
    return chartColors[(selectedIndex >= 0 ? selectedIndex : mortgageIndex) % chartColors.length];
  }

  amortizationColor(scenario: Scenario, id: string): string {
    const index = scenario.amortizations.findIndex((item) => item.id === id);
    return amortizationColors[(index < 0 ? 0 : index) % amortizationColors.length];
  }

  rateTypeLabel(type: Mortgage['rateType']): string {
    return type === 'fixed' ? 'Fija' : 'Variable';
  }

  relativeCost(item: ScenarioResult): number {
    return relativeCostPer100(item.mortgage, item.result);
  }

  resultLabel(item: ScenarioResult | null | undefined): string {
    return item ? `${item.mortgage.name} · ${item.scenario.name}` : 'Selecciona ofertas';
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
      const currentMortgages = this.mortgages();
      const importedMortgages = result.value;
      if (
        currentMortgages.length > 0 &&
        !window.confirm(
          `Importar sustituirá tus ${currentMortgages.length} ofertas actuales. ¿Continuar?`,
        )
      ) {
        this.status.set('Importación cancelada.');
        return;
      }
      const updatedAt = new Date().toISOString();
      const mortgages = this.activeAccountUid
        ? importedMortgages.map((mortgage) => ({ ...mortgage, updatedAt }))
        : importedMortgages;
      this.mortgages.set(mortgages);
      this.selectedIds.set(
        mortgages
          .slice(0, 2)
          .flatMap((mortgage) =>
            mortgage.scenarios.slice(0, 1).map((scenario) => scenarioKey(mortgage.id, scenario.id)),
          ),
      );
      this.editingId.set(null);
      this.draft = emptyMortgage();
      this.selectedScenarioId.set(this.draft.scenarios[0].id);
      this.status.set('Importación completada.');
      this.commitChanges({ kind: 'replace', previous: currentMortgages, updatedAt });
    } catch {
      this.status.set('No se pudo leer el archivo seleccionado.');
    } finally {
      input.value = '';
    }
  }

  trackScenarioResult(_index: number, item: ScenarioResult): string {
    return scenarioKey(item.mortgage.id, item.scenario.id);
  }

  private viewFromUrl(): ViewName {
    const segment = this.router.url.split('?')[0].split('/').filter(Boolean)[0];
    return segment === 'mortgages' || segment === 'comparison' ? segment : 'dashboard';
  }

  private lowest(key: ResultKey): ScenarioResult | null {
    return (
      [...this.mortgageResults()]
        .filter((item) => !this.hasUnpaidBalance(item))
        .sort((left, right) => left.result[key] - right.result[key])[0] ?? null
    );
  }

  private async connectAccount(user: FirebaseUserSummary, force = false): Promise<void> {
    if (this.activeAccountUid === user.uid && this.accountSyncActive()) return;
    if (!force && this.deferredAccountUid === user.uid) return;
    if (this.activeAccountUid !== user.uid) {
      this.cloudSync.stop();
      this.activeAccountUid = null;
      this.accountSyncActive.set(false);
    }
    const transition = ++this.accountTransition;
    const guest = loadMortgages(localStorage).mortgages;
    try {
      const account = await this.cloudSync.previewAccount(user.uid);
      if (transition !== this.accountTransition) return;
      if (guest.length > 0) {
        const merge = reconcileGuestOffers(
          guest,
          account,
          this.cloudSync.pendingOperations(user.uid),
        );
        this.mortgages.set(guest);
        this.reconciliation.set({
          uid: user.uid,
          guest,
          account,
          merged: merge.merged,
          transfer: merge.transfer,
        });
        this.status.set('Elige cómo combinar tus ofertas de invitado con la cuenta.');
        return;
      }
      this.activateAccount(user.uid, account, []);
    } catch (error) {
      if (transition !== this.accountTransition) return;
      let cached: Mortgage[] | null;
      try {
        cached = this.cloudSync.cachedView(user.uid);
      } catch (cacheError) {
        this.status.set(`No se pudo leer la caché de la cuenta. ${readableError(cacheError)}`);
        return;
      }
      if (cached && guest.length === 0) {
        this.activateAccount(user.uid, cached, []);
        this.status.set(
          `Se usa la caché local de la cuenta; la nube no está disponible. ${readableError(error)}`,
        );
      } else {
        this.status.set(
          `No se pudo consultar la cuenta. Tus ofertas de invitado siguen intactas. ${readableError(error)}`,
        );
      }
    }
  }

  private activateAccount(uid: string, mortgages: Mortgage[], transfer: Mortgage[]): void {
    try {
      this.cloudSync.activate(uid, mortgages, transfer, (updated) => this.showMortgages(updated));
    } catch (error) {
      this.activeAccountUid = null;
      this.accountSyncActive.set(false);
      this.status.set(
        `No se pudo activar la sincronización. Tus datos no se han enviado. ${readableError(error)}`,
      );
      return;
    }
    this.deferredAccountUid = null;
    this.activeAccountUid = uid;
    this.accountSyncActive.set(true);
    this.reconciliation.set(null);
    this.showMortgages(mortgages);
  }

  private showMortgages(mortgages: Mortgage[]): void {
    this.mortgages.set(mortgages);
    const available = new Set(
      mortgages.flatMap((mortgage) =>
        mortgage.scenarios.map((scenario) => scenarioKey(mortgage.id, scenario.id)),
      ),
    );
    this.selectedIds.update((ids) => {
      const retained = ids.filter((id) => available.has(id));
      return retained.length
        ? retained
        : mortgages
            .slice(0, 2)
            .flatMap((mortgage) =>
              mortgage.scenarios
                .slice(0, 1)
                .map((scenario) => scenarioKey(mortgage.id, scenario.id)),
            );
    });
    if (
      !mortgages.some((mortgage) =>
        mortgage.scenarios.some((scenario) => scenario.id === this.selectedScenarioId()),
      )
    ) {
      this.selectedScenarioId.set(mortgages[0]?.scenarios[0]?.id ?? '');
    }
  }

  private loadGuestData(): void {
    const loaded = loadMortgages(localStorage);
    this.showMortgages(loaded.mortgages);
    if (loaded.notice) this.status.set(loaded.notice);
  }

  private commitChanges(mutation?: CloudMutation): void {
    try {
      if (this.activeAccountUid) {
        if (!mutation) throw new Error('Falta el tipo de cambio de la cuenta.');
        if (mutation.kind === 'upsert') {
          this.cloudSync.recordUpsert(this.activeAccountUid, mutation.mortgage, this.mortgages());
        } else if (mutation.kind === 'delete') {
          this.cloudSync.recordDelete(
            this.activeAccountUid,
            mutation.mortgageId,
            new Date().toISOString(),
            this.mortgages(),
          );
        } else {
          const currentIds = new Set(this.mortgages().map((mortgage) => mortgage.id));
          const deletedIds = mutation.previous
            .filter((mortgage) => !currentIds.has(mortgage.id))
            .map((mortgage) => mortgage.id);
          this.cloudSync.recordReplacement(
            this.activeAccountUid,
            this.mortgages(),
            deletedIds,
            mutation.updatedAt,
          );
        }
      } else {
        localStorage.setItem(STORAGE_KEY, serializeMortgages(this.mortgages()));
      }
    } catch (error) {
      this.status.set(
        `No se pudo guardar en este dispositivo. Exporta los escenarios para conservarlos. ${readableError(error)}`,
      );
    }
    this.refreshCharts();
  }

  private refreshCharts(): void {
    requestAnimationFrame(() => this.renderCharts());
  }

  private renderCharts(): void {
    const rows = this.selectedResults();
    const labels = comparisonMonthLabels(rows);
    const lineData = rows.map((item, index) => ({
      label: `${item.mortgage.name} · ${item.scenario.name}`,
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
          labels: ['Coste total', 'Intereses', 'Bonificaciones', 'Comisiones por amortización'],
          datasets: rows.map((item, index) => ({
            label: `${item.mortgage.name} · ${item.scenario.name}`,
            data: [
              item.result.totalCost,
              item.result.totalInterest,
              item.result.bonusCost,
              item.result.amortizationFees,
            ],
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
