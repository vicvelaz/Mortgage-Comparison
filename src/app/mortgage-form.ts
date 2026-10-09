import { DecimalPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Amortization, Mortgage, calculateMortgage, createId } from './mortgage-calculator';

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
  @Input() editingId: string | null = null;
  @Output() saveRequested = new EventEmitter<void>();

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

  private draftSavingsCache: { snapshot: string; savings: Map<string, number> } | null = null;

  currency(value: number): string {
    return currencyFormatter.format(value);
  }

  rateTypeLabel(type: Mortgage['rateType']): string {
    return type === 'fixed' ? 'Fija' : 'Variable';
  }

  amortizationColor(mortgage: Mortgage, id: string): string {
    const index = mortgage.amortizations.findIndex((item) => item.id === id);
    return amortizationColors[(index < 0 ? 0 : index) % amortizationColors.length];
  }

  draftAmortizationInterestSavings(id: string): number | null {
    const snapshot = JSON.stringify(this.draft);
    if (this.draftSavingsCache?.snapshot !== snapshot) {
      const result = calculateMortgage(this.draft);
      this.draftSavingsCache = {
        snapshot,
        savings: new Map(
          result.amortizationInterestSavings.map(({ id: amortizationId, savings }) => [
            amortizationId,
            savings,
          ]),
        ),
      };
    }
    return this.draftSavingsCache.savings.get(id) ?? null;
  }

  addBonus(): void {
    if (
      !this.bonusDraft.name.trim() ||
      !Number.isInteger(this.bonusDraft.startMonth) ||
      (this.bonusDraft.endMonth !== null && !Number.isInteger(this.bonusDraft.endMonth))
    )
      return;
    this.draft.bonuses = [
      ...this.draft.bonuses,
      {
        id: createId(),
        name: this.bonusDraft.name.trim(),
        active: true,
        interestReduction: Math.max(0, this.bonusDraft.interestReduction),
        annualCost: Math.max(0, this.bonusDraft.annualCost),
        startMonth: Math.max(1, this.bonusDraft.startMonth),
        ...(this.bonusDraft.endMonth
          ? { endMonth: Math.max(1, this.bonusDraft.endMonth) }
          : {}),
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
    this.draft.bonuses = this.draft.bonuses.filter((bonus) => bonus.id !== id);
  }

  addAmortization(): void {
    if (
      this.amortizationDraft.amount <= 0 ||
      !Number.isInteger(this.amortizationDraft.month) ||
      this.amortizationDraft.month < 1 ||
      (this.amortizationDraft.type === 'recurring' &&
        (!Number.isInteger(this.amortizationDraft.frequencyMonths) ||
          this.amortizationDraft.frequencyMonths < 1))
    )
      return;
    this.draft.amortizations = [
      ...this.draft.amortizations,
      {
        id: createId(),
        name:
          this.amortizationDraft.name.trim() ||
          `Amortización ${this.draft.amortizations.length + 1}`,
        active: true,
        type: this.amortizationDraft.type,
        reductionType: this.amortizationDraft.reductionType,
        amount: this.amortizationDraft.amount,
        month: this.amortizationDraft.month,
        ...(this.amortizationDraft.type === 'recurring'
          ? { frequencyMonths: this.amortizationDraft.frequencyMonths }
          : {}),
      },
    ];
    this.amortizationDraft.name = '';
  }

  removeAmortization(id: string): void {
    this.draft.amortizations = this.draft.amortizations.filter((item) => item.id !== id);
  }
}