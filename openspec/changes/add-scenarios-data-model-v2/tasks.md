# Tareas

## 1. Modelo y motor
- [ ] 1.1 Definir `Scenario` y mover `bonuses`/`amortizations` de `Mortgage` a `Scenario`.
- [ ] 1.2 Cambiar `calculateMortgage` a `(mortgage, scenario)`. Actualizar llamadas y tests existentes.
- [ ] 1.3 Test de regresión: valores de referencia de `project.md` idénticos.

## 2. Persistencia y migración
- [ ] 2.1 Clave `hipoteca-comparador-v2` y `schemaVersion: 2`.
- [ ] 2.2 Migración v1 a v2 con copia de seguridad `hipoteca-comparador-v1-backup`.
- [ ] 2.3 Carga tolerante: descartar registros inválidos de forma individual y avisar.
- [ ] 2.4 Importar v1 y v2. Exportar v2.
- [ ] 2.5 Tests de migración, importación y ida y vuelta.

## 3. Acciones de escenario
- [ ] 3.1 Crear, duplicar (copia profunda), renombrar y eliminar escenarios.
- [ ] 3.2 Impedir eliminar el último escenario.
- [ ] 3.3 Selector de escenario en `/mortgages`. Importe, plazo y tipo se editan una sola vez.
- [ ] 3.4 Tests de duplicado independiente y de eliminación.

## 4. Cierre
- [ ] 4.1 `npx ng test --watch=false` y `ng build` sin errores.
- [ ] 4.2 `openspec validate add-scenarios-data-model-v2 --strict`.
