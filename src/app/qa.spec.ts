import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { Workspace } from './workspace';
import { MortgageFormComponent } from './mortgage-form';
import {
  Amortization,
  AmortizationMode,
  Bonus,
  Mortgage,
  Scenario,
  calculateMortgage as calculateScenario,
  maxAmortizableAt,
  relativeCostPer100,
} from './mortgage-calculator';

type ScenarioInput = Omit<Scenario, 'mode'> & { mode?: AmortizationMode };
type OfferOverrides = Partial<Omit<Mortgage, 'scenarios'>> & {
  scenarios?: ScenarioInput[];
  bonuses?: Bonus[];
  amortizations?: Amortization[];
};

function offer(overrides: OfferOverrides = {}): Mortgage {
  const { bonuses = [], amortizations = [], scenarios, ...common } = overrides;
  return {
    id: 'o1',
    name: 'Oferta',
    bank: 'Banco',
    amount: 100000,
    years: 25,
    interestRate: 3,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: scenarios?.map((scenario) => ({
      ...scenario,
      mode: scenario.mode ?? 'reduceInstallment',
    })) ?? [
      {
        id: `${overrides.id ?? 'o1'}-base`,
        name: 'Base',
        bonuses,
        amortizations,
        mode: 'reduceInstallment',
      },
    ],
    updatedAt: new Date(0).toISOString(),
    ...common,
  };
}

function calculateMortgage(
  mortgage: Mortgage & { bonuses?: Bonus[]; amortizations?: Amortization[] },
  scenario?: Scenario,
) {
  const baseScenario = scenario ?? {
    ...mortgage.scenarios[0],
    bonuses: mortgage.bonuses ?? mortgage.scenarios[0].bonuses,
    amortizations: mortgage.amortizations ?? mortgage.scenarios[0].amortizations,
  };
  return calculateScenario(mortgage, baseScenario);
}

function createWorkspace(): Workspace {
  const fixture = TestBed.createComponent(Workspace);
  return fixture.componentInstance;
}

describe('QA: validación de ofertas en Workspace', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Workspace], providers: [provideRouter(routes)] });
  });

  afterEach(() => localStorage.clear());

  describe('F1: tipo de interés vacío', () => {
    it.each([null, undefined, NaN])('no guarda una oferta con tipo %s', (rate) => {
      const workspace = createWorkspace();
      workspace.draft = offer({ interestRate: rate as unknown as number });

      workspace.saveMortgage();

      expect(workspace.mortgages()).toEqual([]);
      expect(workspace.status()).toBe('Indica un tipo de interés igual o superior a 0.');
    });

    it('acepta un tipo explícito de 0 %', () => {
      const workspace = createWorkspace();
      workspace.draft = offer({ interestRate: 0 });

      workspace.saveMortgage();

      expect(workspace.mortgages()).toHaveLength(1);
    });
  });

  describe('F2: tipo de interés negativo', () => {
    it('no guarda una oferta con tipo -3 %', () => {
      const workspace = createWorkspace();
      workspace.draft = offer({ interestRate: -3 });

      workspace.saveMortgage();

      expect(workspace.mortgages()).toEqual([]);
      expect(workspace.status()).toBe('Indica un tipo de interés igual o superior a 0.');
    });
  });

  describe('F4: plazos y bonificaciones incoherentes', () => {
    it('no guarda un plazo de 200 años', () => {
      const workspace = createWorkspace();
      workspace.draft = offer({ years: 200 });

      workspace.saveMortgage();

      expect(workspace.mortgages()).toEqual([]);
      expect(workspace.status()).toContain('entre 1 y 50 años');
    });

    it('rechaza una bonificación con fin anterior al inicio y muestra un error', () => {
      const form = new MortgageFormComponent();
      const messages: string[] = [];
      form.notify.subscribe((message: string) => messages.push(message));
      form.draft = offer();
      form.scenario = form.draft.scenarios[0];
      form.bonusDraft = {
        name: 'Seguro',
        interestReduction: 0.2,
        annualCost: 0,
        startMonth: 50,
        endMonth: 10,
      };

      form.addBonus();

      expect(form.scenario.bonuses).toEqual([]);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Seguro');
    });

    it('acepta una bonificación sin mes final (hasta el final)', () => {
      const form = new MortgageFormComponent();
      form.draft = offer();
      form.scenario = form.draft.scenarios[0];
      form.bonusDraft = {
        name: 'Seguro',
        interestReduction: 0.2,
        annualCost: 0,
        startMonth: 1,
        endMonth: null,
      };

      form.addBonus();

      expect(form.scenario.bonuses).toHaveLength(1);
      expect(form.scenario.bonuses[0].endMonth).toBeUndefined();
    });

    it('rechaza una amortización que cae fuera del plazo', () => {
      const form = new MortgageFormComponent();
      const messages: string[] = [];
      form.notify.subscribe((message: string) => messages.push(message));
      form.draft = offer({ years: 25 });
      form.scenario = form.draft.scenarios[0];
      form.amortizationDraft = {
        name: '',
        type: 'single',
        reductionType: 'payment',
        amount: 1000,
        month: 400,
        frequencyMonths: 12,
      };

      form.addAmortization();

      expect(form.scenario.amortizations).toHaveLength(0);
      expect(messages).toEqual(['La hipoteca ya está cancelada o termina antes del mes 400.']);
    });

    it('muestra un error al añadir una amortización inválida', () => {
      const form = new MortgageFormComponent();
      const messages: string[] = [];
      form.notify.subscribe((message: string) => messages.push(message));
      form.draft = offer();
      form.scenario = form.draft.scenarios[0];
      form.amortizationDraft = {
        name: '',
        type: 'recurring',
        reductionType: 'term',
        amount: 1000,
        month: 12,
        frequencyMonths: 0,
      };

      form.addAmortization();

      expect(form.scenario.amortizations).toEqual([]);
      expect(messages).toHaveLength(1);
    });
  });
});

