# Tareas

## 1. Regresiones H1: cálculo y ranking

- [x] 1.1 Añadir primero pruebas de los casos A, B, C y bonificación posterior, además de la propiedad determinista de 500 escenarios y las invariantes de cuadrícula/referencias; ejecutar `npx ng test --watch=false --include src/app/monthly-budget.spec.ts` y confirmar que las regresiones nuevas fallan antes del arreglo.
- [x] 1.2 Añadir primero una prueba de ranking con saldo residual forzado que compruebe advertencia y exclusión de todos los KPI; ejecutar `npx ng test --watch=false --include src/app/scenario-comparison.spec.ts` y confirmar el fallo previo.

## 2. Arreglo H1: motor y comparación

- [x] 2.1 Recalcular ante todo cambio de tipo efectivo y liquidar el saldo en el último mes; pasar las pruebas H1 y las referencias con `npx ng test --watch=false --include src/app/monthly-budget.spec.ts`.
- [x] 2.2 Mostrar la advertencia y excluir resultados con saldo superior a 0,01 € de los cuatro KPI; pasar las pruebas con `npx ng test --watch=false --include src/app/scenario-comparison.spec.ts`.

## 3. Regresiones y arreglo H2: formulario

- [x] 3.1 Añadir primero pruebas de componente para activar presupuesto, cambiar importe, cambiar modo, rechazar cambios cruzados y permitir campos intermedios; ejecutar `npx ng test --watch=false --include src/app/qa.spec.ts` y confirmar los fallos previos.
- [x] 3.2 Revalidar cambios estructuralmente válidos, proporcionar contexto de mensaje de cambio, restaurar los controles rechazados y validar el importe al salir del campo; pasar las pruebas H2 y mantener el rechazo de `saveMortgage()`.

## 4. Regresiones y arreglo H3: migración v1

- [x] 4.1 Añadir primero pruebas para amortización excesiva, eventos posteriores a cancelación, oferta inválida por plazo, lote determinista de ofertas y rechazo v2; ejecutar `npx ng test --watch=false --include src/app/mortgage-storage.spec.ts` y confirmar los fallos previos.
- [x] 4.2 Reparar puntuales v1 en orden usando céntimos, informar de migradas/ajustadas/descartadas y mantener v2 estricto; pasar las pruebas de almacenamiento y comparar resultados migrados.

## 5. Cierre

- [x] 5.1 Aclarar junto al selector que ambos modos con la misma cantidad mensual liquidan el mismo presupuesto, aunque repartan distinto cuota y amortización extra; verificar el texto en la prueba de formulario.
- [x] 5.2 Ejecutar `npx ng test --watch=false`, `npx ng build --configuration development --base-href=/Mortgage-Comparison/` y `openspec validate fix-repricing-revalidation-and-v1-repair --strict`; comprobar que los tres gates terminan correctamente.

## Seguimiento del flujo

- Sincronizar o archivar sin sincronizar los deltas según la decisión del usuario; después verificar el archivo.