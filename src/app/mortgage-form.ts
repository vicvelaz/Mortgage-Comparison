import { DecimalPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  Amortization,
  Mortgage,
  MortgageResult,
  Scenario,
  CancellationFees,
  FeeTier,
  calculateMortgage,
  createId,
  maxAmortizableAt,
} from './mortgage-calculator';
import {
  validateAmortization,
  validateBonus,
  validateCancellationFees,
  validateMortgage,
  validateScenario,
} from './mortgage-validation';

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const amortizationColors = ['#007f73', '#df765d', '#586b9c', '#d3a347', '#9b6db0', '#5a9bb5'];

@Component({
  selector: 'app-mortgage-form',
  imports: [DecimalPipe, FormsModule, MatCheckboxModule],
  templateUrl: './mortgage-form.html',
})
export class MortgageFormComponent {
  @Input({ required: true }) draft!: Mortgage;
  @Input({ required: true }) scenario!: Scenario;
  @Input() editingId: string | null = null;
  @Output() saveRequested = new EventEmitter<void>();
  @Output() notify = new EventEmitter<string>();

  bonusDraft = {
    name: '',
    interestReduction: 0.2,
    annualCost: 0,
    startMonth: 1,
    endMonth: null as number | null,
  };
  amortizationDraft = {
    name: '',
    type: 'single' as 'single' | 'recurring',
    reductionType: 'payment' as 'term' | 'payment',
    amount: 1000,
    month: 12,
    frequencyMonths: 12,
  };
  feeDraft = {
    type: 'partial' as 'partial' | 'total',
    fromMonth: 1,
    toMonth: null as number | null,
    percent: 0,
  };

  private draftCache: { snapshot: string; result: MortgageResult | null } | null = null;

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  rateTypeLabel(type: Mortgage['rateType']): string {
    return type === 'fixed' ? 'Fija' : 'Variable';
  }

  amortizationColor(scenario: Scenario, id: string): string {
    const index = scenario.amortizations.findIndex((item) => item.id === id);
    return amortizationColors[(index < 0 ? 0 : index) % amortizationColors.length];
  }

  /** Resultado del borrador; null mientras el borrador no es válido */
  get draftResult(): MortgageResult | null {
    const snapshot = JSON.stringify([this.draft, this.scenario]);
    if (this.draftCache?.snapshot !== snapshot) {
      this.draftCache = {
        snapshot,
        result: validateMortgage(this.draft) ? null : calculateMortgage(this.draft, this.scenario),
      };
    }
    return this.draftCache.result;
  }

  draftAmortizationInterestSavings(id: string): number | null {
    return (
      this.draftResult?.amortizationInterestSavings.find((item) => item.id === id)?.savings ?? null
    );
  }

  feeTiers(type: 'partial' | 'total'): FeeTier[] {
    return this.draft.cancellationFees[type];
  }

  addFeeTier(): void {
    const { type, fromMonth, toMonth, percent } = this.feeDraft;
    const fees = this.draft.cancellationFees;
    const candidate: CancellationFees = {
      ...fees,
      [type]: [...fees[type], { fromMonth, percent, ...(toMonth !== null ? { toMonth } : {}) }],
    };
    const error = validateCancellationFees(candidate);
    if (error) {
      this.notify.emit(error);
      return;
    }
    this.draft.cancellationFees = candidate;
    this.feeDraft = { type, fromMonth: 1, toMonth: null, percent: 0 };
  }

  removeFeeTier(type: 'partial' | 'total', index: number): void {
    this.draft.cancellationFees = {
      ...this.draft.cancellationFees,
      [type]: this.draft.cancellationFees[type].filter((_tier, tierIndex) => tierIndex !== index),
    };
  }

  loadLegalExample(): void {
    let tiers: FeeTier[];
    if (this.draft.rateType === 'fixed') {
      tiers = [
        { fromMonth: 1, toMonth: 120, percent: 2 },
        { fromMonth: 121, percent: 1.5 },
      ];
    } else {
      const fiveYearLimit = window.confirm(
        '¿Quieres usar el ejemplo alternativo del 0,15 % durante los primeros 5 años? Pulsa Cancelar para usar el 0,25 % durante los primeros 3 años.',
      );
      tiers = fiveYearLimit
        ? [{ fromMonth: 1, toMonth: 60, percent: 0.15 }]
        : [{ fromMonth: 1, toMonth: 36, percent: 0.25 }];
    }
    this.draft.cancellationFees = {
      partial: structuredClone(tiers),
      total: structuredClone(tiers),
    };
    this.notify.emit(
      'Ejemplo orientativo basado en la Ley 5/2019. Revisa tu contrato: los límites y condiciones pueden variar.',
    );
  }