describe('QA: comparador de ofertas no comparables (F3)', () => {
  const lowAmount = offer({ id: 'a', name: 'Oferta A', amount: 100000, interestRate: 5 });
  const highAmount = offer({ id: 'b', name: 'Oferta B', amount: 200000, interestRate: 1 });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Workspace], providers: [provideRouter(routes)] });
  });

  afterEach(() => localStorage.clear());

  it('avisa cuando las ofertas seleccionadas tienen distinto capital y señala la mejor por cada 100 €', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([lowAmount, highAmount]);
    workspace.selectedIds.set([JSON.stringify(['a', 'a-base']), JSON.stringify(['b', 'b-base'])]);
    fixture.detectChanges();

    expect(workspace.comparable()).toBe(false);
    expect(workspace.lowestRelativeCost()?.mortgage.id).toBe('b');
    expect(fixture.nativeElement.textContent).toContain('no es directamente comparable');
  });

  it('no muestra aviso con ofertas de igual capital y plazo', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([
      lowAmount,
      offer({ id: 'c', name: 'Oferta C', amount: 100000, interestRate: 2 }),
    ]);
    workspace.selectedIds.set([JSON.stringify(['a', 'a-base']), JSON.stringify(['c', 'c-base'])]);
    fixture.detectChanges();

    expect(workspace.comparable()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('no es directamente comparable');
  });

  it('calcula el coste financiero por cada 100 € prestados', () => {
    const resultA = calculateMortgage(lowAmount);
    const resultB = calculateMortgage(highAmount);

    expect(relativeCostPer100(lowAmount, resultA)).toBeCloseTo(75.38, 1);
    expect(relativeCostPer100(highAmount, resultB)).toBeGreaterThan(13);
    expect(relativeCostPer100(highAmount, resultB)).toBeLessThan(13.1);
  });
});

