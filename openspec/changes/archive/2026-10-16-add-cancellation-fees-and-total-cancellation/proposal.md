# Cambio: comisiones por amortización y cancelación total controlada

## Por qué
Amortizar anticipadamente puede llevar comisión, y hoy el simulador no la modela, por lo que sobreestima el ahorro. Además, una amortización mayor que el capital restante se recorta en silencio, y una igual al capital restante es en realidad una cancelación total, que suele tener otra comisión.

## Qué cambia
- Comisiones configurables por tramos de meses para amortización **parcial** y **total**, a nivel de hipoteca.
- Una amortización puntual **igual** al capital restante se registra automáticamente como **cancelación total** y aplica la comisión total.
- Una amortización puntual **mayor** que el capital restante se rechaza con un error que indica el máximo.
- Botón «Cancelar totalmente» que rellena el importe exacto.
- Revalidación en cadena de todas las amortizaciones del escenario ante cualquier cambio, al importar y al cargar.
- Las recurrentes cuya última ocurrencia supera el saldo se ajustan al saldo y cuentan como cancelación total.
- El resultado incorpora `amortizationFees`, que entra en el coste total. El «ahorro por amortización» pasa a ser neto de comisiones y **puede ser negativo**.

## Impacto
- Specs nuevas: `amortization-fees`, `amortization-validation`.
- Código: `mortgage-calculator.ts` (comisiones y saldo), `mortgage-validation.ts`, `workspace.ts`, `workspace.html`.
- Cambia una regla existente: se elimina `Math.max(0, …)` del ahorro por amortización. Hay que actualizar los tests que dependan de ello.

## Depende de
`add-scenarios-data-model-v2`.
