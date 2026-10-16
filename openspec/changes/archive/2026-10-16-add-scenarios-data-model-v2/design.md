# Diseño

## Modelo de datos
```ts
interface Mortgage {
  id: string; name: string; bank: string;
  amount: number; years: number; interestRate: number;
  rateType: 'fixed' | 'variable'; startDate?: string;
  scenarios: Scenario[];            // mínimo 1; el primero es el «base»
  updatedAt: string;
}
interface Scenario {
  id: string; name: string;
  bonuses: Bonus[];
  amortizations: Amortization[];
}
```
Los campos `cancellationFees` y `monthlyBudget` se añaden en los cambios siguientes, sin romper este esquema.

## Decisiones
- **Escenario base = el primero de la lista.** No hay flag `isBase`. Eliminar el primero promueve al siguiente.
- **Motor:** `calculateMortgage(mortgage, scenario)`. La lógica interna no cambia; solo se lee `bonuses`/`amortizations` del escenario.
- **Identificación en comparación:** cada elemento comparable es un par `(mortgageId, scenarioId)`. Etiqueta «Hipoteca · Escenario».
- **Migración v1 a v2:** por cada hipoteca v1 se crea un escenario «Base» con sus bonificaciones y amortizaciones. El resto de campos pasan sin tocar.
- **Copia de seguridad:** antes de escribir v2 se copia el texto crudo de v1 en `hipoteca-comparador-v1-backup`. No se borra v1.
- **Registros inválidos:** se descartan solo los inválidos. Si se descarta alguno, se guarda copia con el texto original y se avisa en `status`.

## Riesgos
- Migración que cambie resultados: se cubre con test de regresión numérica antes y después.
- IDs duplicados de escenario al duplicar: generar siempre con `createId()`.