describe('QA: revalidación en cadena de cantidades mensuales', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Workspace], providers: [provideRouter(routes)] });
  });

  afterEach(() => localStorage.clear());

  function addCancellationAtMonth100(mortgage: Mortgage): Mortgage {
    const scenario = mortgage.scenarios[0];
    const amount = maxAmortizableAt(mortgage, scenario, 100) / 100;
    scenario.amortizations = [
      {
        id: 'cancellation',
        name: 'Cancelación total',
        active: true,
        type: 'single',
        reductionType: 'payment',
        amount,
        month: 100,
      },
    ];
    return mortgage;
  }

  it('rejects enabling a budget that invalidates a month-100 cancellation and unchecks the control', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    const mortgage = addCancellationAtMonth100(offer());
    workspace.draft = mortgage;
    workspace.selectedScenarioId.set(mortgage.scenarios[0].id);
    workspace.activeView.set('mortgages');
    fixture.detectChanges();

    const enabled = fixture.nativeElement.querySelector(
      'input[name="monthlyBudgetEnabled"]',
    ) as HTMLInputElement;
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(workspace.activeScenario()?.monthlyBudget).toBeUndefined();
    expect(enabled.checked).toBe(false);
    expect(workspace.status()).toContain(
      'Este cambio dejaría la amortización del mes 100 por encima del capital restante',
    );
  });

  it('rejects a monthly amount that invalidates a cancellation and restores the input value', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    const mortgage = addCancellationAtMonth100(offer());
    mortgage.scenarios[0].monthlyBudget = { amount: 1, startMonth: 1 };
    workspace.draft = mortgage;
    workspace.selectedScenarioId.set(mortgage.scenarios[0].id);
    workspace.activeView.set('mortgages');
    fixture.detectChanges();

    const amount = fixture.nativeElement.querySelector(
      'input[name="monthlyBudgetAmount"]',
    ) as HTMLInputElement;
    amount.value = '1000';
    amount.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(workspace.activeScenario()?.monthlyBudget?.amount).toBe(1);
    expect(amount.value).toBe('1');
    expect(workspace.status()).toContain('Este cambio dejaría la amortización del mes 100');
  });

  it('rejects a mode change that invalidates a cancellation and restores the select', () => {
    const mortgage = offer({
      amount: 100000,
      years: 20,
      interestRate: 4,
      cancellationFees: { partial: [{ fromMonth: 1, percent: 50 }], total: [] },
    });
    const scenario = mortgage.scenarios[0];
    const settings = [
      { amount: 600, endMonth: 12 },
      { amount: 800, endMonth: 24 },
      { amount: 1200, endMonth: 36 },
      { amount: 1600, endMonth: 60 },
    ];
    const differentBalances = settings
      .map((budget) => {
        const installment = {
          ...scenario,
          mode: 'reduceInstallment' as const,
          monthlyBudget: { ...budget, startMonth: 1 },
        };
        const term = {
          ...scenario,
          mode: 'reduceTerm' as const,
          monthlyBudget: { ...budget, startMonth: 1 },
        };
        return {
          installment,
          term,
          installmentBalance: maxAmortizableAt(mortgage, installment, 100),
          termBalance: maxAmortizableAt(mortgage, term, 100),
        };
      })
      .find((item) => item.installmentBalance !== item.termBalance)!;
    const initialScenario =
      differentBalances.installmentBalance > differentBalances.termBalance
        ? differentBalances.installment
        : differentBalances.term;
    const nextMode = initialScenario.mode === 'reduceTerm' ? 'reduceInstallment' : 'reduceTerm';
    mortgage.scenarios[0] = {
      ...initialScenario,
      amortizations: [
        {
          id: 'cancellation',
          name: 'Cancelación total',
          active: true,
          type: 'single',
          reductionType: 'payment',
          amount:
            Math.max(differentBalances.installmentBalance, differentBalances.termBalance) / 100,
          month: 100,
        },
      ],
    };
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.draft = mortgage;
    workspace.selectedScenarioId.set(mortgage.scenarios[0].id);
    workspace.activeView.set('mortgages');
    fixture.detectChanges();

    const mode = fixture.nativeElement.querySelector(
      'select[name="scenarioAmortizationMode"]',
    ) as HTMLSelectElement;
    mode.value = nextMode;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(workspace.activeScenario()?.mode).toBe(initialScenario.mode);
    expect(mode.value).toBe(initialScenario.mode);
    expect(workspace.status()).toContain('Este cambio dejaría la amortización del mes 100');
  });

  it('allows a temporarily empty monthly amount and accepts a valid replacement', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    const mortgage = offer();
    mortgage.scenarios[0].monthlyBudget = { amount: 1000, startMonth: 1 };
    workspace.draft = mortgage;
    workspace.selectedScenarioId.set(mortgage.scenarios[0].id);
    workspace.activeView.set('mortgages');
    fixture.detectChanges();

    const amount = fixture.nativeElement.querySelector(
      'input[name="monthlyBudgetAmount"]',
    ) as HTMLInputElement;
    amount.value = '';
    amount.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(workspace.activeScenario()?.monthlyBudget?.amount).toBe(0);

    amount.value = '800';
    amount.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(workspace.activeScenario()?.monthlyBudget?.amount).toBe(800);
    expect(amount.value).toBe('800');
  });

  it('keeps saveMortgage as a final validation guard for invalid budget fields', () => {
    const workspace = createWorkspace();
    workspace.draft = offer();
    workspace.draft.scenarios[0].monthlyBudget = { amount: 0, startMonth: 1 };

    workspace.saveMortgage();

    expect(workspace.mortgages()).toEqual([]);
    expect(workspace.status()).toContain('debe ser un número mayor que 0');
  });
});

