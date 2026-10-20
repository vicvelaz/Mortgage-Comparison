import { calculateMortgage, maxAmortizableAt, Mortgage, Scenario } from './mortgage-calculator';
import { validateMonthlyBudget, validateScenario } from './mortgage-validation';
import {
  loadMortgages,
  parseMortgageFile,
  serializeMortgages,
  STORAGE_KEY,
} from './mortgage-storage';

function mortgage(overrides: Partial<Mortgage> = {}): Mortgage {
  const scenario: Scenario = {
    id: 'scenario',
    name: 'Base',
    bonuses: [],
    amortizations: [],
    mode: 'reduceInstallment',
  };
  return {
    id: 'mortgage',
    name: 'Hipoteca',
    bank: 'Banco',
    amount: 100000,
    years: 30,
    interestRate: 3,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: [scenario],
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function budgetScenario(
  value: number,
  mode: Scenario['mode'] = 'reduceInstallment',
  endMonth?: number,
): Scenario {
  return {
    id: 'scenario',
    name: 'Base',
    bonuses: [],
    amortizations: [],
    mode,
    monthlyBudget: {
      amount: value,
      startMonth: 1,
      ...(endMonth !== undefined ? { endMonth } : {}),
    },
  };
}

describe('monthly budget amortization', () => {
  it('does not change the schedule when the budget is no more than the ordinary payment', () => {
    const offer = mortgage();
    const baseline = calculateMortgage(offer, offer.scenarios[0]);
    const result = calculateMortgage(
      offer,
      budgetScenario(baseline.firstPayment, 'reduceInstallment'),
    );

    expect(result).toEqual(baseline);
  });

  it('amortizes 300 euros each month when the budget is 300 euros above a fixed payment', () => {
    const offer = mortgage();
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const result = calculateMortgage(
      offer,
      budgetScenario(ordinaryPayment + 300, 'reduceTerm', 12),
    );

    expect(result.rows.slice(0, 12).map((row) => row.extraPayment)).toEqual(
      Array.from({ length: 12 }, () => 300),
    );
  });

  it('deducts the partial commission from the budget', () => {
    const offer = mortgage({
      cancellationFees: {
        partial: [{ fromMonth: 1, percent: 1 }],
        total: [],
      },
    });
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const result = calculateMortgage(
      offer,
      budgetScenario(ordinaryPayment + 303, 'reduceTerm', 12),
    );

    for (const row of result.rows.slice(0, 12)) {
      expect(row.extraPayment).toBe(300);
      expect(row.fee).toBe(3);
      expect(row.extraPayment + row.fee).toBe(303);
    }
  });

  it('uses the budget as the monthly outflow except in the cancellation month', () => {
    const offer = mortgage();
    const result = calculateMortgage(offer, budgetScenario(1000, 'reduceTerm'));
    const cancellationMonth = result.monthlyBudgetCancellationMonth;

    expect(cancellationMonth).not.toBeNull();
    for (const row of result.rows) {
      const outflow = row.payment + row.extraPayment + row.fee;
      if (row.month === cancellationMonth) {
        expect(outflow).toBeLessThan(1000);
      } else {
        expect(outflow).toBeCloseTo(1000, 2);
      }
    }
  });

  it('keeps the ordinary payment constant and shortens the term in reduce-term mode', () => {
    const offer = mortgage();
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const result = calculateMortgage(offer, budgetScenario(ordinaryPayment + 300, 'reduceTerm'));

    expect(result.rows.length).toBeLessThan(offer.years * 12);
    for (const row of result.rows.slice(0, -1)) {
      expect(row.payment).toBeCloseTo(result.firstPayment, 2);
    }
    expect(result.remainingCapital).toBeCloseTo(0, 8);
  });

  it('keeps the original term and lowers the ordinary payment in reduce-installment mode', () => {
    const offer = mortgage();
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const result = calculateMortgage(
      offer,
      budgetScenario(ordinaryPayment + 1, 'reduceInstallment', 12),
    );

    expect(result.rows).toHaveLength(offer.years * 12);
    expect(result.rows[11].payment).toBeLessThan(result.rows[0].payment);
    expect(result.remainingCapital).toBe(0);
  });

  it('ends with zero capital in either repayment mode', () => {
    const offer = mortgage();
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;

    for (const mode of ['reduceInstallment', 'reduceTerm'] as const) {
      const result = calculateMortgage(offer, budgetScenario(ordinaryPayment + 300, mode));
      expect(result.remainingCapital).toBe(0);
    }
  });

  it('adjusts the final budget amortization to the balance and uses the total commission', () => {
    const offer = mortgage({
      cancellationFees: {
        partial: [{ fromMonth: 1, percent: 1 }],
        total: [{ fromMonth: 1, percent: 2 }],
      },
    });
    const result = calculateMortgage(offer, budgetScenario(1_000_000, 'reduceTerm'));
    const finalRow = result.rows.at(-1)!;
    const budgetEvent = finalRow.amortizationEvents.find((event) => event.id === 'monthly-budget')!;

    expect(result.monthlyBudgetCancellationMonth).toBe(finalRow.month);
    expect(finalRow.remainingCapital).toBe(0);
    expect(budgetEvent.totalCancellation).toBe(true);
    expect(budgetEvent.fee).toBeCloseTo(budgetEvent.amount * 0.02, 2);
  });

  it('reprices and fixes the reduce-term payment when a bonus changes the rate', () => {
    const offer = mortgage();
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const scenario: Scenario = {
      ...budgetScenario(ordinaryPayment + 300, 'reduceTerm'),
      bonuses: [
        {
          id: 'bonus',
          name: 'Bonificación temporal',
          active: true,
          interestReduction: 1,
          annualCost: 0,
          startMonth: 13,
          endMonth: 24,
        },
      ],
    };
    const result = calculateMortgage(offer, scenario);

    expect(result.rows[12].payment).toBeLessThan(result.rows[11].payment);
    expect(result.rows[13].payment).toBeCloseTo(result.rows[12].payment, 2);
    expect(result.rows[24].payment).toBeGreaterThan(result.rows[23].payment);
  });

  it('reprices fixed reduce-installment payments after an amortization when the effective rate changes', () => {
    const offer = mortgage({ amount: 180000, years: 25, interestRate: 4 });
    const bonus = {
      id: 'temporary',
      name: 'Bonificación temporal',
      active: true,
      interestReduction: 1.5,
      annualCost: 0,
      startMonth: 1,
      endMonth: 36,
    };
    const createScenario = (amount?: number): Scenario => ({
      ...offer.scenarios[0],
      bonuses: [bonus],
      amortizations:
        amount === undefined
          ? []
          : [
              {
                id: 'extra',
                name: 'Extra',
                active: true,
                type: 'single',
                reductionType: 'payment',
                amount,
                month: 12,
              },
            ],
    });
    const scenarios = [createScenario(), createScenario(1), createScenario(20000)];
    const results = scenarios.map((scenario) => calculateMortgage(offer, scenario));

    expect(results.map((result) => result.rows.length)).toEqual([300, 300, 300]);
    expect(results[0].rows[35].payment).toBeCloseTo(807.51, 2);
    expect(results[0].rows[36].payment).toBeCloseTo(934.23, 2);
    expect(results[0].totalInterest).toBeCloseTo(95707.64, 2);
    expect(results[0].totalCost).toBeCloseTo(275707.64, 2);
    expect(results[0].remainingCapital).toBe(0);
    expect(results[1].rows[35].payment).toBeCloseTo(807.51, 2);
    expect(results[1].rows[36].payment).toBeCloseTo(934.23, 2);
    expect(results[1].totalInterest).toBeCloseTo(95707.12, 2);
    expect(results[1].totalCost).toBeCloseTo(275707.12, 2);
    expect(results[1].remainingCapital).toBe(0);
    expect(results[2].rows[35].payment).toBeCloseTo(715.09, 2);
    expect(results[2].rows[36].payment).toBeCloseTo(827.31, 2);
    expect(results[2].totalInterest).toBeCloseTo(85262.14, 2);
    expect(results[2].totalCost).toBeCloseTo(265262.14, 2);
    expect(results[2].remainingCapital).toBe(0);
  });

  it('reprices down when a later bonus starts after an amortization', () => {
    const offer = mortgage({ amount: 180000, years: 25, interestRate: 4 });
    const scenario: Scenario = {
      ...offer.scenarios[0],
      bonuses: [
        {
          id: 'later',
          name: 'Bonificación posterior',
          active: true,
          interestReduction: 1,
          annualCost: 0,
          startMonth: 48,
        },
      ],
      amortizations: [
        {
          id: 'extra',
          name: 'Extra',
          active: true,
          type: 'single',
          reductionType: 'payment',
          amount: 15000,
          month: 12,
        },
      ],
    };
    const result = calculateMortgage(offer, scenario);

    expect(result.rows[46].payment).toBeCloseTo(869, 2);
    expect(result.rows[47].payment).toBeCloseTo(792.04, 2);
    expect(result.totalInterest).toBeCloseTo(77202.27, 2);
    expect(result.remainingCapital).toBe(0);
  });

  it.each(['fixed', 'variable'] as const)(
    'reprices in both modes for %s rates after an amortization',
    (rateType) => {
      for (const mode of ['reduceInstallment', 'reduceTerm'] as const) {
        const offer = mortgage({
          amount: 100000,
          years: 5,
          interestRate: 4,
          rateType,
        });
        const scenario: Scenario = {
          ...offer.scenarios[0],
          mode,
          bonuses: [
            {
              id: 'temporary',
              name: 'Bonificación temporal',
              active: true,
              interestReduction: 1,
              annualCost: 0,
              startMonth: 24,
              endMonth: 36,
            },
          ],
          amortizations: [
            {
              id: 'extra',
              name: 'Extra',
              active: true,
              type: 'single',
              reductionType: 'payment',
              amount: 5000,
              month: 12,
            },
          ],
        };
        const result = calculateMortgage(offer, scenario);

        expect(result.rows[23].payment).toBeLessThan(result.rows[22].payment);
        expect(result.rows[36].payment).toBeGreaterThan(result.rows[35].payment);
        expect(result.remainingCapital).toBe(0);
      }
    },
  );

  it('ends with zero capital for 500 deterministic schedules with rate windows and amortizations', () => {
    let seed = 0x13579bdf;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let index = 0; index < 500; index += 1) {
      const years = 2 + Math.floor(random() * 28);
      const amount = 30000 + Math.round(random() * 270000);
      const months = years * 12;
      const offer = mortgage({
        amount,
        years,
        interestRate: 1 + random() * 5,
        rateType: random() < 0.5 ? 'fixed' : 'variable',
      });
      const startMonth = 1 + Math.floor(random() * Math.floor(months / 2));
      const endMonth = Math.min(months, startMonth + 1 + Math.floor(random() * 24));
      const amortizationMonth = 1 + Math.floor(random() * Math.floor(months / 2));
      const scenario: Scenario = {
        ...offer.scenarios[0],
        mode: random() < 0.5 ? 'reduceInstallment' : 'reduceTerm',
        bonuses: [
          {
            id: `bonus-${index}`,
            name: 'Bono aleatorio',
            active: true,
            interestReduction: 0.1 + random() * 1.5,
            annualCost: 0,
            startMonth,
            endMonth,
          },
        ],
        amortizations: [
          {
            id: `extra-${index}`,
            name: 'Extra',
            active: true,
            type: index % 2 === 0 ? 'single' : 'recurring',
            reductionType: index % 3 === 0 ? 'term' : 'payment',
            amount: Math.max(1, Math.round(amount * 0.002)),
            month: amortizationMonth,
            ...(index % 2 === 0 ? {} : { frequencyMonths: 12 }),
          },
        ],
      };
      const result = calculateMortgage(offer, scenario);

      expect(result.remainingCapital, `case ${index}`).toBe(0);
      expect(result.rows.at(-1)?.remainingCapital, `case ${index}`).toBe(0);
    }
  });

  it('preserves the 448-case no-event schedule grid', () => {
    let checksum = 2166136261;
    const amounts = [10000, 25000, 50000, 100000, 180000, 250000, 400000];
    const terms = [1, 5, 10, 15, 20, 25, 30, 40];
    const rates = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4];

    for (const amount of amounts) {
      for (const years of terms) {
        for (const interestRate of rates) {
          const offer = mortgage({ amount, years, interestRate });
          const result = calculateMortgage(offer, offer.scenarios[0]);
          const serialized = JSON.stringify([
            result.rows.map((row) => [
              row.payment,
              row.interest,
              row.principal,
              row.remainingCapital,
            ]),
            result.totalInterest,
            result.totalCost,
          ]);
          for (let index = 0; index < serialized.length; index += 1) {
            checksum = Math.imul(checksum ^ serialized.charCodeAt(index), 16777619) >>> 0;
          }
        }
      }
    }

    expect(checksum).toBe(3776448176);
  });

  it('preserves the project reference values when no monthly budget is set', () => {
    const first = calculateMortgage(
      mortgage({ amount: 100000, years: 30, interestRate: 3 }),
      mortgage().scenarios[0],
    );
    const secondMortgage = mortgage({ amount: 180000, years: 25, interestRate: 3.1 });
    const second = calculateMortgage(secondMortgage, secondMortgage.scenarios[0]);
    const thirdMortgage = mortgage({ amount: 10000, years: 1, interestRate: 0 });
    const third = calculateMortgage(thirdMortgage, thirdMortgage.scenarios[0]);

    expect(first.firstPayment).toBeCloseTo(421.6, 2);
    expect(second.firstPayment).toBeCloseTo(862.97, 2);
    expect(second.totalInterest).toBeCloseTo(78891.58, 2);
    expect(second.rows).toHaveLength(300);
    expect(third.firstPayment).toBeCloseTo(833.33, 2);
    expect(third.totalInterest).toBe(0);
  });

  it('validates amount and month boundaries', () => {
    expect(validateMonthlyBudget({ amount: 1, startMonth: 1 })).toBeNull();
    expect(validateMonthlyBudget({ amount: 0, startMonth: 1 })).toContain('mayor que 0');
    expect(validateMonthlyBudget({ amount: 1, startMonth: 1.5 })).toContain('entero');
    expect(validateMonthlyBudget({ amount: 1, startMonth: 24, endMonth: 12 })).toContain(
      'anterior',
    );
  });

  it('migrates older scenarios to reduce-installment mode on import', () => {
    const offer = mortgage();
    const { mode: _mode, ...oldScenario } = offer.scenarios[0];
    const imported = parseMortgageFile(
      JSON.stringify({
        schemaVersion: 2,
        mortgages: [{ ...offer, scenarios: [oldScenario] }],
      }),
    );

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.value[0].scenarios[0].mode).toBe('reduceInstallment');
    }
  });

  it('migrates older scenarios to reduce-installment mode when loading stored data', () => {
    const offer = mortgage();
    const { mode: _mode, ...oldScenario } = offer.scenarios[0];
    const raw = JSON.stringify({
      schemaVersion: 2,
      mortgages: [{ ...offer, scenarios: [oldScenario] }],
    });
    const storage = {
      getItem: (key: string) => (key === STORAGE_KEY ? raw : null),
      setItem: () => undefined,
    };
    const loaded = loadMortgages(storage);

    expect(loaded.mortgages[0].scenarios[0].mode).toBe('reduceInstallment');
  });

  it('rejects malformed monthly budget settings during import', () => {
    const offer = mortgage();
    const invalidOffer = {
      ...offer,
      scenarios: [
        {
          ...offer.scenarios[0],
          monthlyBudget: { amount: 1000, startMonth: 24, endMonth: 12 },
        },
      ],
    };

    expect(parseMortgageFile(serializeMortgages([invalidOffer])).ok).toBe(false);
  });

  it('rejects malformed monthly budget settings when loading stored data', () => {
    const offer = mortgage();
    const invalidOffer = {
      ...offer,
      scenarios: [
        {
          ...offer.scenarios[0],
          monthlyBudget: { amount: 1000, startMonth: 24, endMonth: 12 },
        },
      ],
    };
    const raw = serializeMortgages([invalidOffer]);
    const storage = {
      getItem: (key: string) => (key === STORAGE_KEY ? raw : null),
      setItem: () => undefined,
    };
    const loaded = loadMortgages(storage);

    expect(loaded.mortgages).toEqual([]);
    expect(loaded.notice).toContain('Se recuperaron 0 de 1 oferta');
  });
});

