## ADDED Requirements

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
