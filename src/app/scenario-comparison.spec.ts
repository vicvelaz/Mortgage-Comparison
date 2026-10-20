import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { routes } from './app.routes';
import { calculateMortgage, Mortgage, Scenario } from './mortgage-calculator';
import { comparisonMonthLabels, Workspace } from './workspace';

function scenario(
  id: string,
  name: string,
  amortizations: Scenario['amortizations'] = [],
): Scenario {
  return { id, name, bonuses: [], amortizations, mode: 'reduceInstallment' };
}

function mortgage(id: string, years: number, scenarios: Scenario[], amount = 100000): Mortgage {
  return {
    id,
    name: `Hipoteca ${id}`,
    bank: 'Banco',
    amount,
    years,
    interestRate: 3,
    rateType: 'fixed',
    cancellationFees: { partial: [], total: [] },
    scenarios,
    updatedAt: new Date(0).toISOString(),
  };
}

describe('scenario comparison', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Workspace], providers: [provideRouter(routes)] });
  });

  afterEach(() => localStorage.clear());

  it('calculates savings against the mortgage base scenario in cents', () => {
    const base = scenario('base', 'Base');
    const amortized = scenario('amortized', 'Amortizada', [
      {
        id: 'extra',
        name: 'Extra',
        active: true,
        type: 'single',
        reductionType: 'term',
        amount: 5000,
        month: 12,
      },
    ]);
    const offer = mortgage('one', 25, [base, amortized]);
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([offer]);
    workspace.selectedIds.set([
      JSON.stringify(['one', 'base']),
      JSON.stringify(['one', 'amortized']),
    ]);

    const differences = workspace.comparisonDifferences()!;
    const baseResult = calculateMortgage(offer, base);
    const amortizedResult = calculateMortgage(offer, amortized);
    const comparison = differences.find((item) => item.scenario.id === 'amortized')!;

    expect(comparison.interestSavings).toBe(
      (Math.round(baseResult.totalInterest * 100) -
        Math.round(amortizedResult.totalInterest * 100)) /
        100,
    );
    expect(comparison.totalCostSavings).toBe(
      (Math.round(baseResult.totalCost * 100) - Math.round(amortizedResult.totalCost * 100)) / 100,
    );
    expect(comparison.monthsSaved).toBe(baseResult.rows.length - amortizedResult.rows.length);
    expect(comparison.initialPaymentDifference).toBe(
      (Math.round(amortizedResult.firstPayment * 100) - Math.round(baseResult.firstPayment * 100)) /
        100,
    );
  });

  it('does not show the capital or term warning for scenarios of the same mortgage', () => {
    const offer = mortgage('one', 25, [scenario('base', 'Base'), scenario('other', 'Otra')]);
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([offer]);
    workspace.selectedIds.set([JSON.stringify(['one', 'base']), JSON.stringify(['one', 'other'])]);
    fixture.detectChanges();

    expect(workspace.comparable()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('capital o plazo distintos');
  });

  it('uses the longest schedule to create comparison month labels', () => {
    const shortMortgage = mortgage('short', 10, [scenario('short-base', 'Base')]);
    const longMortgage = mortgage('long', 30, [scenario('long-base', 'Base')]);
    const labels = comparisonMonthLabels([
      { result: calculateMortgage(shortMortgage, shortMortgage.scenarios[0]) },
      { result: calculateMortgage(longMortgage, longMortgage.scenarios[0]) },
    ]);

    expect(labels).toHaveLength(360);
    expect(labels[0]).toBe(1);
    expect(labels.at(-1)).toBe(360);
  });

  it('warns about and excludes a schedule with unpaid capital from every best-offer KPI', () => {
    const unpaidMortgage = mortgage('unpaid', 1, [
      {
        ...scenario('unpaid-base', 'Saldo pendiente', [
          {
            id: 'extra',
            name: 'Extra',
            active: true,
            type: 'single',
            reductionType: 'payment',
            amount: 1,
            month: 1,
          },
        ]),
        bonuses: [
          {
            id: 'temporary',
            name: 'Bono temporal',
            active: true,
            interestReduction: 100,
            annualCost: 0,
            startMonth: 1,
            endMonth: 1,
          },
        ],
      },
    ], 10000);
    unpaidMortgage.interestRate = 100;
    const paidMortgage = mortgage('paid', 1, [scenario('paid-base', 'Cancelada')], 10000);
    paidMortgage.interestRate = 0;
    const fixture = TestBed.createComponent(Workspace);
    const workspace = fixture.componentInstance;
    workspace.mortgages.set([unpaidMortgage, paidMortgage]);
    const unpaidResult = calculateMortgage(unpaidMortgage, unpaidMortgage.scenarios[0]);
    Object.defineProperty(workspace, 'mortgageResults', {
      configurable: true,
      value: () => [
        {
          mortgage: unpaidMortgage,
          scenario: unpaidMortgage.scenarios[0],
          result: { ...unpaidResult, remainingCapital: 100 },
        },
        {
          mortgage: paidMortgage,
          scenario: paidMortgage.scenarios[0],
          result: calculateMortgage(paidMortgage, paidMortgage.scenarios[0]),
        },
      ],
    });
    workspace.selectedIds.set([
      JSON.stringify(['unpaid', 'unpaid-base']),
      JSON.stringify(['paid', 'paid-base']),
    ]);
    fixture.detectChanges();

    expect(workspace.mortgageResults()[0].result.remainingCapital).toBeGreaterThan(0.01);
    expect(workspace.cheapest()?.mortgage.id).toBe('paid');
    expect(workspace.smallestPayment()?.mortgage.id).toBe('paid');
    expect(workspace.leastInterest()?.mortgage.id).toBe('paid');
    expect(workspace.lowestRelativeCost()?.mortgage.id).toBe('paid');
    expect(workspace.selectedLowest('totalCost')?.mortgage.id).toBe('paid');
    expect(workspace.selectedLowest('firstPayment')?.mortgage.id).toBe('paid');
    expect(workspace.selectedLowest('totalInterest')?.mortgage.id).toBe('paid');
    expect(fixture.nativeElement.textContent).toContain('No se cancela dentro del plazo');
  });
});
