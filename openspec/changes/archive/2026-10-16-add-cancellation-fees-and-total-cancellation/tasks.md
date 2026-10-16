# Tareas

## 1. Modelo y motor
- [x] 1.1 Añadir `cancellationFees` a `Mortgage` y a la migración (vacío por defecto).
- [x] 1.2 Implementar `maxAmortizableAt` reutilizando el motor.
- [x] 1.3 Aplicar comisión parcial y total en `calculateMortgage`. Añadir `amortizationFees` y `fee` por fila.
- [x] 1.4 Cambiar `amortizationSavings` a neto de comisiones (puede ser negativo).
- [x] 1.5 Defensa interna: el motor nunca produce saldo negativo ni `NaN`.

## 2. Validación
- [x] 2.1 Clasificar amortización puntual (mayor, igual, menor) en céntimos.
- [x] 2.2 `validateScenario` con revalidación en cadena.
- [x] 2.3 Validar tramos de comisión (sin solapes, percent >= 0).
- [x] 2.4 Aplicar la validación al importar y al cargar de `localStorage`.
- [x] 2.5 Política `RECURRING_OVERFLOW_POLICY` para recurrentes.

## 3. Interfaz
- [x] 3.1 Sección «Comisiones por amortización anticipada» en la hipoteca.
- [x] 3.2 Botón «Cancelar totalmente» y mensaje de error con el máximo exacto.
- [x] 3.3 Aviso «Cancelación total en el mes N».
- [x] 3.4 Línea «Comisiones por amortización» en ficha, tabla y gráfico de desglose.
- [x] 3.5 Etiqueta roja «Amortizar cuesta más de lo que ahorra» cuando el ahorro sea negativo.
- [x] 3.6 Botón opcional «Cargar ejemplo según Ley 5/2019» con aviso.

## 4. Tests (usar el motor para calcular el saldo S, sin cifras fijas)
- [x] 4.1 Amortización de `S` se acepta como cancelación total, `remainingCapital = 0`, comisión = `round(S × total% / 100)`.
- [x] 4.2 Amortización de `S + 0,01 €` se rechaza con el mensaje de error.
- [x] 4.3 Amortización de `S − 0,01 €` se acepta como parcial con comisión parcial.
- [x] 4.4 Añadir amortización previa que reduce el saldo y deja otra posterior por encima: rechazada por revalidación.
- [x] 4.5 Amortización posterior a la cancelación total: rechazada.
- [x] 4.6 Tramos solapados rechazados. Mes sin tramo: comisión 0.
- [x] 4.7 Ahorro negativo cuando las comisiones superan el ahorro de intereses.
- [x] 4.8 Importar escenario con amortización mayor que el saldo: rechazo con nombre de hipoteca y escenario.
- [x] 4.9 Recurrente cuya última ocurrencia supera el saldo: se ajusta y cuenta como cancelación total.
- [x] 4.10 Rendimiento: menos de 100 ms con 50 años y 20 amortizaciones.
- [x] 4.11 Regresión: valores de referencia de `project.md` sin cambios.

## 5. Cierre
- [x] 5.1 `npx ng test --watch=false` y `ng build` sin errores.
- [x] 5.2 `openspec validate add-cancellation-fees-and-total-cancellation --strict`.