describe('QA: gestión de escenarios', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Workspace], providers: [provideRouter(routes)] });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('crea una hipoteca nueva con un único escenario Base', () => {
    const workspace = createWorkspace();

    workspace.openNewMortgage();

    expect(workspace.draft.scenarios).toHaveLength(1);
    expect(workspace.draft.scenarios[0]).toMatchObject({
      name: 'Base',
      bonuses: [],
      amortizations: [],
    });
  });

  it('edita la cantidad mensual y el modo del escenario', async () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.openNewMortgage();
    fixture.detectChanges();

    const enabled = fixture.nativeElement.querySelector(
      'input[name="monthlyBudgetEnabled"]',
    ) as HTMLInputElement;
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const amount = fixture.nativeElement.querySelector(
      'input[name="monthlyBudgetAmount"]',
    ) as HTMLInputElement;
    amount.value = '1500';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    amount.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const mode = fixture.nativeElement.querySelector(
      'select[name="scenarioAmortizationMode"]',
    ) as HTMLSelectElement;
    mode.value = 'reduceTerm';
    mode.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(workspace.activeScenario()?.monthlyBudget?.amount).toBe(1500);
    expect(workspace.activeScenario()?.monthlyBudget?.startMonth).toBe(1);
    expect(workspace.activeScenario()?.mode).toBe('reduceTerm');
    expect(fixture.nativeElement.querySelector('.mortgage-editor').textContent).toContain(
      'Reducir plazo mantiene la cuota ordinaria',
    );
    expect(fixture.nativeElement.querySelector('.mortgage-editor').textContent).toContain(
      'ambos modos tienen el mismo coste total y plazo',
    );
  });

  it('muestra en el editor los eventos del escenario seleccionado', () => {
    const mortgage = offer({
      scenarios: [
        {
          id: 'base',
          name: 'Base',
          bonuses: [
            {
              id: 'base-bonus',
              name: 'Bono base',
              active: true,
              interestReduction: 0.2,
              annualCost: 0,
            },
          ],
          amortizations: [],
        },
        {
          id: 'alternative',
          name: 'Alternativo',
          bonuses: [
            {
              id: 'alt-bonus',
              name: 'Bono alternativo',
              active: true,
              interestReduction: 0.5,
              annualCost: 0,
            },
          ],
          amortizations: [],
        },
      ],
    });
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([mortgage]);
    workspace.editMortgage(mortgage, 'base');
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector(
      'select[aria-label="Seleccionar escenario"]',
    ) as HTMLSelectElement;
    selector.value = 'alternative';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const editorText = fixture.nativeElement.querySelector('.mortgage-editor').textContent;
    expect(workspace.selectedScenarioId()).toBe('alternative');
    expect(editorText).toContain('Bono alternativo');
    expect(editorText).not.toContain('Bono base');
  });

  it('duplica escenarios con identificadores y contenido independientes', () => {
    const workspace = createWorkspace();
    workspace.draft = offer({
      scenarios: [
        {
          id: 'base',
          name: 'Base',
          bonuses: [
            { id: 'bonus', name: 'Nómina', active: true, interestReduction: 0.5, annualCost: 0 },
          ],
          amortizations: [
            {
              id: 'extra',
              name: 'Extra',
              active: true,
              type: 'single',
              reductionType: 'term',
              amount: 1000,
              month: 12,
            },
          ],
        },
      ],
    });
    workspace.selectedScenarioId.set('base');

    workspace.duplicateScenario();

    const original = workspace.draft.scenarios[0];
    const duplicate = workspace.activeScenario()!;
    expect(duplicate.name).toBe('Base (copia)');
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.bonuses[0].id).not.toBe(original.bonuses[0].id);
    expect(duplicate.amortizations[0].id).not.toBe(original.amortizations[0].id);
    duplicate.bonuses[0].active = false;
    duplicate.amortizations[0].amount = 2000;
    expect(original.bonuses[0].active).toBe(true);
    expect(original.amortizations[0].amount).toBe(1000);
  });

  it('recorta nombres y rechaza un nombre vacío', () => {
    const workspace = createWorkspace();
    workspace.draft = offer();
    workspace.selectedScenarioId.set('o1-base');
    vi.stubGlobal('prompt', () => '  Plan alternativo  ');

    workspace.renameScenario();

    expect(workspace.activeScenario()?.name).toBe('Plan alternativo');
    vi.stubGlobal('prompt', () => '   ');
    workspace.renameScenario();
    expect(workspace.activeScenario()?.name).toBe('Plan alternativo');
    expect(workspace.status()).toContain('no puede estar vacío');
  });

  it('pide confirmación al eliminar y protege el último escenario', () => {
    const workspace = createWorkspace();
    workspace.draft = offer({
      scenarios: [
        { id: 'first', name: 'Base', bonuses: [], amortizations: [] },
        { id: 'second', name: 'Alternativo', bonuses: [], amortizations: [] },
      ],
    });
    workspace.selectedScenarioId.set('first');
    vi.stubGlobal('confirm', () => true);

    workspace.deleteScenario();

    expect(workspace.draft.scenarios).toHaveLength(1);
    expect(workspace.draft.scenarios[0].id).toBe('second');
    expect(workspace.selectedScenarioId()).toBe('second');
    workspace.deleteScenario();
    expect(workspace.draft.scenarios).toHaveLength(1);
    expect(workspace.status()).toContain('al menos un escenario');
  });
});

