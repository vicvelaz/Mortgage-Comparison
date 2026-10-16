# Prompt: corregir fallos detectados en Mortgage-Comparison

Copia todo lo que hay debajo de la línea y pégalo en Claude Code (o en tu agente de código) desde la raíz del repositorio.

---

## Rol y contexto

Eres un desarrollador senior de Angular y TypeScript. Trabajas en el repositorio `vicvelaz/Mortgage-Comparison`: un simulador y comparador de hipotecas hecho con Angular 22, signals, Angular Material y Chart.js, desplegado en GitHub Pages. La interfaz está en español.

Archivos relevantes:

- `src/app/mortgage-calculator.ts`: motor de cálculo (sistema francés, bonificaciones, amortizaciones).
- `src/app/workspace.ts` y `src/app/workspace.html`: un único componente que sirve las rutas `/dashboard`, `/mortgages` y `/comparison`.
- `src/app/app.spec.ts`: tests existentes (Vitest). **Deben seguir pasando.**

Una batería de pruebas detectó 7 fallos. Debes corregirlos todos, añadir tests de regresión y no romper nada de lo que ya funciona.

## Restricciones generales (obligatorias)

1. **No cambies los resultados numéricos de entradas válidas.** El motor ya fue validado contra una implementación de referencia: cuota inicial igual a la fórmula cerrada y diferencias de intereses de pocos euros por redondeo a céntimo. Ejemplos que deben mantenerse exactos:
   - 100.000 €, 30 años, 3 % → cuota 421,60 €.
   - 180.000 €, 25 años, 3,10 % → cuota 862,97 €, intereses 78.891,73 €, 300 cuotas.
   - 10.000 €, 1 año, 0 % → cuota 833,33 €.
2. Mantén el estilo del proyecto: signals, `.prettierrc`, textos de interfaz en español, sin dependencias nuevas.
3. Los mensajes de error se muestran con el signal `status` existente o con uno nuevo específico del formulario. Deben ser claros, en español y decir qué campo falla.
4. Para cada fallo, escribe primero el test que lo reproduce (debe fallar), arréglalo y confirma que pasa. Los tests nuevos van en `src/app/qa.spec.ts` o en archivos `*.spec.ts` separados.
5. Al terminar ejecuta `npx ng test --watch=false` y `npx ng build --base-href=/Mortgage-Comparison/`. Ambos deben terminar sin errores.

## Paso previo: validación única y compartida

Varios fallos nacen de que el formulario, `addBonus`, `addAmortization` y la importación validan cosas distintas. Crea un único conjunto de reglas reutilizable, por ejemplo `src/app/mortgage-validation.ts`, y úsalo en `saveMortgage()`, `addBonus()`, `addAmortization()` y `parseMortgage()`.

Reglas de negocio:

| Campo | Regla |
|---|---|
| `amount` | número finito > 0 |
| `years` | número finito, 1 ≤ years ≤ 50 (coincide con el `max="50"` del input) |
| `interestRate` | número finito ≥ 0; **`null`, `undefined` y `NaN` no valen** |
| `name`, `bank` | no vacíos tras `trim()` |
| Bonificación | `interestReduction` ≥ 0, `annualCost` ≥ 0, `startMonth` entero ≥ 1, `endMonth` (si existe) entero ≥ `startMonth` |
| Amortización | `amount` > 0, `month` entero ≥ 1; si es recurrente, `frequencyMonths` entero ≥ 1 |

La función debe devolver el primer error con texto legible, o `null` si todo es válido. Así se puede mostrar en la interfaz y reutilizar al importar.

---

## Fallos a corregir

### F1 [alta]: tipo de interés vacío se guarda como 0 %

- **Reproducción:** en `/mortgages`, crear una oferta, borrar «Tipo de interés» y guardar.
- **Hoy:** se guarda. `null` pasa el filtro y el motor lo trata como 0 %, así que sale la «más barata».
- **Causa:** `saveMortgage()` solo comprueba nombre, banco, `amount <= 0` y `years <= 0`. No comprueba `interestRate`.
- **Arreglo:** aplicar la regla compartida. Mensaje sugerido: «Indica un tipo de interés igual o superior a 0».
- **Aceptación:** una oferta con `interestRate` `null` o `NaN` no se guarda y `mortgages()` no cambia. Un 0 explícito sigue siendo válido.

### F2 [alta]: tipo de interés negativo se guarda y se trata como 0 %

