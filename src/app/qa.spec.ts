import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { Workspace } from './workspace';
import { MortgageFormComponent } from './mortgage-form';
import { Mortgage, calculateMortgage, relativeCostPer100 } from './mortgage-calculator';

function offer(overrides: Partial<Mortgage> = {}): Mortgage {
  return {
    id: 'o1',
    name: 'Oferta',
    bank: 'Banco',
    amount: 100000,
    years: 25,
    interestRate: 3,
    rateType: 'fixed',
    bonuses: [],
    amortizations: [],
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
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
      form.bonusDraft = { name: 'Seguro', interestReduction: 0.2, annualCost: 0, startMonth: 50, endMonth: 10 };

      form.addBonus();

      expect(form.draft.bonuses).toEqual([]);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Seguro');
    });

    it('acepta una bonificación sin mes final (hasta el final)', () => {
      const form = new MortgageFormComponent();
      form.draft = offer();
      form.bonusDraft = { name: 'Seguro', interestReduction: 0.2, annualCost: 0, startMonth: 1, endMonth: null };

      form.addBonus();

      expect(form.draft.bonuses).toHaveLength(1);
      expect(form.draft.bonuses[0].endMonth).toBeUndefined();
    });

    it('avisa de una amortización que cae fuera del plazo sin bloquearla', () => {
      const form = new MortgageFormComponent();
      const messages: string[] = [];
      form.notify.subscribe((message: string) => messages.push(message));
      form.draft = offer({ years: 25 });
      form.amortizationDraft = {
        name: '',
        type: 'single',
        reductionType: 'payment',
        amount: 1000,
        month: 400,
        frequencyMonths: 12,
      };

      form.addAmortization();

      expect(form.draft.amortizations).toHaveLength(1);
      expect(messages).toEqual([expect.stringContaining('fuera del plazo')]);
    });

    it('muestra un error al añadir una amortización inválida', () => {
      const form = new MortgageFormComponent();
      const messages: string[] = [];
      form.notify.subscribe((message: string) => messages.push(message));
      form.draft = offer();
      form.amortizationDraft = {
        name: '',
        type: 'recurring',
        reductionType: 'term',
        amount: 1000,
        month: 12,
        frequencyMonths: 0,
      };

      form.addAmortization();

      expect(form.draft.amortizations).toEqual([]);
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
    workspace.selectedIds.set(['a', 'b']);
    fixture.detectChanges();

    expect(workspace.comparable()).toBe(false);
    expect(workspace.lowestRelativeCost()?.mortgage.id).toBe('b');
    expect(fixture.nativeElement.textContent).toContain('no es directamente comparable');
  });

  it('no muestra aviso con ofertas de igual capital y plazo', () => {
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([lowAmount, offer({ id: 'c', name: 'Oferta C', amount: 100000, interestRate: 2 })]);
    workspace.selectedIds.set(['a', 'c']);
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
    const withCost = calculateMortgage(offer({
      interestRate: 3,
      bonuses: [{ id: 'b', name: 'Seguro', active: true, interestReduction: 0, annualCost: 1200 }],
    }));

    expect(withCost.annualPercentageRate).toBeGreaterThan(plain.annualPercentageRate);
  });

  it.each([30000, 100000, 500000])('nunca devuelve NaN ni Infinity con un plazo de %s años (F7)', (years) => {
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
    expect(result.rows.every((row) => Number.isFinite(row.payment) && Number.isFinite(row.remainingCapital))).toBe(true);
  });

  it('no devuelve valores no finitos con importes o tipos enormes (F7)', () => {
    const result = calculateMortgage(offer({ amount: 1e308, interestRate: 1e308 }));

    expect(Number.isFinite(result.totalCost)).toBe(true);
    expect(Number.isFinite(result.firstPayment)).toBe(true);
  });
});
