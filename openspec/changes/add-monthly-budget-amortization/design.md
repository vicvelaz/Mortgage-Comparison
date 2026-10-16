# Diseño

## Modelo
```ts
interface MonthlyBudget { amount: number; startMonth: number; endMonth?: number }
type AmortizationMode = 'reduceInstallment' | 'reduceTerm';
interface Scenario { /* ... */ monthlyBudget?: MonthlyBudget; mode: AmortizationMode } // mode por defecto: 'reduceInstallment'
```

## Fórmula por mes
Sea `C_m` la cuota ordinaria del mes m y `p` el porcentaje de comisión parcial de ese mes:
```
disponible = amount − C_m
si disponible <= 0 → A_m = 0
si no            → A_m = round(disponible / (1 + p/100))
                   comisión_m = round(A_m × p/100)
```
Así `C_m + A_m + comisión_m = amount` (±0,01 € por redondeo).

Último mes: si `A_m` supera el capital restante, `A_m` = capital restante y la comisión pasa a ser la total (cancelación total). El desembolso de ese mes puede ser menor que `amount`.

## Modos
- **Reducir cuota:** tras amortizar, la cuota se recalcula sobre saldo y meses restantes del plazo original. Mantiene el plazo.
- **Reducir plazo:** la cuota ordinaria se fija al valor calculado al inicio o en el último cambio de tipo (por bonificación) y se mantiene constante. El préstamo termina antes. Si el tipo cambia, se recalcula la cuota sobre el saldo y los meses restantes del plazo original y se vuelve a fijar.

En ambos modos el capital amortizado por mes es el mismo si `amount` es el mismo. Cambia cuota frente a plazo.

## Interacción con amortizaciones sueltas
La cantidad mensual y las amortizaciones puntuales o recurrentes se suman. La validación en cadena del cambio 2 sigue aplicando a las puntuales.

## Validaciones
`amount > 0`; `startMonth` entero ≥ 1; `endMonth`, si existe, entero ≥ `startMonth`.