describe('effective term horizon and fee rounding', () => {
  const temporaryBonus = {
    id: 'temporary-bonus',
    name: 'Bonificación temporal',
    active: true,
    interestReduction: 1.5,
    annualCost: 0,
    startMonth: 1,
    endMonth: 36,
  };

  function termScenario(bonuses: Scenario['bonuses'] = []): Scenario {
    return {
      id: 'scenario',
      name: 'Base',
      bonuses,
      amortizations: [
        {
          id: 'term',
          name: 'Reducir plazo',
          active: true,
          type: 'single',
          reductionType: 'term',
          amount: 20000,
          month: 12,
        },
      ],
      mode: 'reduceInstallment',
    };
  }

  it.each([
    ['A1: bonificación permanente', [temporaryBonus], 257, 807.51, 807.51, 47408],
    ['A2: bonificación hasta el mes 36', [temporaryBonus], 257, 807.51, 914.3, 71130],
    ['A3: sin amortización', [temporaryBonus], 300, 807.51, 934.23, 95708],
  ])(
    '%s conserva el plazo vigente esperado',
    (_label, bonuses, months, payment36, payment37, interest) => {
      const offer = mortgage({ amount: 180000, years: 25, interestRate: 4 });
      const scenario =
        _label === 'A3: sin amortización'
          ? { ...termScenario(bonuses), amortizations: [] }
          : termScenario(
              _label === 'A1: bonificación permanente'
                ? [{ ...temporaryBonus, endMonth: undefined }]
                : bonuses,
            );
      const result = calculateMortgage(offer, scenario);

      expect(result.rows).toHaveLength(months);
      expect(result.rows[35].payment).toBeCloseTo(payment36, 2);
      expect(result.rows[36].payment).toBeCloseTo(payment37, 2);
      expect(result.totalInterest).toBeCloseTo(interest, 0);
    },
  );

  it.each([
    ['B1: solo reducir plazo', false, 250, 950.11, 77060.53],
    ['B2: reducir plazo y después reducir cuota', true, 250, 877.21, 73677.06],
  ])('%s conserva el horizonte reducido', (_label, addPayment, months, payment61, interest) => {
    const offer = mortgage({ amount: 180000, years: 25, interestRate: 4 });
    const scenario: Scenario = {
      ...termScenario(),
      amortizations: [
        ...termScenario().amortizations,
        ...(addPayment
          ? [
              {
                id: 'payment',
                name: 'Reducir cuota',
                active: true,
                type: 'single' as const,
                reductionType: 'payment' as const,
                amount: 10000,
                month: 60,
              },
            ]
          : []),
      ],
    };
    const result = calculateMortgage(offer, scenario);

    expect(result.rows).toHaveLength(months);
    expect(result.rows[58].payment).toBeCloseTo(950.11, 2);
    expect(result.rows[60].payment).toBeCloseTo(payment61, 2);
    expect(result.totalInterest).toBeCloseTo(interest, 0);
  });

  it('accepts a full cancellation at the calculated balance and rejects one cent more', () => {
    const offer = mortgage({ amount: 180000, years: 25, interestRate: 4 });
    const scenario = termScenario();
    const maximum = maxAmortizableAt(offer, { ...scenario, amortizations: [] }, 12);
    const cancellation: Scenario = {
      ...scenario,
      amortizations: [
        {
          ...scenario.amortizations[0],
          amount: maximum / 100,
        },
      ],
    };

    expect(maximum).toBeGreaterThan(0);
    expect(validateScenario(offer, cancellation)).toBeNull();
    expect(
      validateScenario(offer, {
        ...cancellation,
        amortizations: [{ ...cancellation.amortizations[0], amount: maximum / 100 + 0.01 }],
      }),
    ).toContain('supera el capital restante');
  });

  it('keeps balances finite, nonnegative, and nonincreasing in reduce-term mode', () => {
    const offer = mortgage({ amount: 1000, years: 5, interestRate: 12 });
    const result = calculateMortgage(offer, {
      ...budgetScenario(2, 'reduceTerm'),
      amortizations: [
        {
          id: 'term',
          name: 'Reducir plazo',
          active: true,
          type: 'single',
          reductionType: 'term',
          amount: 100,
          month: 3,
        },
      ],
    });
    const balances = result.rows.map((row) => row.remainingCapital);

    expect(result.remainingCapital).toBe(0);
    expect(
      result.rows.every(
        (row) =>
          Number.isFinite(row.payment) &&
          Number.isFinite(row.remainingCapital) &&
          row.remainingCapital >= 0,
      ),
    ).toBe(true);
    expect(balances.every((balance, index) => index === 0 || balance <= balances[index - 1])).toBe(
      true,
    );
  });

  it.each([
    [242.5, 1, 2.43],
    [0.5, 1, 0.01],
    [10, 0.25, 0.03],
    [1000, 0.15, 1.5],
  ])('rounds a %s euro partial amortization fee at %s percent', (amount, percent, expected) => {
    const offer = mortgage({
      amount: 100000,
      cancellationFees: { partial: [{ fromMonth: 1, percent }], total: [] },
    });
    const scenario: Scenario = {
      ...offer.scenarios[0],
      amortizations: [
        {
          id: 'fee',
          name: 'Comisión',
          active: true,
          type: 'single',
          reductionType: 'payment',
          amount,
          month: 1,
        },
      ],
    };
    const result = calculateMortgage(offer, scenario);

    expect(result.rows[0].fee).toBe(expected);
  });

  it('charges 2.43 euros in each of 159 monthly budget amortizations', () => {
    const offer = mortgage({
      amount: 71750.83,
      cancellationFees: { partial: [{ fromMonth: 1, percent: 1 }], total: [] },
    });
    const ordinaryPayment = calculateMortgage(offer, offer.scenarios[0]).firstPayment;
    const result = calculateMortgage(
      offer,
      budgetScenario(ordinaryPayment + 244.93, 'reduceTerm', 159),
    );

    const amortizationRows = result.rows.filter((row) => row.extraPayment > 0);
    expect(amortizationRows).toHaveLength(159);
    expect(amortizationRows.every((row) => row.fee === 2.43)).toBe(true);
    expect(amortizationRows.reduce((sum, row) => sum + row.fee, 0)).toBeCloseTo(159 * 2.43, 2);
  });
});
