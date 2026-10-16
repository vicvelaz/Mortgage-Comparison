import { DecimalPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  Mortgage,
  MortgageResult,
  Scenario,
  calculateMortgage,
  createId,
} from './mortgage-calculator';
import { validateAmortization, validateBonus, validateMortgage } from './mortgage-validation';

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

  /** Resultado del borrador; null mientras el borrador no es válido. */
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
    this.scenario.bonuses = [
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
    ];
    this.bonusDraft = {
      name: '',
      interestReduction: 0.2,
      annualCost: 0,
      startMonth: 1,
      endMonth: null,
    };
  }

  removeBonus(id: string): void {
    this.scenario.bonuses = this.scenario.bonuses.filter((bonus) => bonus.id !== id);
  }

  addAmortization(): void {
    const item = this.amortizationDraft;
    const error = validateAmortization(item);
    if (error) {
      this.notify.emit(error);
      return;
    }
    this.scenario.amortizations = [
      ...this.scenario.amortizations,
      {
        id: createId(),
        name: item.name.trim() || `Amortización ${this.scenario.amortizations.length + 1}`,
        active: true,
        type: item.type,
        reductionType: item.reductionType,
        amount: item.amount,
        month: item.month,
        ...(item.type === 'recurring' ? { frequencyMonths: item.frequencyMonths } : {}),
      },
    ];
    if (item.month > this.draft.years * 12) {
      this.notify.emit(
        `La amortización cae en el mes ${item.month}, fuera del plazo de la hipoteca; no tendrá efecto.`,
      );
    }
    this.amortizationDraft.name = '';
  }

  removeAmortization(id: string): void {
    this.scenario.amortizations = this.scenario.amortizations.filter((item) => item.id !== id);
  }
}
