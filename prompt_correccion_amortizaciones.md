# Prompt de Corrección: Corrección del Bug de Re-estiramiento en Tablas de Amortización

## 1. Diagnóstico del Bug

El problema de "re-estiramiento" ocurre cuando un recálculo parcial de amortización recalcula la cuota mensual dividiendo el capital pendiente entre el plazo restante sin fijar la fecha final objetiva (`targetMaturity`). Esto genera que los pagos adelantados o ajustes de tasa desplacen indebidamente el vencimiento original del crédito.

### Causas Raíz
1. **Pérdida de Anclaje Temporal**: No preservar `targetMaturity` tras amortizaciones anticipadas.
2. **Redondeo Acumulado**: Imprecisión flotante al iterar cuotas periódicas.
3. **Inconsistencia de Sistema de Amortización**: Mezcla inadvertida de sistema francés con recalculo constante de plazo.

---

## 2. Fórmulas Matemáticas

### Cuota Periódica (Sistema Francés)
$$C = P \cdot \frac{i(1+i)^n}{(1+i)^n - 1}$$

Donde:
- $C$: Cuota periódica
- $P$: Capital pendiente (Principal)
- $i$: Tasa de interés efectiva del período
- $n$: Número de períodos restantes estables ($n = \text{targetMaturity} - \text{periodoActual}$)

### Ajuste de Última Cuota por Redondeo
$$R = P_{\text{final}} - C_{\text{programada}}$$

---

## 3. Algoritmo TypeScript Correctivo

```typescript
interface AmortizationInput {
  principal: number;
  annualRate: number;
  totalPeriods: number;
  startDate: Date;
  prepayments?: Array<{ period: number; amount: number }>;
}

interface AmortizationRow {
  period: number;
  date: Date;
  payment: number;
  interest: number;
  principalPaid: number;
  remainingBalance: number;
}

export function generateAmortizationSchedule(input: AmortizationInput): AmortizationRow[] {
  const { principal, annualRate, totalPeriods, startDate, prepayments = [] } = input;
  const monthlyRate = annualRate / 12 / 100;
  const targetMaturityPeriod = totalPeriods;
  
  let balance = principal;
  const schedule: AmortizationRow[] = [];

  for (let period = 1; period <= totalPeriods; period++) {
    if (balance <= 0.01) break;

    const remainingPeriods = targetMaturityPeriod - period + 1;
    
    // Cálculo de cuota ajustada al plazo objetivo
    let pmt = (monthlyRate > 0)
      ? balance * (monthlyRate * Math.pow(1 + monthlyRate, remainingPeriods)) / (Math.pow(1 + monthlyRate, remainingPeriods) - 1)
      : balance / remainingPeriods;

    const interest = balance * monthlyRate;
    let principalPaid = pmt - interest;

    // Aplicar amortizaciones anticipadas si existen en el período
    const prepay = prepayments.find(p => p.period === period);
    if (prepay) {
      principalPaid += prepay.amount;
    }

    if (principalPaid > balance || period === totalPeriods) {
      principalPaid = balance;
      pmt = principalPaid + interest;
    }

    balance = Math.max(0, balance - principalPaid);
    
    const currentDate = new Date(startDate);
    currentDate.setMonth(currentDate.getMonth() + (period - 1));

    schedule.push({
      period,
      date: currentDate,
      payment: Number(pmt.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      principalPaid: Number(principalPaid.toFixed(2)),
      remainingBalance: Number(balance.toFixed(2))
    });
  }

  return schedule;
}
```

---

## 4. Batería de Pruebas (T1 - T4)

| Test ID | Escenario | Resultado Esperado | Criterio de Aprobación |
| :--- | :--- | :--- | :--- |
| **T1** | Tabla Estándar (Sin Pagos Extra) | Matriz exacta de $N$ períodos con saldo final $$0.00$. | `remainingBalance === 0` en período $N$. |
| **T2** | Prepago Parcial con Mantención de Plazo | Reduce cuota mensual, mantiene fecha de vencimiento final. | `schedule.length === totalPeriods`. |
| **T3** | Prepago Parcial con Reducción de Plazo | Mantiene cuota, reduce cantidad de períodos sin exceder `targetMaturity`. | `schedule.length < totalPeriods`. |
| **T4** | Ajuste por Tasa Variable | Recalcula cuota preservando plazo remanente estricto. | Sin derivación de fecha final. |

---

## 5. System Prompt Optimizado para Modelos Intermedios

```markdown
Eres un Ingeniero FinTech Senior especializado en algoritmos de crédito y amortizaciones.
Tu objetivo es auditar y refactorizar cualquier función de amortización que presente el bug de "re-estiramiento de plazo".

Reglas Mandatorias:
1. Siempre define y preserva 'targetMaturity' como un límite infranqueable.
2. En cada recálculo post-prepago, recalcula la cuota usando 'remainingPeriods = targetMaturity - currentPeriod + 1'.
3. Aplica redondeo bancario de 2 decimales en cada período e introduce un ajuste fino en el último período.
4. Asegura que la prueba unitaria T2 pase sin añadir períodos adicionales.
```