  addBonus(): void {
    const bonus = this.bonusDraft;
    const endMonth = bonus.endMonth ?? undefined;
    const error = validateBonus({
      name: bonus.name,
      interestReduction: bonus.interestReduction,
      annualCost: bonus.annualCost,
      startMonth: bonus.startMonth,
      endMonth,
    });
    if (error) {
      this.notify.emit(error);
      return;
    }
    const candidate: Scenario = {
      ...this.scenario,
      bonuses: [
        ...this.scenario.bonuses,
        {
          id: createId(),
          name: bonus.name.trim(),
          active: true,
          interestReduction: bonus.interestReduction,
          annualCost: bonus.annualCost,
          startMonth: bonus.startMonth,
          ...(endMonth !== undefined ? { endMonth } : {}),
        },
      ],
    };
    if (!this.updateScenario(candidate)) return;
    this.bonusDraft = {
      name: '',
      interestReduction: 0.2,
      annualCost: 0,
      startMonth: 1,
      endMonth: null,
    };
  }

  removeBonus(id: string): void {
    this.updateScenario({
      ...this.scenario,
      bonuses: this.scenario.bonuses.filter((bonus) => bonus.id !== id),
    });
  }

  setBonusActive(id: string, active: boolean): void {
    this.updateScenario({
      ...this.scenario,
      bonuses: this.scenario.bonuses.map((bonus) =>
        bonus.id === id ? { ...bonus, active } : bonus,
      ),
    });
  }

  setMonthlyBudgetEnabled(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    const enabled = event.currentTarget.checked;
    this.replaceScenario({
      ...this.scenario,
      ...(enabled
        ? { monthlyBudget: { amount: 1000, startMonth: 1 } }
        : { monthlyBudget: undefined }),
    });
  }

  setMonthlyBudgetField(field: 'amount' | 'startMonth' | 'endMonth', event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement) || !this.scenario.monthlyBudget) return;
    const input = event.currentTarget;
    const value = input.valueAsNumber;
    const monthlyBudget = { ...this.scenario.monthlyBudget };
    if (field === 'amount') monthlyBudget.amount = Number.isFinite(value) ? value : 0;
    if (field === 'startMonth') monthlyBudget.startMonth = Number.isFinite(value) ? value : 0;
    if (field === 'endMonth') {
      if (input.value === '') delete monthlyBudget.endMonth;
      else monthlyBudget.endMonth = Number.isFinite(value) ? value : 0;
    }
    this.replaceScenario({ ...this.scenario, monthlyBudget });
  }

  setAmortizationMode(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    const mode = event.currentTarget.value;
    if (mode !== 'reduceInstallment' && mode !== 'reduceTerm') return;
    this.replaceScenario({ ...this.scenario, mode });
  }

  maxAmortizableAmount(): number {
    return maxAmortizableAt(this.draft, this.scenario, this.amortizationDraft.month) / 100;
  }

  fillTotalCancellation(): void {
    const amount = this.maxAmortizableAmount();
    if (amount <= 0) {
      this.notify.emit(
        `La hipoteca ya está cancelada o termina antes del mes ${this.amortizationDraft.month}.`,
      );
      return;
    }
    this.amortizationDraft.type = 'single';
    this.amortizationDraft.amount = amount;
    this.amortizationDraft.name = 'Cancelación total';
  }

  addAmortization(): void {
    const item = this.amortizationDraft;
    const error = validateAmortization(item);
    if (error) {
      this.notify.emit(error);
      return;
    }
    const added: Amortization = {
      id: createId(),
      name: item.name.trim() || `Amortización ${this.scenario.amortizations.length + 1}`,
      active: true,
      type: item.type,
      reductionType: item.reductionType,
      amount: item.amount,
      month: item.month,
      ...(item.type === 'recurring' ? { frequencyMonths: item.frequencyMonths } : {}),
    };
    const candidate: Scenario = {
      ...this.scenario,
      amortizations: [...this.scenario.amortizations, added],
    };
    if (!this.updateScenario(candidate, added.id)) return;
    if (item.month > this.draft.years * 12) {
      this.notify.emit(
        `La amortización cae en el mes ${item.month}, fuera del plazo de la hipoteca; no tendrá efecto.`,
      );
    }
    this.amortizationDraft.name = '';
  }

  removeAmortization(id: string): void {
    this.updateScenario({
      ...this.scenario,
      amortizations: this.scenario.amortizations.filter((item) => item.id !== id),
    });
  }

  setAmortizationActive(id: string, active: boolean): void {
    const candidate: Scenario = {
      ...this.scenario,
      amortizations: this.scenario.amortizations.map((item) =>
        item.id === id ? { ...item, active } : item,
      ),
    };
    const error = validateScenario(this.draft, candidate, active ? id : undefined);
    if (error) {
      this.notify.emit(error);
      return;
    }
    this.updateScenario(candidate, active ? id : undefined);
  }

  private updateScenario(candidate: Scenario, changedId?: string): boolean {
    const error = validateScenario(this.draft, candidate, changedId);
    if (error) {
      this.notify.emit(error);
      return false;
    }
    this.draft.scenarios = this.draft.scenarios.map((scenario) =>
      scenario.id === candidate.id ? candidate : scenario,
    );
    this.scenario = candidate;
    return true;
  }

  private replaceScenario(candidate: Scenario): void {
    this.draft.scenarios = this.draft.scenarios.map((scenario) =>
      scenario.id === candidate.id ? candidate : scenario,
    );
    this.scenario = candidate;
  }
}
