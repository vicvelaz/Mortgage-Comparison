# Prompt: corregir los hallazgos de la segunda ronda de pruebas (Mortgage-Comparison)

Pega todo lo que hay debajo de la línea en Claude Code desde la raíz del repositorio.

---

## Rol y contexto

Eres un desarrollador senior de Angular y TypeScript. Trabajas en `vicvelaz/Mortgage-Comparison`: simulador y comparador de hipotecas (Angular 22, signals, Chart.js, interfaz en español, datos en `localStorage`).

Una segunda ronda de pruebas independientes (2.948 casos numéricos contra una referencia en Python, 82 comprobaciones de motor y 38 de interfaz) encontró **3 hallazgos**. Debes corregirlos, añadir tests de regresión y no romper nada.

Archivos implicados:

- `src/app/mortgage-calculator.ts`: motor (`calculateSchedule`, `calculateMortgage`, `maxAmortizableAt`).
- `src/app/mortgage-form.ts` y `mortgage-form.html`: formulario de hipoteca y escenario.
- `src/app/mortgage-storage.ts`: carga, migración v1 a v2 e importación.
- `src/app/mortgage-validation.ts`: validación compartida.
- `src/app/workspace.ts`: ranking y KPIs (`lowest`, `selectedLowest`, `cheapest`, …).

## Restricciones generales

1. **No cambies resultados de entradas que hoy son correctas.** Deben seguir idénticos: sin eventos (cuadrícula de 448 casos), tipo variable, modo «reducir plazo», y cualquier escenario sin cambio de tipo posterior a una amortización.
2. Valores de referencia que no deben cambiar: 100.000 €, 30 años, 3 % → cuota 421,60 €; 180.000 €, 25 años, 3,10 % → cuota 862,97 €, intereses 78.891,73 €, 300 cuotas.
3. Todo el dinero se compara en céntimos (helper existente).
4. Sin dependencias nuevas. Textos de interfaz en español.
5. Test primero para cada hallazgo (debe fallar), arreglo, test en verde.
6. Al terminar: `npx ng test --watch=false` sin fallos y `npx ng build --configuration development --base-href=/Mortgage-Comparison/` sin errores.

---

## H1 [alta]: la cuota no se recalcula al cambiar el tipo tras una amortización

### Reproducción mínima

180.000 €, 25 años, 4 % **fijo**, modo «Reducir cuota», bonificación de −1,5 puntos con `startMonth: 1`, `endMonth: 36` (el tipo vuelve al 4 % en el mes 37). Compara dos escenarios:

- **A:** sin amortizaciones. Cuota mes 36 = 807,51 €, mes 37 = 934,23 €, 300 cuotas, saldo final 0.
- **B:** una amortización de **1 €** en el mes 12 (`reductionType: 'payment'`). Hoy la cuota del mes 37 sigue en 807,51 €, **quedan 53.503,27 € sin pagar** al final del plazo y el coste total sale ~33.455 € menor que el de A, por lo que B «gana» la comparación.

### Causa

En `calculateSchedule`:

```ts
const repricePayment =
  rateChanged && (mortgage.rateType === 'variable' || scenario.mode === 'reduceTerm');
```

Antes de la primera amortización `fixedPayment` es `null` y la cuota se recalcula cada mes, así que el cambio de tipo sí se refleja. Tras cualquier amortización `fixedPayment` queda fijado y, con tipo fijo y modo `reduceInstallment`, ya no se recalcula nunca. El comportamiento depende de si hubo una amortización antes, lo cual es incoherente. Afecta igual a una bonificación que **empieza** después de una amortización (la cuota no baja).

### Arreglo

1. **Recalcular la cuota siempre que cambie el tipo efectivo**, sea cual sea `rateType` o `scenario.mode`: `const repricePayment = rateChanged;`. Revisa las líneas que usan `repricePayment` (cálculo de `scheduledPayment`, `nextPayment` y la asignación final de `fixedPayment`) para que sigan coherentes.
2. **Defensa adicional:** en el último mes del plazo (`month === plannedMonths`) la cuota programada debe liquidar todo el capital pendiente (`remaining + interest`), con independencia de `fixedPayment`. Así un escenario nunca termina el plazo con saldo pendiente.
3. **Protección del ranking** (`workspace.ts` y la tabla de comparación): si un resultado termina con `remainingCapital > 0,01` (no se cancela dentro del plazo), muestra la advertencia «No se cancela dentro del plazo» y **exclúyelo** de «Menor coste total», «Menor cuota inicial», «Menos intereses» y «Mejor coste relativo» (`lowest`, `selectedLowest`, `lowestRelativeCost`). No debería ocurrir tras el arreglo; es una red de seguridad.

