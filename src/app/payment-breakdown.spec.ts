import { aggregatePaymentBreakdown } from './amortization-schedule';
import { calculateMortgage, Mortgage, Scenario } from './mortgage-calculator';

function mortgage(
  id: string,
  amount: number,
  years: number,
  interestRate: number,
  scenario: Scenario,
): Mortgage {
  return {
    id,
    name: `Hipoteca ${id}`,
    bank: 'Banco',
    amount,
    years,
    interestRate,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios: [scenario],
    updatedAt: new Date(0).toISOString(),
  };
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'scenario',
    name: 'Base',
    bonuses: [],
    amortizations: [],
    mode: 'reduceInstallment',
    ...overrides,
  };
}

function sumCents(...values: number[]): number {
  return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}

describe('payment breakdown', () => {
  it('keeps interest plus ordinary principal equal to the installment across mortgages', () => {
    const offers = [
      mortgage('one', 100000, 30, 3, scenario()),
      mortgage(
        'two',
        180000,
        25,
        3.1,
        scenario({
          amortizations: [
            {
              id: 'extra',
              name: 'Extra',
              active: true,
              type: 'single',
              reductionType: 'term',
              amount: 5000,
              month: 12,
            },
          ],
        }),
      ),
    ];

    for (const offer of offers) {
      const result = calculateMortgage(offer, offer.scenarios[0]);

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(Math.round((row.interest + row.principal) * 100)).toBe(
          Math.round(row.payment * 100),
        );
      }
    }

    const amortized = calculateMortgage(offers[1], offers[1].scenarios[0]);
    expect(amortized.rows[11].extraPayment).toBe(5000);
    expect(amortized.rows[11].principal).toBeLessThan(amortized.rows[11].payment);
  });

  it('aggregates annual chart bars from monthly rows, including a partial final year', () => {
    const offer = mortgage(
      'short',
      100000,
      30,
      3,
      scenario({
        amortizations: [
          {
            id: 'cancellation',
            name: 'Cancelación',
            active: true,
            type: 'single',
            reductionType: 'term',
            amount: 1000000,
            month: 14,
          },
        ],
      }),
    );
    const rows = calculateMortgage(offer, offer.scenarios[0]).rows;
    const annual = aggregatePaymentBreakdown(rows, 'annual');
    const monthly = aggregatePaymentBreakdown(rows, 'monthly');

    expect(rows).toHaveLength(14);
    expect(annual.map((item) => item.label)).toEqual(['Año 1', 'Año 2']);
    expect(annual[1].interest).toBe(sumCents(rows[12].interest, rows[13].interest));
    expect(annual[1].principal).toBe(sumCents(rows[12].principal, rows[13].principal));
    expect(annual[1].extraPayment).toBe(sumCents(rows[12].extraPayment, rows[13].extraPayment));
    expect(monthly[13]).toMatchObject({
      label: '14',
      interest: Math.round(rows[13].interest * 100) / 100,
      principal: Math.round(rows[13].principal * 100) / 100,
      extraPayment: Math.round(rows[13].extraPayment * 100) / 100,
    });
  });
});
