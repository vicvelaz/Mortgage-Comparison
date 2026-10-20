# payment-breakdown Specification

## Purpose
TBD - created by archiving change add-payment-breakdown-and-scenario-comparison. Update Purpose after archive.

## Requirements

### Requirement: Desglose de la mensualidad
El sistema SHALL mostrar para cada mes la parte de la cuota ordinaria que corresponde a intereses y la que corresponde a capital, con su porcentaje sobre la cuota, y la amortización extra por separado.

#### Scenario: Suma del desglose
- **WHEN** se muestra una fila del cuadro de amortización
- **THEN** intereses más capital ordinario es igual a la cuota ordinaria de ese mes

#### Scenario: Amortización extra separada
- **WHEN** un mes tiene amortización extra
- **THEN** se muestra en una columna aparte y no se incluye en el porcentaje de intereses ni de capital de la cuota

### Requirement: Resumen de primera y última cuota
El sistema SHALL mostrar la cuota del primer mes y la del último con su desglose en intereses y capital.

#### Scenario: Evolución del desglose
- **WHEN** se abre la ficha de una oferta
- **THEN** el porcentaje de intereses de la primera cuota es mayor que el de la última en un préstamo con tipo mayor que 0

### Requirement: Gráfico de barras apiladas
El sistema SHALL mostrar un gráfico de barras apiladas con intereses, capital ordinario y amortización extra, con conmutador entre vista anual y mensual.

#### Scenario: Vista anual
- **WHEN** el usuario selecciona la vista anual
- **THEN** cada barra suma los 12 meses del año y el total coincide con la suma de las filas de la tabla

#### Scenario: Vista mensual
- **WHEN** el usuario selecciona la vista mensual
- **THEN** hay una barra por mes con los mismos valores que la tabla

### Requirement: Resultados que no cancelan el préstamo
El sistema SHALL advertir cuando un resultado termine el plazo con capital pendiente mayor que 0,01 € y SHALL excluirlo de los indicadores de menor coste total, menor cuota inicial, menos intereses y mejor coste relativo.

#### Scenario: Saldo pendiente al final del plazo
- **WHEN** un escenario termina el plazo con capital pendiente mayor que 0,01 €
- **THEN** se muestra «No se cancela dentro del plazo» y no puede ser elegido como el «Menor coste total» ni como mejor resultado en los demás indicadores