### Nota de diseño (decide y documenta, sin cambiar si no hace falta)

Con `reductionType: 'term'` y un cambio de tipo posterior, la cuota se recalcula sobre los meses restantes del **plazo original**, de modo que parte de la reducción de plazo se pierde. No es un error comprobado. Déjalo como está y anota la decisión en `design.md` del cambio de OpenSpec.

### Aceptación (valores calculados con la referencia independiente)

| Caso | Filas | Cuota m36 | Cuota m37 | Intereses | Coste total | Saldo final |
|---|---|---|---|---|---|---|
| A. sin amortizar | 300 | 807,51 | 934,23 | 95.707,64 | 275.707,64 | 0 |
| B. 1 € en mes 12 | 300 | 807,51 | 934,23 | 95.707,12 | 275.707,12 | 0 |
| C. 20.000 € en mes 12 | 300 | 715,09 | 827,31 | 85.262,14 | 265.262,14 | 0 |

(Tolerancia ±0,02 €.) Además:

- **Bonificación que empieza después:** 180.000 €, 25 años, 4 % fijo, bonificación −1 punto con `startMonth: 48`, amortización de 15.000 € en el mes 12 → cuota m47 = 869,00 €, **m48 = 792,04 €**, intereses 77.202,27 €, saldo final 0.
- Con tipo variable o modo «reducir plazo» los resultados no cambian respecto a hoy.
- **Propiedad:** para 500 escenarios aleatorios (semilla fija, mezclando tipo fijo/variable, ambos modos, bonificaciones con ventanas, amortizaciones puntuales y recurrentes), el saldo final es 0 y ninguna cuota baja al subir el tipo ni sube al bajarlo.
- **Ranking:** un escenario forzado con saldo pendiente al final del plazo no puede ser el «menor coste total».

---

## H2 [baja]: cambiar la cantidad mensual o el modo no revalida las amortizaciones

### Reproducción

Escenario con una cancelación total en el mes 100 (botón «Cancelar totalmente»). Activa «Cantidad mensual dedicada» (1.000 €): el formulario lo acepta sin aviso aunque ahora esa amortización supera el capital restante (81.084,06 €). El error solo aparece al guardar. Lo mismo al cambiar el importe de la cantidad mensual.

### Causa

`setMonthlyBudgetEnabled`, `setMonthlyBudgetField` y `setAmortizationMode` llaman a `replaceScenario`, que no valida; en cambio `addAmortization`, `addBonus`, `removeBonus`, `setBonusActive`, `setAmortizationActive` y `removeAmortization` usan `updateScenario`, que sí llama a `validateScenario`. El requisito de OpenSpec «Revalidación en cadena» exige validar también ante cambios de la cantidad mensual.

### Arreglo

1. En los tres métodos, construye el escenario candidato y, **si es estructuralmente válido** (`validateMonthlyBudget` sin error), ejecútalo por `validateScenario`. Si falla por una amortización puntual por encima del capital restante:
   - no apliques el cambio,
   - emite `notify` con el mensaje «Este cambio dejaría la amortización del mes N por encima del capital restante (máximo X €).»,
   - **restaura el valor visible del control** (`checked`, `value` del input o del `select`).
2. **No rechaces estados intermedios de edición** (por ejemplo, vaciar el campo para escribir otro importe). Solo la comprobación cruzada contra las amortizaciones puede rechazar el cambio; los errores de campo siguen mostrándose al guardar. Revisa en `mortgage-form.html` si el campo dispara `input` o `change` y, si hace falta, valida en `change` para no molestar mientras se escribe.
3. `validateScenario` hoy distingue «No puedes amortizar más…» (la amortización que se está añadiendo) de «Este cambio dejaría…» (otra amortización) mediante `changedAmortizationId`. Para cambios que no son una amortización, añade una forma limpia de pedir el segundo mensaje (por ejemplo, un parámetro opcional de contexto) en lugar de pasar un identificador inventado.
4. Mantén la red de seguridad actual: `saveMortgage()` sigue rechazando un escenario inválido.

### Aceptación

- Escenario con cancelación total en el mes 100; activar la cantidad mensual → no se activa, hay mensaje, el checkbox vuelve a desmarcado.
- Con la cantidad mensual ya activa, subir el importe hasta dejar inválida la amortización → se rechaza y el input recupera el valor anterior.
- Cambiar el modo cuando deja inválida una amortización → se rechaza y el `select` recupera el valor.
- Cambios válidos (por ejemplo, vaciar el importe un momento y escribir otro razonable) siguen funcionando.
- Los tests `U14`, `U15` y `U16` de `qa-v2.spec.ts` pasan.