- **Reproducción:** tipo = −3 y guardar. La cuota coincide con la del 0 %.
- **Arreglo:** la misma regla de F1 rechaza valores negativos.
- **Aceptación:** con −3 no se guarda y se muestra el mensaje.
- **Nota:** conserva el recorte a 0 % del tipo efectivo cuando una bonificación supera al tipo (`Math.max(0, rate - reduction)`). Ese comportamiento es intencional, pero ver F8 más abajo.

### F3 [alta]: la comparación de préstamos de distinto importe o plazo induce a error

- **Reproducción:** A = 100.000 € al 5 % a 25 años y B = 200.000 € al 1 % a 25 años. «Menor coste total» señala A (175.377 €) frente a B (226.124 €), aunque B es mucho mejor por euro prestado (intereses del 13 % del capital frente al 75 %).
- **Arreglo en `/comparison`:**
  1. Si las ofertas seleccionadas no tienen el mismo `amount` o `years`, mostrar un aviso visible (reutiliza el bloque `.notice` existente): «Las ofertas tienen capital o plazo distintos: el coste total no es directamente comparable. Fíjate en el coste por cada 100 € prestados.»
  2. Añadir una métrica normalizada, **coste financiero por cada 100 € prestados** = `(totalInterest + bonusCost) / amount * 100`, en la tabla «Comparativa detallada» y como KPI «Mejor coste relativo».
  3. Cuando haya aviso, el KPI «Menor coste total» debe llevar una nota breve («solo comparable con el mismo capital y plazo»).
  4. **Opcional, recomendado:** calcular la TAE aproximada de cada oferta como la TIR de los flujos mensuales (capital recibido, cuotas, extras y coste de bonificaciones) y mostrarla en la tabla. Implementarla como función pura y testeada en `mortgage-calculator.ts`.
- **Aceptación:** con el ejemplo A/B aparece el aviso, y el «Mejor coste relativo» señala a B. Con ofertas de igual capital y plazo no aparece el aviso.

### F4 [media]: se aceptan plazos mayores de 50 años y bonificaciones incoherentes

- **Reproducción:** plazo = 200 años y guardar. Y añadir una bonificación con inicio = 50 y fin = 10.
- **Causa:** Angular añade `novalidate` al `<form>`, así que `min`, `max` y `required` del HTML no se aplican. Además `addBonus()` no comprueba `endMonth >= startMonth`.
- **Arreglo:** aplicar las reglas compartidas en `saveMortgage()`, `addBonus()` y `addAmortization()`.
  - `addBonus()` y `addAmortization()` deben mostrar un mensaje de error cuando rechazan datos. Hoy salen en silencio.
  - Si `endMonth` queda vacío (`null`), significa «hasta el final» y es válido.
  - Además, si una amortización cae en un mes posterior al plazo (`month > years * 12`), muestra un aviso: «Esta amortización cae fuera del plazo y no se aplicará». Puedes bloquearla o permitirla con el aviso; elige una y documéntala en el test.
- **Aceptación:** 200 años no se guarda. Una bonificación con fin < inicio no se añade y se muestra un error.

### F5 [media]: el JSON exportado por la app a veces no se puede reimportar

- **Reproducción:** crear una oferta con una bonificación con fin < inicio, exportar e importar el mismo archivo. Resultado: «No se pudo importar».
- **Causa:** la importación (`parseMortgage`) valida más que el formulario.
- **Arreglo:** con la validación compartida (paso previo) ya no se pueden crear datos que luego no se importen. Añade además a `parseMortgage` la regla `years <= 50`, para que importar y guardar sean coherentes.
- **Test de ida y vuelta:** para cualquier oferta que el formulario permita guardar, `exportData()` seguido de `importData()` debe devolver «Importación completada.» y el mismo contenido.
- **Mejora del mensaje de importación:** distingue «JSON mal formado» de «oferta inválida: <motivo y nombre de la oferta>».

### F6 [media]: un solo registro corrupto en localStorage borra todas las ofertas

- **Reproducción:** editar `hipoteca-comparador-v1` para que una de tres ofertas tenga `amount: "abc"` y recargar. Se cargan 0 ofertas y el siguiente guardado sobrescribe todo.
- **Causa:** `readMortgages()` devuelve `[]` si **algún** elemento es inválido.
- **Arreglo:**
  1. Cargar las ofertas válidas y descartar solo las inválidas.
  2. Si se descartó algo, guardar el JSON original en una clave de respaldo (`hipoteca-comparador-v1-backup-<timestamp>`) **antes** de que se pueda sobrescribir, y avisar en `status`: «Se recuperaron N de M ofertas. Se guardó una copia de seguridad.»
  3. Si el JSON completo no se puede parsear, también hacer copia de seguridad y no dejar que el primer guardado la destruya sin aviso.
