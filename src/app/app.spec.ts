import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { Mortgage, calculateMortgage } from './mortgage-calculator';

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

  it('calculates a zero-interest French schedule to the cent', () => {
    const result = calculateMortgage(createMortgage({ amount: 10000, years: 1, interestRate: 0 }));
    expect(result.rows).toHaveLength(12);
    expect(result.firstPayment).toBe(833.33);
    expect(result.totalInterest).toBe(0);
    expect(result.remainingCapital).toBe(0);
    expect(result.totalCost).toBe(10000);
  });

  it('preserves the annual bonus cost across monthly periods', () => {
    const result = calculateMortgage(createMortgage({
      amount: 12000,
      years: 1,
      interestRate: 0,
      bonuses: [{ id: 'home', name: 'Hogar', active: true, interestReduction: 0, annualCost: 100 }],
    }));
    expect(result.bonusCost).toBe(100);
    expect(result.totalCost).toBe(12100);
  });

  it('applies a limited bonus and extra principal in the specified month', () => {
    const result = calculateMortgage(createMortgage({
      amount: 100000,
      years: 10,
      interestRate: 3,
      bonuses: [{ id: 'salary', name: 'Nómina', active: true, interestReduction: 1, annualCost: 120, startMonth: 1, endMonth: 1 }],
      amortizations: [createAmortization({ id: 'extra', amount: 5000, month: 2 })],
    }));
    expect(result.rows[0].interest).toBe(166.67);
    expect(result.rows[1].interest).toBe(248.12);
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
    expect(termReduction.rows[1].payment).toBe(1666.67);
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

    expect(result.amortizationInterestSavings[0].savings).toBe(415.93);
    const unbonifiedResult = calculateMortgage(createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      amortizations: [createAmortization({ amount: 1000, month: 12 })],
    }));
    expect(unbonifiedResult.amortizationInterestSavings[0].savings).toBe(602.91);
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

    expect(result.amortizationInterestSavings[0].savings).toBe(1084.8);
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

    expect(result.rows[12].interest).toBe(
      Math.round((result.rows[11].remainingCapital * (2.55 / 1200) + Number.EPSILON) * 100) / 100,
    );
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
