# mortgage-scenarios Specification

## Purpose
TBD - created by archiving change add-scenarios-data-model-v2. Update Purpose after archive.

## Requirements

### Requirement: Hipoteca con uno o más escenarios
El sistema SHALL representar cada hipoteca con datos comunes (importe, plazo, tipo, modalidad, fecha de inicio) y una lista de al menos un escenario, cada uno con sus propias bonificaciones y amortizaciones.

#### Scenario: Hipoteca nueva con escenario base
- **WHEN** el usuario guarda una hipoteca nueva
- **THEN** la hipoteca contiene exactamente un escenario llamado «Base» sin bonificaciones ni amortizaciones

#### Scenario: Datos comunes compartidos
- **WHEN** el usuario cambia el importe, el plazo o el tipo de una hipoteca con varios escenarios
- **THEN** el cambio se aplica a todos sus escenarios y se recalculan todos los resultados

### Requirement: Cálculo por escenario
El sistema SHALL calcular el resultado de una hipoteca para un escenario concreto a partir de los datos comunes y de las bonificaciones y amortizaciones de ese escenario.

#### Scenario: Escenarios independientes
- **WHEN** dos escenarios de la misma hipoteca tienen bonificaciones distintas
- **THEN** cada uno muestra su propia cuota, intereses y coste total

#### Scenario: Sin cambio numérico
- **WHEN** se calcula una hipoteca de 180.000 €, 25 años y 3,10 % en su escenario base sin eventos
- **THEN** la cuota es 862,97 €, los intereses son 78.891,58 € y hay 300 cuotas

### Requirement: Duplicar escenario
El sistema SHALL permitir duplicar un escenario creando una copia profunda e independiente con el nombre «<nombre> (copia)» e identificadores nuevos.

#### Scenario: Copia independiente
- **WHEN** el usuario duplica el escenario «Base» y cambia una bonificación en la copia
- **THEN** el escenario «Base» no cambia

### Requirement: Renombrar escenario
El sistema SHALL permitir renombrar un escenario con un nombre no vacío tras aplicar `trim()`.

#### Scenario: Nombre vacío rechazado
- **WHEN** el usuario intenta guardar un escenario con nombre vacío o solo espacios
- **THEN** el sistema rechaza el cambio y muestra un mensaje de error

### Requirement: Eliminar escenario
El sistema SHALL permitir eliminar un escenario salvo que sea el único de la hipoteca, y SHALL pedir confirmación antes de eliminar.

#### Scenario: Último escenario protegido
- **WHEN** el usuario intenta eliminar el único escenario de una hipoteca
- **THEN** el sistema no lo elimina y explica que debe existir al menos uno

#### Scenario: Eliminar el escenario base
- **WHEN** el usuario elimina el primer escenario de una hipoteca con dos
- **THEN** el segundo pasa a ser el escenario base

### Requirement: Selector de escenario en el editor
El sistema SHALL mostrar en `/mortgages` un selector de escenario que determine qué bonificaciones y amortizaciones se editan.

#### Scenario: Cambio de escenario en el editor
- **WHEN** el usuario selecciona otro escenario en el editor
- **THEN** las listas de bonificaciones y amortizaciones muestran las de ese escenario
