# Tareas

## 1. Desglose
- [x] 1.1 Columnas «% intereses» y «% capital» en la tabla de cuotas.
- [x] 1.2 Resumen de la cuota del mes 1 y del último mes con su desglose.
- [x] 1.3 Gráfico de barras apiladas (intereses, capital ordinario, amortización extra) con conmutador anual o mensual.

## 2. Comparación
- [x] 2.1 Selección por escenario con etiqueta «Hipoteca · Escenario».
- [x] 2.2 Tabla de diferencias frente al escenario base.
- [x] 2.3 Aviso de capital o plazo distintos solo cuando proceda.
- [x] 2.4 Etiquetas del gráfico de capital pendiente según la serie más larga.
- [x] 2.5 Columna y barra de comisiones.

## 3. Tests
- [x] 3.1 `interés + capital ordinario = cuota` en todas las filas de varias hipotecas.
- [x] 3.2 Suma anual del gráfico igual a la suma de filas.
- [x] 3.3 Ahorro frente al base = coste total base − coste total del escenario.
- [x] 3.4 Escenarios de la misma hipoteca: sin aviso de capital o plazo distintos.
- [x] 3.5 Hipotecas con distinto capital: el aviso aparece.
- [x] 3.6 Series de 10 y 30 años: las etiquetas cubren 360 meses.
- [x] 3.7 Regresión de valores de referencia.

## 4. Cierre
- [x] 4.1 Revisión visual con una hipoteca de 10 años y otra de 30 en el gráfico de capital pendiente.
- [x] 4.2 `npx ng test --watch=false` y `ng build` sin errores.
- [x] 4.3 `openspec validate add-payment-breakdown-and-scenario-comparison --strict`.
