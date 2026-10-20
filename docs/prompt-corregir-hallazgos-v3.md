# Prompt: corregir el plazo vigente tras «reducir plazo» y el redondeo de comisiones

Pega todo lo que hay debajo de la línea en Claude Code desde la raíz del repositorio.

---

## Rol y contexto

Eres un desarrollador senior de Angular y TypeScript. Trabajas en `vicvelaz/Mortgage-Comparison`: simulador y comparador de hipotecas (Angular 22, signals, interfaz en español, datos en `localStorage`).

La tercera ronda de pruebas independientes confirmó que H1, H2 y H3 están bien corregidos y encontró **dos hallazgos nuevos** (N1 y N2). Además queda pendiente una mejora opcional (O1). Debes corregirlos, añadir tests de regresión y no romper nada.

Archivos implicados:

- `src/app/mortgage-calculator.ts`: motor (`calculateSchedule`, `monthlyPayment`, `maxAmortizableAt`).
- `src/app/workspace.ts`: `importData` (solo para O1).
- Specs de OpenSpec en `openspec/`.

## Restricciones generales

1. **No cambies resultados de casos que hoy son correctos.** Deben seguir idénticos:
   - escenarios sin amortizaciones ni cantidad mensual (cuadrícula de 448 casos);
   - escenarios que solo usan amortizaciones de «reducir cuota» (`reductionType: 'payment'`);
   - escenarios que solo usan «reducir plazo» con el tipo estable (sin bonificaciones que cambien el tipo).
2. Valores de referencia que no deben cambiar: 100.000 €, 30 años, 3 % → cuota 421,60 €; 180.000 €, 25 años, 3,10 % → cuota 862,97 €, intereses 78.891,73 €, 300 cuotas.
3. Todo el dinero se compara en céntimos. Sin dependencias nuevas. Textos de interfaz en español.
4. Test primero para cada hallazgo (debe fallar), arreglo, test en verde.
5. Al terminar: `npx ng test --watch=false` sin fallos y `npx ng build --configuration development --base-href=/Mortgage-Comparison/` sin errores.

---

## N1 [media]: tras «reducir plazo», la cuota se recalcula sobre el plazo original y la reducción se pierde

### Reproducción A: «reducir plazo» seguido de un cambio de tipo

180.000 €, 25 años, 4 % **fijo**, bonificación de −1,5 puntos con `startMonth: 1` y `endMonth: 36`, amortización única de 20.000 € en el mes 12 con `reductionType: 'term'`.

- Si la bonificación fuera permanente (el tipo nunca cambia), la hipoteca termina en **257 cuotas**.
- Con la bonificación que termina en el mes 36, hoy la cuota del mes 37 es **814,36 €** y hay **300 cuotas** (unos 84.060 € de intereses): la reducción de plazo desaparece.
- Lo correcto es conservar el plazo ya reducido: cuota del mes 37 = **914,30 €**, **257 cuotas** y unos **71.130 €** de intereses.

### Reproducción B: mezclar «reducir plazo» y «reducir cuota» (sin cambio de tipo)

180.000 €, 25 años, 4 % fijo, sin bonificaciones. Amortización `term` de 20.000 € en el mes 12 y amortización `payment` de 10.000 € en el mes 60.

- Hoy: **300 cuotas**, cuota del mes 61 = 747,32 €, intereses 86.363,47 €.
- Correcto: **250 cuotas**, cuota del mes 61 = **877,21 €**, intereses **73.677,06 €**.

### Causa

En `calculateSchedule`, el número de meses restantes se calcula siempre sobre el plazo original:

```ts
const monthsLeft = plannedMonths - month + 1;
```

Ese valor se usa para recalcular la cuota (cambio de tipo) y para las amortizaciones de «reducir cuota» (`monthlyPayment(remaining, monthlyRate, monthsLeft - 1)`). Cuando una amortización de «reducir plazo» ya ha acortado el plazo real, ambas operaciones vuelven a estirarlo hasta el plazo original.

### Regla de negocio (plazo vigente)

