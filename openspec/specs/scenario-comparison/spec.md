# scenario-comparison Specification

## Purpose
TBD - created by archiving change add-payment-breakdown-and-scenario-comparison. Update Purpose after archive.

## Requirements

### Requirement: Selección por escenario
El sistema SHALL permitir seleccionar en `/comparison` escenarios individuales de una o varias hipotecas, identificados como «Hipoteca · Escenario».

#### Scenario: Comparar escenarios de la misma hipoteca
- **WHEN** el usuario selecciona dos escenarios de la misma hipoteca
- **THEN** la tabla y los gráficos muestran ambos con su nombre de escenario

### Requirement: Diferencias frente al escenario base
El sistema SHALL mostrar, cuando todos los seleccionados pertenezcan a la misma hipoteca, el ahorro de intereses, la diferencia de coste total, los meses ahorrados y la diferencia de cuota inicial de cada escenario frente al base.

#### Scenario: Ahorro frente al base
- **WHEN** se compara un escenario con amortizaciones frente al base
- **THEN** el ahorro mostrado es el coste total del base menos el coste total del escenario

### Requirement: Aviso de comparabilidad
El sistema SHALL mostrar el aviso de capital o plazo distintos únicamente cuando entre los seleccionados haya hipotecas con distinto capital o distinto plazo.

#### Scenario: Misma hipoteca
- **WHEN** todos los seleccionados son escenarios de la misma hipoteca
- **THEN** no aparece el aviso de capital o plazo distintos

#### Scenario: Distinto capital
- **WHEN** se comparan escenarios de dos hipotecas con distinto capital
- **THEN** aparece el aviso y se muestra el coste financiero por cada 100 € prestados

### Requirement: Etiquetas del gráfico de capital pendiente
El sistema SHALL construir el eje de meses del gráfico de capital pendiente con la serie más larga para no recortar ninguna serie.

#### Scenario: Plazos distintos
- **WHEN** se comparan una serie de 10 años y otra de 30 años
- **THEN** el eje cubre 360 meses y la serie de 30 años se muestra completa

### Requirement: Comisiones en la comparación
El sistema SHALL mostrar las comisiones por amortización como columna de la tabla comparativa y como serie del gráfico de desglose de costes.

#### Scenario: Escenario con comisiones
- **WHEN** un escenario seleccionado tiene comisiones por amortización
- **THEN** la tabla muestra su importe y el gráfico incluye la serie «Comisiones»
