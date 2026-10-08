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
      amortizations: [{ id: 'extra', type: 'single', amount: 5000, month: 2 }],
    }));
    expect(result.rows[0].interest).toBe(166.67);
    expect(result.rows[1].interest).toBe(248.12);
    expect(result.rows[1].extraPayment).toBe(5000);
    expect(result.rows[1].payment).toBeLessThan(1000);
    expect(result.amortizationSavings).toBeGreaterThan(0);
  });
});

function createMortgage(overrides: Partial<Mortgage>): Mortgage {
  return {
    id: 'test', name: 'Prueba', bank: 'Banco', amount: 100000, years: 10, interestRate: 3,
    rateType: 'fixed', bonuses: [], amortizations: [], updatedAt: new Date(0).toISOString(), ...overrides,
  };
}