> Una amortización de «reducir cuota» mantiene el **plazo vigente** (el que ya resulta de las amortizaciones anteriores), y un cambio de tipo recalcula la cuota sobre el **plazo vigente**, no sobre el plazo original.

### Arreglo

Introduce el concepto de **mes final efectivo** (`effectiveEndMonth`), que empieza siendo `plannedMonths`:

1. `monthsLeft` pasa a calcularse sobre el mes final efectivo y se protege para no bajar de 1.
2. Cuando en un mes se aplica **al menos una amortización de «reducir plazo»** (`reductionType === 'term'`, incluida la cantidad mensual en modo `reduceTerm`) y queda capital pendiente, se recalcula el mes final efectivo como el mes actual más los meses que faltan para liquidar el capital pendiente con la cuota que se mantiene.
3. Las amortizaciones de «reducir cuota» y los cambios de tipo **no** modifican el mes final efectivo: solo recalculan la cuota sobre él.

Implementación orientativa, ya verificada en una copia aislada del motor (no te limites a copiarla: adáptala al estilo del código):

```ts
// 1) al inicio de calculateSchedule
let effectiveEndMonth = plannedMonths;

// 2) dentro del bucle, en lugar de plannedMonths - month + 1
const monthsLeft = Math.max(1, effectiveEndMonth - month + 1);

// 3) antes del bucle de eventos del mes
let termEventApplied = false;
// …y dentro del bucle, cuando se aplica el evento (tras comprobar que amount > 0):
if (item.reductionType === 'term') termEventApplied = true;

// 4) después del bucle de eventos y antes de `fixedPayment = nextPayment`
if (termEventApplied && remaining > 0) {
  effectiveEndMonth = Math.min(
    plannedMonths,
    month + monthsToPayOff(remaining, monthlyRate, nextPayment),
  );
}

// 5) helper
function monthsToPayOff(balance: number, monthlyRate: number, payment: number): number {
  if (balance <= 0) return 0;
  if (!(payment > 0)) return Infinity;
  if (monthlyRate === 0) return Math.max(1, Math.ceil(balance / payment - 1e-9));
  const ratio = (balance * monthlyRate) / payment;
  if (ratio >= 1) return Infinity; // la cuota no cubre los intereses
  return Math.max(1, Math.ceil(-Math.log1p(-ratio) / Math.log1p(monthlyRate) - 1e-9));
}
```

Puntos a vigilar:

- Mantén la defensa existente del último mes del plazo original (`month === plannedMonths && fixedPayment !== null`).
- `maxAmortizableAt`, `validateScenario` y la reparación de la migración v1 usan `calculateSchedule`, así que heredan el cambio. Comprueba que sus tests siguen pasando y que la validación sigue siendo coherente (el capital restante de un mes puede cambiar en escenarios mixtos).
- No cambies la semántica de `fixedPayment` ni del repricing por cambio de tipo introducida en H1.

### Aceptación (valores calculados con una referencia independiente)

| Caso | Cuotas | Cuota m36 | Cuota m37 | Intereses |
|---|---|---|---|---|
| A1. `term` 20.000 € en m12, bonificación permanente | 257 | 807,51 | 807,51 | 47.408 |
| A2. `term` 20.000 € en m12, bonificación hasta m36 | **257** | 807,51 | **914,30** | **71.130** |
| A3. sin amortizar, bonificación hasta m36 | 300 | 807,51 | 934,23 | 95.708 |

| Caso | Cuotas | Cuota m59 | Cuota m61 | Intereses |
|---|---|---|---|---|
| B1. solo `term` 20.000 € en m12 (tipo estable) | 250 | 950,11 | 950,11 | 77.060,53 |
| B2. `term` m12 + `payment` 10.000 € en m60 | **250** | 950,11 | **877,21** | **73.677,06** |

(Tolerancia ±0,02 € en cuotas y ±1 € en intereses; el número de cuotas debe coincidir exactamente.)

Además:

