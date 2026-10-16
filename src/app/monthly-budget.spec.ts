import { calculateMortgage, Mortgage, Scenario } from './mortgage-calculator';
import { validateMonthlyBudget } from './mortgage-validation';
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
