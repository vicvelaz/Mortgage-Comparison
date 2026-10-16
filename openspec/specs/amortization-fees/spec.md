# amortization-fees Specification

## Purpose

TBD: Update Purpose after archive.

## Requirements

### Requirement: Configuración de comisiones por tramos
El sistema SHALL permitir configurar por hipoteca comisiones por amortización parcial y por cancelación total como listas de tramos `{fromMonth, toMonth?, percent}` con `percent` mayor o igual que 0, sin comisiones por defecto.

#### Scenario: Valor por defecto
- **WHEN** el usuario crea una hipoteca nueva
- **THEN** no tiene comisiones (listas vacías) y los resultados no incluyen coste por comisiones

#### Scenario: Tramos solapados rechazados
- **WHEN** el usuario define dos tramos parciales que comparten algún mes
- **THEN** el sistema rechaza el cambio y muestra qué meses se solapan

#### Scenario: Mes sin tramo
- **WHEN** una amortización cae en un mes que no pertenece a ningún tramo
- **THEN** su comisión es 0 €

### Requirement: Comisión por amortización parcial
El sistema SHALL calcular la comisión de una amortización parcial como el importe amortizado multiplicado por el porcentaje parcial del mes, redondeado a céntimos.

#### Scenario: Comisión parcial del 1 %
- **WHEN** se amortizan 10.000,00 € parcialmente en un mes con comisión parcial del 1 %
- **THEN** la comisión es 100,00 € y se suma al coste total

### Requirement: Comisión por cancelación total
El sistema SHALL calcular la comisión de una cancelación total como el capital cancelado multiplicado por el porcentaje total del mes, redondeado a céntimos, y SHALL NOT aplicar en ese mes la comisión parcial.

#### Scenario: Cancelación total con comisión
- **WHEN** una amortización iguala el capital restante de un mes con comisión total del 0,5 %
- **THEN** la comisión es `round(capital cancelado × 0,5 / 100)` y no se aplica comisión parcial

### Requirement: Comisiones en el coste total
El sistema SHALL incluir la suma de comisiones en el resultado como `amortizationFees` y en el `totalCost`, y SHALL registrar la comisión de cada mes en su fila del cuadro de amortización.

#### Scenario: Coste total con comisiones
- **WHEN** una hipoteca tiene intereses I, bonificaciones B y comisiones F
- **THEN** el coste total es el capital devuelto más I más B más F

### Requirement: Ahorro por amortización neto de comisiones
El sistema SHALL calcular el ahorro por amortización como la diferencia entre el coste total sin amortizaciones y el coste total con amortizaciones y comisiones, y SHALL permitir que sea negativo mostrando «Amortizar cuesta más de lo que ahorra».

#### Scenario: Ahorro negativo
- **WHEN** las comisiones de una amortización superan los intereses que ahorra
- **THEN** el ahorro mostrado es negativo, se resalta en rojo y aparece la etiqueta «Amortizar cuesta más de lo que ahorra»