- **Sin regresión:** los escenarios que solo usan «reducir cuota», los que no tienen amortizaciones y los de «reducir plazo» con tipo estable dan resultados idénticos a los actuales.
- **Propiedad 1:** añadir una amortización de «reducir cuota», posterior a una de «reducir plazo» y que no sea una cancelación total, no cambia el número de cuotas (solo reduce la cuota).
- **Propiedad 2:** en un escenario con «reducir plazo», un cambio de tipo posterior no cambia el mes final (±1 mes) respecto al que había justo antes del cambio.
- **Propiedad 3:** el saldo final siempre es 0, el saldo nunca es negativo ni crece, y no hay `NaN` ni `Infinity`, también con cantidad mensual en modo `reduceTerm` y con una cuota que no cubre los intereses.
- **Aleatoria:** para 1.000 escenarios con semilla fija (tipo fijo y variable, ambos modos, bonificaciones con ventanas, amortizaciones puntuales y recurrentes de ambos tipos, cantidad mensual y comisiones), el resultado coincide con `qa/ref_v2.py`.

---

## N2 [muy baja]: las comisiones con medio céntimo exacto se redondean a la baja

### Reproducción

Cantidad mensual con 242,50 € de amortización extra al mes y comisión parcial del 1 %. La comisión exacta es 2,425 €, pero por coma flotante (`242.5 * 1 / 100 = 2.4249999999999998`) el motor la redondea a **2,42 €** en lugar de **2,43 €**. Se repite cada mes: en 159 meses son 1,58 € de diferencia.

### Arreglo

En el cálculo de `eventFee` (y en cualquier otro sitio que redondee una comisión), redondea a céntimos con «medio hacia arriba» tolerante a coma flotante, trabajando en céntimos:

```ts
const roundHalfUpCents = (cents: number): number => Math.floor(cents + 0.5 + 1e-9);
const eventFeeCents = roundHalfUpCents((toCents(amount) * percent) / 100);
const eventFee = fromCents(eventFeeCents);
```

No cambies el resto del redondeo (`principalCents`, `roundCents` de otros usos) salvo que un test lo exija.

### Aceptación

| Importe | % | Comisión esperada |
|---|---|---|
| 242,50 € | 1 | 2,43 € |
| 0,50 € | 1 | 0,01 € |
| 10,00 € | 0,25 | 0,03 € |
| 1.000,00 € | 0,15 | 1,50 € (sin empate: no cambia) |

- Con 159 meses de cantidad mensual con extra de 242,50 € al 1 %, la suma de comisiones coincide con la referencia (159 × 2,43 €).
- Ningún caso de la cuadrícula ni de los valores de referencia cambia.

---

## O1 [opcional, pendiente]: confirmar antes de sustituir al importar

Hoy `Workspace.importData` sustituye todas las ofertas actuales por las del archivo sin avisar (el test `U38` de `qa-v2.spec.ts` lo documenta).

- Si hay ofertas guardadas, pide confirmación con `confirm`: «Importar sustituirá tus N ofertas actuales. ¿Continuar?».
- Si el usuario cancela, no cambia nada, se limpia el valor del `<input type="file">` y el estado indica «Importación cancelada.».
- Si no hay ofertas, importa sin preguntar.
- Un archivo inválido sigue rechazándose sin preguntar.
- Tests: con ofertas y confirmando, sustituye; con ofertas y cancelando, conserva; sin ofertas, importa directamente. Actualiza `U38` para reflejar el nuevo comportamiento.

---

## Cambio de OpenSpec

Crea el cambio `fix-effective-term-horizon-and-fee-rounding` con `proposal.md`, `design.md`, `tasks.md` y estos deltas. En un requisito `MODIFIED` copia el texto completo del requisito existente y añade los escenarios nuevos (OpenSpec sustituye el requisito entero).

**`specs/monthly-budget/spec.md`** (requisito «Modo de amortización»)

