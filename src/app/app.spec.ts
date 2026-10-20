import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import {
  Amortization,
  AmortizationMode,
  Bonus,
  Mortgage,
  Scenario,
  calculateMortgage as calculateScenario,
  maxAmortizableAt,
} from './mortgage-calculator';
import { validateScenario } from './mortgage-validation';
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

  it('preserves the project reference payment for 100,000 € over 30 years at 3 %', () => {
    const result = calculateMortgage(
      createMortgage({ amount: 100000, years: 30, interestRate: 3 }),
    );

    expect(result.firstPayment).toBeCloseTo(421.6, 2);
  });

  it('preserves the project reference payment, interest and term through the scenario API', () => {
    const mortgage = createMortgage({ amount: 180000, years: 25, interestRate: 3.1 });
    const result = calculateMortgage(mortgage, mortgage.scenarios[0]);

    expect(result.firstPayment).toBeCloseTo(862.97, 2);
    expect(result.totalInterest).toBeCloseTo(78891.58, 2);
    expect(result.rows).toHaveLength(300);
  });

  it('calculates each scenario with its own bonuses and amortizations', () => {
    const mortgage = createMortgage({
      scenarios: [
        { id: 'plain', name: 'Sin bono', bonuses: [], amortizations: [] },
        {
          id: 'bonified',
          name: 'Bonificada',
          bonuses: [
            { id: 'bonus', name: 'Nómina', active: true, interestReduction: 0.5, annualCost: 0 },
          ],
          amortizations: [],
        },
      ],
    });
    const plain = calculateMortgage(mortgage, mortgage.scenarios[0]);
    const bonified = calculateMortgage(mortgage, mortgage.scenarios[1]);

    expect(bonified.firstPayment).toBeLessThan(plain.firstPayment);
    expect(bonified.totalInterest).toBeLessThan(plain.totalInterest);
  });

  it('matches the base payment and interest totals at both effective rates', () => {
    const bonified = calculateMortgage(
      createMortgage({ amount: 110000, years: 30, interestRate: 2.55 }),
    );
    const unbonified = calculateMortgage(
      createMortgage({ amount: 110000, years: 30, interestRate: 3.55 }),
    );

    expect(bonified.firstPayment).toBeCloseTo(437.5, 2);
    expect(bonified.totalInterest).toBeCloseTo(47499.26, 2);
    expect(unbonified.firstPayment).toBeCloseTo(497.02, 2);
    expect(unbonified.totalInterest).toBeCloseTo(68928.79, 2);
  });

  it('keeps the payment formula stable for rates close to zero', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 10000,
        years: 1,
        interestRate: 1.2e-14,
      }),
    );

    expect(Number.isFinite(result.firstPayment)).toBe(true);
    expect(result.firstPayment).toBeCloseTo(10000 / 12, 12);
  });

  it('preserves the annual bonus cost across monthly periods', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 12000,
        years: 1,
        interestRate: 0,
        bonuses: [
          { id: 'home', name: 'Hogar', active: true, interestReduction: 0, annualCost: 100 },
        ],
      }),
    );
    expect(result.bonusCost).toBeCloseTo(100, 10);
    expect(result.totalCost).toBeCloseTo(12100, 10);
  });

  it('applies a limited bonus and extra principal in the specified month', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 100000,
        years: 10,
        interestRate: 3,
        bonuses: [
          {
            id: 'salary',
            name: 'Nómina',
            active: true,
            interestReduction: 1,
            annualCost: 120,
            startMonth: 1,
            endMonth: 1,
          },
        ],
        amortizations: [createAmortization({ id: 'extra', amount: 5000, month: 2 })],
      }),
    );
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

  it('reprices a variable-rate payment after a payment-reduction amortization without extending maturity', () => {
    const mortgage = createMortgage({
      amount: 100000,
      years: 2,
      interestRate: 3,
      rateType: 'variable',
      bonuses: [
        {
          id: 'introductory',
          name: 'Bono temporal',
          active: true,
          interestReduction: 1,
          annualCost: 0,
          startMonth: 1,
          endMonth: 1,
        },
      ],
      amortizations: [createAmortization({ amount: 1000, month: 1 })],
    });
    const result = calculateMortgage(mortgage);
    const balanceAfterFirstMonth = result.rows[0].remainingCapital;
    const monthlyRate = 0.03 / 12;
    const remainingMonths = 23;
    const expectedPayment =
      (balanceAfterFirstMonth * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingMonths));

    expect(result.rows[1].payment).toBeCloseTo(expectedPayment, 9);
    expect(result.rows).toHaveLength(24);
    expect(result.remainingCapital).toBeCloseTo(0, 8);
  });

  it('shortens the schedule for term reduction and lowers future installments for payment reduction', () => {
    const termReduction = calculateMortgage(
      createMortgage({
        amount: 100000,
        years: 5,
        interestRate: 0,
        amortizations: [
          createAmortization({ id: 'term', reductionType: 'term', amount: 5000, month: 1 }),
        ],
      }),
    );
    const paymentReduction = calculateMortgage(
      createMortgage({
        amount: 100000,
        years: 5,
        interestRate: 0,
        amortizations: [
          createAmortization({ id: 'payment', reductionType: 'payment', amount: 5000, month: 1 }),
        ],
      }),
    );

    expect(termReduction.rows.length).toBeLessThan(paymentReduction.rows.length);
    expect(termReduction.rows[1].payment).toBeCloseTo(50000 / 30, 10);
    expect(paymentReduction.rows[1].payment).toBeLessThan(termReduction.rows[1].payment);
    expect(paymentReduction.rows[0].amortizationEvents).toEqual([
      {
        id: 'payment',
        name: 'Extra',
        amount: 5000,
        fee: 0,
        totalCancellation: false,
      },
    ]);
  });

  it('does not apply unchecked amortizations or count their savings', () => {
    const result = calculateMortgage(
      createMortgage({
        amortizations: [createAmortization({ active: false, amount: 5000, month: 1 })],
      }),
    );

    expect(result.rows[0].extraPayment).toBe(0);
    expect(result.rows[0].amortizationEvents).toEqual([]);
    expect(result.amortizationSavings).toBe(0);
    expect(result.amortizationInterestSavings).toEqual([]);
  });

  it('calculates payment-reduction savings using the effective bonified rate', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 3.55,
        bonuses: [
          { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
          { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
        ],
        amortizations: [createAmortization({ amount: 1000, month: 12 })],
      }),
    );

    expect(result.amortizationInterestSavings[0].savings).toBeCloseTo(415.93, 2);
    const unbonifiedResult = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 3.55,
        amortizations: [createAmortization({ amount: 1000, month: 12 })],
      }),
    );
    expect(unbonifiedResult.amortizationInterestSavings[0].savings).toBeCloseTo(602.91, 2);
  });

  it('calculates term-reduction savings using the effective bonified rate', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 3.55,
        bonuses: [
          { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
          { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
        ],
        amortizations: [createAmortization({ reductionType: 'term', amount: 1000, month: 12 })],
      }),
    );

    expect(result.amortizationInterestSavings[0].savings).toBeCloseTo(1084.8, 2);

    const unbonifiedResult = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 3.55,
        amortizations: [createAmortization({ reductionType: 'term', amount: 1000, month: 12 })],
      }),
    );
    expect(unbonifiedResult.amortizationInterestSavings[0].savings).toBeCloseTo(1776.33, 2);
  });

  it('attributes simultaneous payment and term reductions without exceeding total savings', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 3.55,
        bonuses: [
          { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
          { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
        ],
        amortizations: [
          createAmortization({ id: 'payment', amount: 1000, month: 12 }),
          createAmortization({ id: 'term', reductionType: 'term', amount: 1000, month: 12 }),
        ],
      }),
    );

    expect(result.rows[12].payment).toBeCloseTo(433.43, 2);
    expect(result.totalInterest).toBeCloseTo(45998.62, 2);
    expect(result.amortizationSavings).toBeCloseTo(1500.64, 2);
    expect(result.amortizationInterestSavings).toEqual([
      { id: 'payment', savings: expect.closeTo(415.93, 2) },
      { id: 'term', savings: expect.closeTo(1084.71, 2) },
    ]);
    expect(
      result.amortizationInterestSavings.reduce((sum, item) => sum + item.savings, 0),
    ).toBeCloseTo(result.amortizationSavings, 2);
  });

  it('reports net total-cost savings including bonus costs avoided by early payoff', () => {
    const mortgage = createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      bonuses: [
        { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 120 },
        { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 120 },
      ],
      amortizations: [createAmortization({ reductionType: 'term', amount: 1000, month: 12 })],
    });
    const result = calculateMortgage(mortgage);
    const baseline = calculateMortgage({ ...mortgage, amortizations: [] });

    expect(result.amortizationSavings).toBeCloseTo(baseline.totalCost - result.totalCost, 2);
    expect(result.amortizationSavings).toBeGreaterThan(
      result.amortizationInterestSavings[0].savings,
    );
  });

  it('matches annual recurring amortization interest and natural payoff at the effective rate', () => {
    const mortgage = createMortgage({
      amount: 110000,
      years: 30,
      interestRate: 3.55,
      bonuses: [
        { id: 'bonus-1', name: 'Bono 1', active: true, interestReduction: 0.5, annualCost: 0 },
        { id: 'bonus-2', name: 'Bono 2', active: true, interestReduction: 0.5, annualCost: 0 },
      ],
    });
    const termReduction = calculateMortgage({
      ...mortgage,
      amortizations: [
        createAmortization({
          type: 'recurring',
          reductionType: 'term',
          amount: 3000,
          month: 12,
          frequencyMonths: 12,
        }),
      ],
    });
    const paymentReduction = calculateMortgage({
      ...mortgage,
      amortizations: [
        createAmortization({
          type: 'recurring',
          amount: 3000,
          month: 12,
          frequencyMonths: 12,
        }),
      ],
    });

    expect(termReduction.rows).toHaveLength(200);
    expect(termReduction.totalInterest).toBeCloseTo(25279.6, 2);
    expect(termReduction.amortizationSavings).toBeCloseTo(22219.66, 2);
    expect(paymentReduction.rows).toHaveLength(276);
    expect(paymentReduction.totalInterest).toBeCloseTo(30364.55, 2);
    expect(paymentReduction.amortizationSavings).toBeCloseTo(17134.71, 2);
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
      { id: 'first', name: 'Extra', amount: 1000, fee: 0, totalCancellation: false },
      { id: 'second', name: 'Extra', amount: 500, fee: 0, totalCancellation: false },
    ]);
    expect(combined.rows[11].remainingCapital).toBe(
      equivalentSinglePayment.rows[11].remainingCapital,
    );
    expect(combined.totalInterest).toBe(equivalentSinglePayment.totalInterest);
  });

  it('processes same-month payment reduction before term reduction regardless of insertion order', () => {
    const amortizations = [
      createAmortization({ id: 'term', reductionType: 'term', amount: 1000, month: 12 }),
      createAmortization({ id: 'payment', reductionType: 'payment', amount: 500, month: 12 }),
    ];
    const forward = calculateMortgage(createMortgage({ amortizations }));
    const reverse = calculateMortgage(
      createMortgage({ amortizations: [...amortizations].reverse() }),
    );
    const termPriority = calculateMortgage(
      createMortgage({
        amortizations: amortizations.map((item) => ({ ...item, reductionType: 'term' })),
      }),
    );

    expect(forward.totalInterest).toBeCloseTo(reverse.totalInterest, 10);
    expect(forward.rows[12].payment).toBeLessThan(termPriority.rows[12].payment);
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
      2,
    );
  });

  it('applies later amortizations after the prior month has reduced the balance', () => {
    const result = calculateMortgage(
      createMortgage({
        amount: 110000,
        years: 30,
        interestRate: 2.55,
        amortizations: [
          createAmortization({ id: 'first', amount: 1000, month: 12 }),
          createAmortization({ id: 'next-month', amount: 500, month: 13 }),
        ],
      }),
    );

    expect(result.rows[12].interest).toBeCloseTo(
      result.rows[11].remainingCapital * (2.55 / 1200),
      12,
    );
    expect(result.rows[12].amortizationEvents).toEqual([
      {
        id: 'next-month',
        name: 'Extra',
        amount: 500,
        fee: 0,
        totalCancellation: false,
      },
    ]);
  });

  it('calculates partial and total cancellation fees in cents', () => {
    const mortgage = createMortgage({
      years: 5,
      cancellationFees: {
        partial: [{ fromMonth: 1, toMonth: 60, percent: 1 }],
        total: [{ fromMonth: 1, toMonth: 60, percent: 0.5 }],
      },
    });
    const month = 12;
    const balanceCents = maxAmortizableAt(mortgage, mortgage.scenarios[0], month);
    const totalCancellation = calculateScenario(mortgage, {
      ...mortgage.scenarios[0],
      amortizations: [createAmortization({ amount: balanceCents / 100, month })],
    });
    const partialScenario = {
      ...mortgage.scenarios[0],
      amortizations: [createAmortization({ amount: (balanceCents - 1) / 100, month })],
    };
    const partial = calculateScenario(mortgage, partialScenario);

    expect(validateScenario(mortgage, partialScenario)).toBeNull();
    expect(
      validateScenario(mortgage, {
        ...mortgage.scenarios[0],
        amortizations: [createAmortization({ amount: balanceCents / 100, month })],
      }),
    ).toBeNull();
    expect(totalCancellation.rows[month - 1].remainingCapital).toBe(0);
    expect(totalCancellation.rows[month - 1].amortizationEvents[0].totalCancellation).toBe(true);
    expect(totalCancellation.rows[month - 1].fee).toBeCloseTo(
      Math.round((balanceCents / 100) * 0.5) / 100,
      2,
    );
    expect(partial.rows[month - 1].remainingCapital).toBeCloseTo(0.01, 2);
    expect(partial.rows[month - 1].fee).toBeCloseTo(
      Math.round(((balanceCents - 1) / 100) * 1) / 100,
      2,
    );
    expect(totalCancellation.amortizationFees).toBe(totalCancellation.rows[month - 1].fee);
    expect(totalCancellation.totalCost).toBeCloseTo(
      mortgage.amount +
        totalCancellation.totalInterest +
        totalCancellation.bonusCost +
        totalCancellation.amortizationFees,
      2,
    );
  });

  it('reports net amortization savings after fees, including negative savings', () => {
    const mortgage = createMortgage({
      amount: 10000,
      years: 1,
      interestRate: 0,
      cancellationFees: { partial: [{ fromMonth: 1, percent: 20 }], total: [] },
      amortizations: [createAmortization({ amount: 5000, month: 1 })],
    });
    const result = calculateScenario(mortgage, mortgage.scenarios[0]);

    expect(result.amortizationFees).toBe(1000);
    expect(result.amortizationSavings).toBeLessThan(0);
    expect(result.totalCost).toBeGreaterThan(10000);
  });

  it('caps a recurring amortization at the balance and reports its cancellation month', () => {
    const mortgage = createMortgage({
      years: 5,
      cancellationFees: { partial: [], total: [{ fromMonth: 1, percent: 0.5 }] },
      amortizations: [
        createAmortization({
          type: 'recurring',
          amount: 1_000_000,
          month: 1,
          frequencyMonths: 1,
        }),
      ],
    });
    const result = calculateScenario(mortgage, mortgage.scenarios[0]);

    expect(result.remainingCapital).toBe(0);
    expect(result.rows[0].remainingCapital).toBe(0);
    expect(result.rows[0].amortizationEvents[0].amount).toBeGreaterThan(0);
    expect(result.rows[0].amortizationEvents[0].totalCancellation).toBe(true);
    expect(result.recurringCancellationMonth).toBe(1);
    expect(validateScenario(mortgage, mortgage.scenarios[0])).toBeNull();
  });

  it('rejects later single amortizations invalidated by a prior change', () => {
    const mortgage = createMortgage({ years: 10 });
    const original = mortgage.scenarios[0];
    const month = 24;
    const balanceCents = maxAmortizableAt(mortgage, original, month);
    const later = createAmortization({
      id: 'later',
      amount: balanceCents / 100,
      month,
    });
    const earlier = createAmortization({ id: 'earlier', amount: 1000, month: 12 });
    const scenario = { ...original, amortizations: [later] };
    const maximumAfterEarlier = maxAmortizableAt(mortgage, {
      ...scenario,
      amortizations: [earlier],
    }, month);

    expect(
      validateScenario(
        mortgage,
        {
          ...scenario,
          amortizations: [...scenario.amortizations, earlier],
        },
        { changedAmortizationId: 'earlier' },
      ),
    ).toBe(
      `Este cambio dejaría la amortización del mes ${month} por encima del capital restante (máximo ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(maximumAfterEarlier / 100)}).`,
    );
  });

  it('rejects an amortization one cent above the exact remaining balance', () => {
    const mortgage = createMortgage({ years: 10 });
    const scenario = mortgage.scenarios[0];
    const month = 24;
    const balanceCents = maxAmortizableAt(mortgage, scenario, month);

    expect(
      validateScenario(
        mortgage,
        {
          ...scenario,
          amortizations: [
            createAmortization({ id: 'too-much', amount: (balanceCents + 1) / 100, month }),
          ],
        },
        { changedAmortizationId: 'too-much' },
      ),
    ).toBe(
      `No puedes amortizar más de lo que queda por pagar. Capital restante en el mes ${month}: ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(balanceCents / 100)}.`,
    );
  });

  it('rejects amortizations after an earlier total cancellation', () => {
    const mortgage = createMortgage({ years: 10 });
    const scenario = mortgage.scenarios[0];
    const balanceCents = maxAmortizableAt(mortgage, scenario, 12);

    expect(
      validateScenario(mortgage, {
        ...scenario,
        amortizations: [
          createAmortization({ id: 'cancel', amount: balanceCents / 100, month: 12 }),
          createAmortization({ id: 'later', amount: 100, month: 13 }),
        ],
      }),
    ).toBe('La hipoteca ya está cancelada o termina antes del mes 13.');
  });

  it('charges no fee when an amortization falls outside configured tiers', () => {
    const mortgage = createMortgage({
      years: 5,
      cancellationFees: { partial: [{ fromMonth: 1, toMonth: 6, percent: 1 }], total: [] },
      amortizations: [createAmortization({ amount: 500, month: 12 })],
    });
    const result = calculateScenario(mortgage, mortgage.scenarios[0]);

    expect(result.rows[11].fee).toBe(0);
    expect(result.amortizationFees).toBe(0);
  });

  it('keeps forced over-balance events finite and never returns a negative balance', () => {
    const mortgage = createMortgage({
      amortizations: [createAmortization({ amount: 1_000_000, month: 1 })],
    });
    const result = calculateScenario(mortgage, mortgage.scenarios[0]);

    expect(result.remainingCapital).toBe(0);
    expect(result.rows[0].remainingCapital).toBe(0);
    expect(
      [
        result.totalCost,
        result.totalInterest,
        result.amortizationFees,
        ...result.rows.map((row) => row.remainingCapital),
      ].every(Number.isFinite),
    ).toBe(true);
  });

  it('validates a 50-year mortgage with 20 amortizations in under 100 ms', () => {
    const mortgage = createMortgage({
      years: 50,
      amortizations: Array.from({ length: 20 }, (_unused, index) =>
        createAmortization({
          id: `extra-${index}`,
          amount: 1,
          month: index + 1,
        }),
      ),
    });
    const start = performance.now();
    const error = validateScenario(mortgage, mortgage.scenarios[0]);
    const elapsed = performance.now() - start;

    expect(error).toBeNull();
    expect(elapsed).toBeLessThan(100);
  });
});

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

function createAmortization(overrides: Partial<Amortization> = {}): Amortization {
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

type ScenarioInput = Omit<Scenario, 'mode'> & { mode?: AmortizationMode };
type MortgageOverrides = Partial<Omit<Mortgage, 'scenarios'>> & {
  scenarios?: ScenarioInput[];
  bonuses?: Bonus[];
  amortizations?: Amortization[];
};

function createMortgage(overrides: MortgageOverrides = {}): Mortgage {
  const { bonuses = [], amortizations = [], scenarios, ...common } = overrides;
  return {
    id: 'test',
    name: 'Prueba',
    bank: 'Banco',
    amount: 100000,
    years: 10,
    interestRate: 3,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: scenarios?.map((scenario) => ({
      ...scenario,
      mode: scenario.mode ?? 'reduceInstallment',
    })) ?? [
      {
        id: 'base',
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
