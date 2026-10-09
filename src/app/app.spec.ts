import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { Mortgage, calculateMortgage } from './mortgage-calculator';
import { ChartViewportComponent } from './chart-viewport';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the routed app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('expands only the chart content when zoom changes and restores its original width', () => {
    const fixture = TestBed.createComponent(ChartViewportComponent);
    fixture.componentRef.setInput('label', 'Capital pendiente');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input')!;
    const content = element.querySelector<HTMLElement>('.chart-content')!;

    expect(content.style.width).toBe('100%');
    expect(input.getAttribute('aria-label')).toBe('Zoom: Capital pendiente');
    input.value = '300';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(content.style.width).toBe('300%');
    expect(element.querySelector('output')!.textContent).toBe('300%');

    input.value = '100';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(content.style.width).toBe('100%');
  });

  it('preserves full precision in a zero-interest French schedule', () => {
    const result = calculateMortgage(createMortgage({ amount: 10000, years: 1, interestRate: 0 }));
    expect(result.rows).toHaveLength(12);
    expect(result.firstPayment).toBeCloseTo(10000 / 12, 12);
    expect(result.firstPayment).not.toBe(833.33);
    expect(result.totalInterest).toBe(0);
    expect(result.remainingCapital).toBe(0);
    expect(result.totalCost).toBe(10000);
  });

  it('keeps the payment formula stable for rates close to zero', () => {
    const result = calculateMortgage(createMortgage({
      amount: 10000,
      years: 1,
      interestRate: 1.2e-14,
    }));

    expect(Number.isFinite(result.firstPayment)).toBe(true);
    expect(result.firstPayment).toBeCloseTo(10000 / 12, 12);
  });

  it('preserves the annual bonus cost across monthly periods', () => {
    const result = calculateMortgage(createMortgage({
      amount: 12000,
      years: 1,
      interestRate: 0,
      bonuses: [{ id: 'home', name: 'Hogar', active: true, interestReduction: 0, annualCost: 100 }],
    }));
    expect(result.bonusCost).toBeCloseTo(100, 10);
    expect(result.totalCost).toBeCloseTo(12100, 10);
  });

  it('applies a limited bonus and extra principal in the specified month', () => {
    const result = calculateMortgage(createMortgage({
      amount: 100000,
      years: 10,
      interestRate: 3,
      bonuses: [{ id: 'salary', name: 'Nómina', active: true, interestReduction: 1, annualCost: 120, startMonth: 1, endMonth: 1 }],
      amortizations: [createAmortization({ id: 'extra', amount: 5000, month: 2 })],
    }));
    expect(result.rows[0].interest).toBeCloseTo(166.6666666667, 10);
    expect(result.rows[1].interest).toBeCloseTo(248.12, 2);
    expect(result.rows[1].extraPayment).toBe(5000);
    expect(result.rows[1].payment).toBeLessThan(1000);
    expect(result.amortizationSavings).toBeGreaterThan(0);
    expect(result.amortizationInterestSavings).toEqual([
      { id: 'extra', savings: expect.any(Number) },
    ]);
    expect(result.amortizationInterestSavings[0].savings).toBeGreaterThan(0);
  });

  it('shortens the schedule for term reduction and lowers future installments for payment reduction', () => {
    const termReduction = calculateMortgage(createMortgage({
      amount: 100000,
      years: 5,
      interestRate: 0,
      amortizations: [createAmortization({ id: 'term', reductionType: 'term', amount: 5000, month: 1 })],
    }));
    const paymentReduction = calculateMortgage(createMortgage({
      amount: 100000,
      years: 5,
      interestRate: 0,
      amortizations: [createAmortization({ id: 'payment', reductionType: 'payment', amount: 5000, month: 1 })],
    }));

    expect(termReduction.rows.length).toBeLessThan(paymentReduction.rows.length);
    expect(termReduction.rows[1].payment).toBeCloseTo(50000 / 30, 10);
    expect(paymentReduction.rows[1].payment).toBeLessThan(termReduction.rows[1].payment);
    expect(paymentReduction.rows[0].amortizationEvents).toEqual([
      { id: 'payment', name: 'Extra', amount: 5000 },
    ]);
  });

  it('does not apply unchecked amortizations or count their savings', () => {
    const result = calculateMortgage(createMortgage({
      amortizations: [createAmortization({ active: false, amount: 5000, month: 1 })],
    }));

    expect(result.rows[0].extraPayment).toBe(0);
    expect(result.rows[0].amortizationEvents).toEqual([]);
    expect(result.amortizationSavings).toBe(0);
    expect(result.amortizationInterestSavings).toEqual([]);
  });

  it('calculates payment-reduction savings using the effective bonified rate', () => {
    const result = calculateMortgage(createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      bonuses: [
        { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
        { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
      ],
      amortizations: [createAmortization({ amount: 1000, month: 12 })],
    }));

    expect(result.amortizationInterestSavings[0].savings).toBeCloseTo(415.93, 2);
    const unbonifiedResult = calculateMortgage(createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      amortizations: [createAmortization({ amount: 1000, month: 12 })],
    }));
    expect(unbonifiedResult.amortizationInterestSavings[0].savings).toBeCloseTo(602.91, 2);
  });

  it('calculates term-reduction savings using the effective bonified rate', () => {
    const result = calculateMortgage(createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      bonuses: [
        { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
        { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
      ],
      amortizations: [createAmortization({ reductionType: 'term', amount: 1000, month: 12 })],
    }));

    expect(result.amortizationInterestSavings[0].savings).toBeCloseTo(1084.8, 2);
  });

  it('chains same-month amortizations against the residual balance', () => {
    const mortgage = createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 2.55,
      amortizations: [
        createAmortization({ id: 'first', amount: 1000, month: 12 }),
        createAmortization({ id: 'second', amount: 500, month: 12 }),
      ],
    });
    const combined = calculateMortgage(mortgage);
    const equivalentSinglePayment = calculateMortgage({
      ...mortgage,
      amortizations: [createAmortization({ id: 'combined', amount: 1500, month: 12 })],
    });

    expect(combined.rows[11].amortizationEvents).toEqual([
      { id: 'first', name: 'Extra', amount: 1000 },
      { id: 'second', name: 'Extra', amount: 500 },
    ]);
    expect(combined.rows[11].remainingCapital).toBe(equivalentSinglePayment.rows[11].remainingCapital);
    expect(combined.totalInterest).toBe(equivalentSinglePayment.totalInterest);
  });

  it('keeps mixed same-month amortizations independent of their insertion order', () => {
    const amortizations = [
      createAmortization({ id: 'term', reductionType: 'term', amount: 1000, month: 12 }),
      createAmortization({ id: 'payment', reductionType: 'payment', amount: 500, month: 12 }),
    ];
    const forward = calculateMortgage(createMortgage({ amortizations }));
    const reverse = calculateMortgage(createMortgage({ amortizations: [...amortizations].reverse() }));
    const termPriority = calculateMortgage(createMortgage({
      amortizations: amortizations.map((item) => ({ ...item, reductionType: 'term' })),
    }));

    expect(forward.totalInterest).toBeCloseTo(reverse.totalInterest, 10);
    expect(forward.totalInterest).toBeCloseTo(termPriority.totalInterest, 10);
  });

  it('applies active bonuses only within their configured months', () => {
    const mortgage = createMortgage({
      years: 2,
      interestRate: 3,
      bonuses: [
        {
          id: 'limited',
          name: 'Bono temporal',
          active: true,
          interestReduction: 1,
          annualCost: 120,
          startMonth: 2,
          endMonth: 3,
        },
        {
          id: 'disabled',
          name: 'Bono desactivado',
          active: false,
          interestReduction: 2,
          annualCost: 240,
        },
      ],
      amortizations: [createAmortization({ amount: 1000, month: 2 })],
    });
    const result = calculateMortgage(mortgage);
    const withoutAmortization = calculateMortgage({ ...mortgage, amortizations: [] });

    expect(result.rows[0].interest).toBeCloseTo(250, 10);
    expect(result.rows[1].interest).toBeCloseTo(result.rows[0].remainingCapital * (0.02 / 12), 10);
    expect(result.rows[3].interest).toBeCloseTo(result.rows[2].remainingCapital * (0.03 / 12), 10);
    expect(result.bonusCost).toBeCloseTo(20, 10);
    expect(result.amortizationInterestSavings[0].savings).toBeCloseTo(
      withoutAmortization.totalInterest - result.totalInterest,
      10,
    );
  });

  it('applies later amortizations after the prior month has reduced the balance', () => {
    const result = calculateMortgage(createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 2.55,
      amortizations: [
        createAmortization({ id: 'first', amount: 1000, month: 12 }),
        createAmortization({ id: 'next-month', amount: 500, month: 13 }),
      ],
    }));

    expect(result.rows[12].interest).toBeCloseTo(result.rows[11].remainingCapital * (2.55 / 1200), 12);
    expect(result.rows[12].amortizationEvents).toEqual([
      { id: 'next-month', name: 'Extra', amount: 500 },
    ]);
  });
});

function createAmortization(
  overrides: Partial<Mortgage['amortizations'][number]> = {},
): Mortgage['amortizations'][number] {
  return {
    id: 'extra',
    name: 'Extra',
    active: true,
    type: 'single',
    reductionType: 'payment',
    amount: 1000,
    month: 12,
    ...overrides,
  };
}

function createMortgage(overrides: Partial<Mortgage>): Mortgage {
  return {
    id: 'test', name: 'Prueba', bank: 'Banco', amount: 100000, years: 10, interestRate: 3,
    rateType: 'fixed', bonuses: [], amortizations: [], updatedAt: new Date(0).toISOString(), ...overrides,
  };
}