```
## MODIFIED Requirements

### Requirement: Modo de amortización
(texto actual completo) El sistema SHALL mantener el plazo vigente en las amortizaciones de «Reducir cuota» y SHALL recalcular la cuota ordinaria ante un cambio de tipo sobre el plazo vigente, no sobre el plazo original, de modo que una reducción de plazo previa no se pierda.

(escenarios actuales) 

#### Scenario: Cambio de tipo tras reducir plazo
- **WHEN** una amortización de «Reducir plazo» deja la hipoteca en 257 cuotas y después una bonificación termina en el mes 36
- **THEN** la cuota se recalcula sobre el plazo vigente y la hipoteca sigue terminando en 257 cuotas

#### Scenario: Reducir cuota tras reducir plazo
- **WHEN** existe una amortización de «Reducir plazo» y después una de «Reducir cuota»
- **THEN** la segunda reduce la cuota manteniendo el plazo ya reducido
```

**`specs/amortization-fees/spec.md`** (requisito «Comisión por amortización parcial»)

```
## MODIFIED Requirements

### Requirement: Comisión por amortización parcial
(texto actual completo) El sistema SHALL redondear a céntimos la comisión de cada evento con «medio hacia arriba», incluso cuando la representación en coma flotante del importe exacto quede por debajo del medio céntimo.

(escenarios actuales)

#### Scenario: Comisión con medio céntimo exacto
- **WHEN** se amortizan 242,50 € en un mes con comisión parcial del 1 %
- **THEN** la comisión es 2,43 €
```

Si haces O1, añade en `specs/data-persistence/spec.md` un requisito `ADDED` «Confirmación al importar» con sus escenarios (con ofertas y confirmando, con ofertas y cancelando, sin ofertas).

Ejecuta `openspec validate fix-effective-term-horizon-and-fee-rounding --strict` y archívalo al terminar.

---

## Tests mínimos que debes añadir

1. **N1:** los casos A1, A2, A3, B1 y B2 de las tablas, las tres propiedades y la comparación aleatoria con 1.000 escenarios.
2. **N1 (validación):** en un escenario mixto, `maxAmortizableAt` y `validateScenario` siguen siendo coherentes con el cálculo (una cancelación total creada con «Cancelar totalmente» se acepta y una de más 0,01 € se rechaza).
3. **N2:** la tabla de importes y el caso de 159 meses.
4. **Regresión:** cuadrícula de 448 casos sin eventos, valores de referencia, escenarios solo de «reducir cuota», y los tests existentes.
5. **O1** (si se hace): los tres casos descritos.

Si dispones del paquete `qa-bateria-v4.zip` (carpeta `qa/`), ejecuta además, **desde la raíz del repo**:

```bash
npx esbuild qa/gen.ts --bundle --platform=node --format=esm --outfile=qa/gen.mjs
node qa/gen.mjs && python3 qa/ref_v2.py                         # esperado: solo 1 discrepancia benigna (~1 €) por redondeo
SEED=777001 FUZZ=4000 node qa/gen.mjs && python3 qa/ref_v2.py   # esperado: 0 discrepancias tras corregir N2
npx esbuild qa/features.ts --bundle --platform=node --format=esm --outfile=qa/features.mjs && node qa/features.mjs   # esperado: 82/82
npx esbuild qa/demo2.ts --bundle --platform=node --format=esm --outfile=qa/demo2.mjs && node qa/demo2.mjs           # esperado: 257 cuotas y cuota m37 = 914,30 € en el caso 2
npx esbuild qa/demo3.ts --bundle --platform=node --format=esm --outfile=qa/demo3.mjs && node qa/demo3.mjs           # esperado: 250 cuotas, cuota m61 = 877,21 €
npx ng test --watch=false --include src/app/qa-v2.spec.ts       # esperado: todos en verde
```

## Entregable

1. Código corregido con todos los tests en verde y la compilación sin errores.
2. Tabla resumen: hallazgo, archivos modificados, test asociado y estado.
3. Salida de la batería `qa/` antes y después del arreglo.
4. Si has hecho O1, indícalo; si no, el motivo.
5. Cualquier decisión que hayas tenido que tomar donde este documento no es explícito.