---

## H3 [baja]: se pierden ofertas v1 al migrar si tenían una amortización mayor que el saldo

### Reproducción

En `localStorage`, clave `hipoteca-comparador-v1`, una oferta de 50.000 €, 10 años, 3 % con una amortización única de 999.999 € en el mes 6. Al abrir la app: «Se recuperaron 0 de 1 oferta». La oferta desaparece de la lista y solo queda en la copia de seguridad.

### Causa

El motor v1 recortaba silenciosamente cualquier amortización al capital pendiente y ignoraba las posteriores a la cancelación o fuera de plazo. La validación v2 las rechaza y, en la migración, una oferta inválida se descarta entera.

### Arreglo

Solo en la **migración v1 a v2** (no al cargar v2 ni al importar archivos v2), **repara en lugar de descartar**, reproduciendo lo que el usuario veía:

1. Recorre las amortizaciones puntuales del escenario en orden de mes, acumulando las ya aceptadas.
2. Para cada una, calcula `maxAmortizableAt` (en céntimos) con las aceptadas hasta ese momento:
   - si el máximo es 0 (hipoteca ya cancelada o mes fuera de plazo) → marca la amortización como `active: false`;
   - si el importe supera el máximo → ajusta el importe al máximo (cancelación total);
   - si no, déjala igual.
3. Las recurrentes no se tocan (el motor ya las ajusta).
4. Tras reparar, vuelve a ejecutar `validateMortgage`. Si sigue siendo inválida por otro motivo (importe, plazo, tipo…), descártala como hasta ahora y cuéntala en el aviso.
5. El aviso debe distinguir ofertas **migradas**, **ajustadas** (con nombre de oferta y amortización) y **descartadas**, p. ej.: «Se migraron 3 ofertas. Se ajustó la amortización «X» de «Antigua» al capital restante (50.000,00 €). Se guardó una copia de seguridad.»
6. Conserva la copia `hipoteca-comparador-v1-backup` y no borres la clave v1.

### Aceptación

- La oferta del ejemplo se migra (1 de 1), su amortización queda ajustada al capital restante del mes 6, el resultado coincide con el del motor v1 (±5 €) y el aviso la menciona.
- Una amortización posterior a la cancelación queda desactivada, no elimina la oferta.
- Una oferta con plazo de 200 años sigue descartándose y se cuenta como descartada.
- Con 100 ofertas v1 aleatorias (incluidas amortizaciones excesivas y fuera de plazo), el 100 % de las válidas en otros aspectos se migra y cada resultado coincide con el motor v1 (±5 €), salvo las que dependían del fallo H1 ya corregido.
- Cargar datos v2 con una amortización excesiva sigue rechazándola (sin reparación automática).

---

## Mejoras opcionales (hazlas si el alcance lo permite)

- **O1. Confirmar antes de sustituir al importar.** Hoy importar un archivo válido sustituye todas las ofertas actuales sin avisar. Si hay ofertas, pide confirmación («Importar sustituirá tus N ofertas actuales. ¿Continuar?»). Si cancela, no cambia nada. Añade test.
- **O2. Texto de ayuda en los modos de la cantidad mensual.** Con la misma cantidad mensual, «Reducir cuota» y «Reducir plazo» dan el mismo coste total y el mismo plazo; solo cambia cómo se reparte el desembolso entre cuota y amortización extra. Explícalo junto al selector para que no se interprete que «reducir cuota» mantiene el plazo.
- **O3. Mensaje de amortización fuera de plazo.** En `addAmortization`, el aviso «cae fuera del plazo» es código inalcanzable porque `validateScenario` ya rechaza antes con «ya está cancelada o termina antes del mes N». Unifica el mensaje o elimina el código muerto.

---

## Cambio de OpenSpec

Si existe `openspec/`, crea el cambio `fix-repricing-revalidation-and-v1-repair` con `proposal.md`, `design.md`, `tasks.md` y estos requisitos en `specs/`:

**`specs/monthly-budget/spec.md`**

