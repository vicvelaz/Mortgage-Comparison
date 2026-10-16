# Diseño

## Modelo
```ts
interface CancellationFees { partial: FeeTier[]; total: FeeTier[]; }
interface FeeTier { fromMonth: number; toMonth?: number; percent: number } // percent >= 0
```
Se añade `cancellationFees` a `Mortgage` (valor por defecto: listas vacías, es decir, sin comisiones).

## Capital restante
Definición: capital pendiente **después de aplicar la cuota ordinaria de ese mes**. Es el máximo amortizable en ese mes.

Función pura `maxAmortizableAt(mortgage, scenario, month, excludingAmortizationId?)`:
1. Simula el escenario hasta `month` con el resto de eventos (excluyendo, si se indica, la amortización que se está editando).
2. Devuelve el capital restante tras la cuota ordinaria de ese mes, en céntimos.
3. Devuelve 0 si la hipoteca ya estaba cancelada antes de ese mes.

Reutiliza el motor. No se duplica la lógica de cálculo.

## Clasificación de una amortización puntual (comparación en céntimos)
| Importe frente a capital restante | Resultado |
|---|---|
| mayor | error, no se guarda |
| igual | cancelación total, comisión total, la hipoteca termina ese mes |
| menor | parcial, comisión parcial |

## Cálculo de comisiones
- Parcial: `round(importe × percent_parcial(mes) / 100)`.
- Total: `round(saldo_cancelado × percent_total(mes) / 100)`. En ese mes no se aplica la parcial.
- Mes sin tramo aplicable: 0 %.
- Tramos: no se pueden solapar; `toMonth` vacío significa «hasta el final».

## Revalidación en cadena
Cada cambio en un escenario ejecuta `validateScenario(mortgage, scenario)`, que recorre las amortizaciones puntuales en orden de mes y comprueba cada una contra el capital restante simulado. Si alguna falla, el cambio se rechaza con mensaje.

## Recurrentes
Política `RECURRING_OVERFLOW_POLICY = 'cap' | 'error'` en un único punto del código. Valor por defecto: `'cap'` (la última ocurrencia se ajusta al saldo y cuenta como cancelación total).

## Ahorro neto
`amortizationSavings = coste_total_sin_amortizar − coste_total_con_amortizaciones_y_comisiones`. Puede ser negativo.

## Rendimiento
La revalidación ejecuta el motor varias veces por cambio. Objetivo: menos de 100 ms con 50 años y 20 amortizaciones.

## Ejemplo orientativo (opcional en UI)
Botón «Cargar ejemplo según Ley 5/2019» con tramos editables y aviso «Revisa tu contrato: valores orientativos». No se fijan topes legales en el código.