- **Aceptación:** con 3 ofertas y una corrupta se cargan 2, y la copia de seguridad contiene el texto original.

### F7 [baja]: plazos extremos producen NaN

- **Reproducción:** importar una oferta con `years` ≥ 30000. Cuota, coste total y saldo salen `NaN` y solo hay 1 fila.
- **Causa:** en `monthlyPayment`, `Math.pow(1 + r, months)` da `Infinity`, y `Infinity / (Infinity - 1)` es `NaN`.
- **Arreglo:**
  1. F4 y F5 ya limitan `years` a 50, lo que elimina el caso práctico.
  2. Aun así, haz el motor robusto: en `monthlyPayment`, si `factor` no es finito, devuelve el límite `capital * monthlyRate`. Y si algún resultado no es finito, `calculateMortgage` debe devolver un resultado vacío o lanzar un error controlado, **nunca `NaN`** en la interfaz.
- **Aceptación:** para cualquier entrada con campos finitos, `calculateMortgage` no devuelve `NaN` ni `Infinity`.

---

## Mejoras recomendadas (comportamientos engañosos, no errores)

Hazlas si el alcance lo permite. Si no, déjalas como issues y lístalas al final.

- **F8. Avisar cuando una bonificación supera al tipo.** Hoy se recorta a 0 % sin decir nada. Muestra un aviso en la ficha de la oferta: «Las bonificaciones superan el tipo de interés; el tipo efectivo se limita a 0 %».
- **F9. Modalidad variable.** Hoy es solo una etiqueta (resultado idéntico al tipo fijo). Añade un texto de ayuda junto al selector: «El cálculo usa el tipo indicado durante todo el plazo; no se simula la revisión del tipo variable».
- **F10. Tipo de amortización.** El motor solo reduce la cuota y mantiene el plazo. Añade, si es viable, la opción «reducir plazo» con una variante que mantiene la cuota, o al menos indica en la interfaz que se está usando «reducir cuota».
- **F11. «Ahorro por amortización».** Desglosa o explica que incluye el coste de bonificaciones que dejas de pagar (ejemplo: préstamo al 0 % con 1.200 €/año de bonificaciones cancelado en el mes 1 «ahorra» 23.900 €).
- **F12. Etiquetas de «Interés inicial» y «Cuota inicial».** Indica si incluyen o no las bonificaciones que empiezan después del mes 1. Hoy «Interés inicial» muestra el tipo sin bonificar.
- **F13. Gráfico de capital pendiente (probable error, verifícalo).** En `renderCharts()`, `labels` se toma de `rows[0]`. Si la primera oferta seleccionada tiene menos meses que otra, la curva de la más larga se cortaría. Usa como etiquetas la serie más larga: `Math.max(...rows.map(r => r.result.rows.length))`. Confirma visualmente con una oferta de 10 años y otra de 30.
- **F14. KPIs del Dashboard frente a `/comparison`.** El Dashboard calcula el mejor entre **todas** las ofertas y `/comparison` entre las **seleccionadas**. Aclara en la etiqueta del Dashboard («entre todas tus ofertas»).

## Tests mínimos que debes añadir

1. F1: `interestRate: null` y `NaN` no se guardan. `0` sí.
2. F2: `interestRate: -3` no se guarda.
3. F3: ejemplo A/B → aviso visible, métrica relativa correcta y mejor relativo = B. Mismo capital y plazo → sin aviso. Si implementas TAE: valor conocido (préstamo sin bonificaciones, TAE ≈ tipo nominal capitalizado mensualmente).
4. F4: 200 años no se guarda. Bonificación fin < inicio rechazada con mensaje. Amortización fuera de plazo avisada.
5. F5: ida y vuelta de exportar e importar con ofertas con bonificaciones y amortizaciones.
6. F6: localStorage con 3 ofertas (1 corrupta) → se cargan 2 y existe la copia de seguridad. JSON no parseable → copia de seguridad y mensaje.
7. F7: `years` = 30000, 100000 y 500000 → ningún `NaN` ni `Infinity`.
8. Regresión numérica: los 4 tests existentes y los valores de referencia de la sección «Restricciones» siguen idénticos.

## Entregable

1. Código corregido, con tests nuevos en verde.
2. Un resumen en Markdown con una tabla: fallo, archivos modificados, test asociado y estado.
3. La lista de mejoras recomendadas (F8 a F14) hechas y no hechas, con el motivo.
4. La salida de `ng test` y de `ng build` confirmando que no hay errores.