describe('QA: motor de cálculo', () => {
  it('marca cuando las bonificaciones superan el tipo de interés (F8)', () => {
    const bonus = { id: 'b', name: 'Bono', active: true, interestReduction: 1, annualCost: 0 };

    expect(calculateMortgage(offer({ interestRate: 0.5, bonuses: [bonus] })).rateCapped).toBe(true);
    expect(calculateMortgage(offer({ interestRate: 3, bonuses: [bonus] })).rateCapped).toBe(false);
  });

  it('calcula la TAE de un préstamo sin bonificaciones como tipo nominal capitalizado mensualmente (F3)', () => {
    const result = calculateMortgage(offer({ amount: 100000, years: 25, interestRate: 3 }));

    expect(result.annualPercentageRate).toBeCloseTo((Math.pow(1 + 0.03 / 12, 12) - 1) * 100, 6);
  });

  it('eleva la TAE cuando hay coste de bonificaciones (F3)', () => {
    const plain = calculateMortgage(offer({ interestRate: 3 }));
    const withCost = calculateMortgage(
      offer({
        interestRate: 3,
        bonuses: [
          { id: 'b', name: 'Seguro', active: true, interestReduction: 0, annualCost: 1200 },
        ],
      }),
    );

    expect(withCost.annualPercentageRate).toBeGreaterThan(plain.annualPercentageRate);
  });

  it.each([30000, 100000, 500000])(
    'nunca devuelve NaN ni Infinity con un plazo de %s años (F7)',
    (years) => {
      const result = calculateMortgage(offer({ years }));
      const scalars = [
        result.firstPayment,
        result.totalInterest,
        result.totalCost,
        result.remainingCapital,
        result.bonusCost,
        result.amortizationSavings,
        result.annualPercentageRate,
      ];

      expect(scalars.every((value) => Number.isFinite(value))).toBe(true);
      expect(
        result.rows.every(
          (row) => Number.isFinite(row.payment) && Number.isFinite(row.remainingCapital),
        ),
      ).toBe(true);
    },
  );

  it('no devuelve valores no finitos con importes o tipos enormes (F7)', () => {
    const result = calculateMortgage(offer({ amount: 1e308, interestRate: 1e308 }));

    expect(Number.isFinite(result.totalCost)).toBe(true);
    expect(Number.isFinite(result.firstPayment)).toBe(true);
  });
});
