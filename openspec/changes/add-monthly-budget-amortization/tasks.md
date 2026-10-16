# Tareas

## 1. Modelo y motor
- [ ] 1.1 Añadir `monthlyBudget` y `mode` a `Scenario`, con migración de valores por defecto.
- [ ] 1.2 Calcular `A_m` y la comisión por mes según la fórmula del diseño.
- [ ] 1.3 Implementar modo «Reducir plazo» (cuota fija entre cambios de tipo).
- [ ] 1.4 Ajustar la última ocurrencia al capital restante como cancelación total.
- [ ] 1.5 Integrar con la revalidación en cadena del cambio 2.

## 2. Validación
- [ ] 2.1 Validar `amount`, `startMonth` y `endMonth`.
- [ ] 2.2 Validar al importar y al cargar.

## 3. Interfaz
- [ ] 3.1 Bloque «Cantidad mensual dedicada» (importe, mes inicial, mes final) en el editor de escenario.
- [ ] 3.2 Selector de modo con texto de ayuda («Reducir cuota» y «Reducir plazo»).
- [ ] 3.3 Aviso «Con esta configuración la hipoteca quedará cancelada en el mes N».
- [ ] 3.4 Mostrar la cuota ordinaria y la amortización extra de cada mes en la tabla.

## 4. Tests
- [ ] 4.1 `amount` ≤ cuota: resultado idéntico al escenario sin cantidad mensual.
- [ ] 4.2 `amount` = cuota + 300 €, comisión 0 %: 300 € de amortización extra cada mes del periodo.
- [ ] 4.3 Comisión parcial del 1 %: `A + comisión = amount − cuota` (±0,01 €) cada mes.
- [ ] 4.4 Desembolso mensual igual a `amount` salvo el mes final.
- [ ] 4.5 Modo «Reducir plazo»: menos cuotas que el plazo y cuota ordinaria constante.
- [ ] 4.6 Modo «Reducir cuota»: mismo número de cuotas y cuota decreciente.
- [ ] 4.7 Saldo final 0 en ambos modos.
- [ ] 4.8 Último mes: amortización ajustada al saldo y comisión total.
- [ ] 4.9 Bonificación que cambia el tipo a mitad de plazo en modo «Reducir plazo»: la cuota se recalcula y se vuelve a fijar.
- [ ] 4.10 Regresión: valores de referencia de `project.md` sin cambios.

## 5. Cierre
- [ ] 5.1 `npx ng test --watch=false` y `ng build` sin errores.
- [ ] 5.2 `openspec validate add-monthly-budget-amortization --strict`.