```
## MODIFIED Requirements

### Requirement: Modo de amortización
El sistema SHALL ofrecer los modos «Reducir cuota» y «Reducir plazo» y SHALL recalcular la cuota ordinaria siempre que cambie el tipo efectivo, independientemente de la modalidad del tipo y del modo.

#### Scenario: Cambio de tipo tras una amortización en tipo fijo
- **WHEN** una bonificación cambia el tipo en el mes 37 y existe una amortización previa en un préstamo de tipo fijo en modo «Reducir cuota»
- **THEN** la cuota del mes 37 se recalcula sobre el saldo y los meses restantes y el capital pendiente final es 0

#### Scenario: Cuota que baja al empezar una bonificación
- **WHEN** una bonificación empieza en el mes 48 tras una amortización en el mes 12
- **THEN** la cuota del mes 48 es menor que la del mes 47
```

**`specs/amortization-validation/spec.md`**

```
## MODIFIED Requirements

### Requirement: Revalidación en cadena
El sistema SHALL volver a validar todas las amortizaciones puntuales de un escenario cada vez que se añada, edite, elimine o active una amortización, bonificación, la cantidad mensual o el modo de amortización, y SHALL rechazar el cambio restaurando el valor anterior si deja alguna por encima del capital restante.

#### Scenario: Activar la cantidad mensual invalida una cancelación total
- **WHEN** existe una cancelación total en el mes 100 y el usuario activa la cantidad mensual
- **THEN** el sistema no aplica el cambio, muestra «Este cambio dejaría la amortización del mes 100 por encima del capital restante» y restaura el control
```

**`specs/payment-breakdown/spec.md`** (o la de comparación)

```
## ADDED Requirements

### Requirement: Resultados que no cancelan el préstamo
El sistema SHALL advertir cuando un resultado termine el plazo con capital pendiente y SHALL excluirlo de los indicadores de mejor oferta.

#### Scenario: Saldo pendiente al final del plazo
- **WHEN** un escenario termina el plazo con capital pendiente mayor que 0,01 €
- **THEN** se muestra «No se cancela dentro del plazo» y no puede ser el «Menor coste total»
```

**`specs/data-persistence/spec.md`**

```
## MODIFIED Requirements

### Requirement: Migración automática desde v1
El sistema SHALL migrar los datos de la versión 1 reparando las amortizaciones puntuales que superen el capital restante (ajustándolas al capital restante) o que caigan tras una cancelación o fuera de plazo (desactivándolas), SHALL conservar la copia de seguridad y SHALL informar de las ofertas ajustadas y de las descartadas.

#### Scenario: Oferta v1 con amortización excesiva
- **WHEN** una oferta v1 tiene una amortización mayor que el capital restante
- **THEN** la oferta se migra con la amortización ajustada al capital restante y el aviso la menciona
```

Ejecuta `openspec validate fix-repricing-revalidation-and-v1-repair --strict` y archívalo cuando termines.

---

## Tests mínimos que debes añadir (en ficheros `*.spec.ts` del proyecto)

1. **H1:** los casos A, B, C y el de bonificación posterior de la tabla de aceptación. La propiedad de saldo final 0 con 500 escenarios aleatorios. Cuota que sube al subir el tipo y baja al bajarlo, también con amortización previa, en tipo fijo y variable y en ambos modos.
2. **H1 (ranking):** escenario con saldo pendiente forzado → aviso visible y excluido de los KPI.
3. **H2:** los cinco casos de aceptación, a nivel de componente (con `checked`, `value` del input y del `select` restaurados).
4. **H3:** los cinco casos de aceptación, incluido que v2 no se repara.
5. **Regresión:** cuadrícula de 448 casos sin eventos idéntica a la actual, valores de referencia del apartado de restricciones y los tests existentes.

Si tienes la carpeta `qa/` del paquete `qa-bateria-v2.zip`, ejecuta además:

```bash
npx esbuild qa/gen.ts --bundle --platform=node --format=esm --outfile=qa/gen.mjs && node qa/gen.mjs
cd qa && python3 ref.py                  # esperado: solo queda la discrepancia benigna de 0,97 € en saldo intermedio
cd .. && npx esbuild qa/features.ts --bundle --platform=node --format=esm --outfile=qa/features.mjs && node qa/features.mjs
                                          # esperado: D02, D03, D04, D05 e I02 pasan; H13 pasa tras la reparación de H3
npx ng test --watch=false --include src/app/qa-v2.spec.ts   # esperado: 38/38
```

## Entregable

1. Código corregido con todos los tests en verde y la compilación sin errores.
2. Tabla resumen: hallazgo, archivos modificados, test asociado y estado.
3. Salida de la batería `qa/` (si está disponible) antes y después del arreglo.
4. Lista de las mejoras opcionales hechas y no hechas, con el motivo.
5. Cualquier decisión que hayas tenido que tomar donde este documento no es explícito.
