# data-persistence Specification

## Purpose
TBD - created by archiving change add-scenarios-data-model-v2. Update Purpose after archive.

## Requirements

### Requirement: Almacenamiento en esquema v2
El sistema SHALL guardar los datos en `localStorage` con la clave `hipoteca-comparador-v2` e incluir `schemaVersion: 2` en el contenido.

#### Scenario: Guardado
- **WHEN** el usuario guarda una hipoteca
- **THEN** el contenido de `hipoteca-comparador-v2` incluye `schemaVersion: 2` y la hipoteca con sus escenarios

### Requirement: Migración automática desde v1
El sistema SHALL migrar `hipoteca-comparador-v1` al arrancar si no existe v2, convirtiendo cada hipoteca en un escenario «Base» y reparando amortizaciones puntuales activas que excedan el saldo o queden tras la cancelación/fuera del plazo. SHALL conservar el backup y la clave v1, informar de ajustes y descartes, y mantener estricta la carga e importación v2.

#### Scenario: Resultados idénticos tras migrar
- **WHEN** existen hipotecas v1 con bonificaciones y amortizaciones y se migran
- **THEN** cuota, intereses, coste total y ahorro de cada hipoteca coinciden con los calculados antes de migrar

#### Scenario: Copia de seguridad previa
- **WHEN** se ejecuta la migración
- **THEN** el texto original de v1 se copia en `hipoteca-comparador-v1-backup` y la clave v1 no se borra

#### Scenario: Oferta v1 con amortización excesiva
- **WHEN** una oferta v1 tiene una amortización puntual mayor que el capital restante
- **THEN** la oferta se migra con la amortización ajustada al capital restante y el aviso la menciona por nombre de oferta y amortización

#### Scenario: Amortización v1 posterior a la cancelación
- **WHEN** una oferta v1 tiene una amortización puntual después de que otra amortización haya cancelado la hipoteca
- **THEN** la amortización posterior queda desactivada y la oferta se conserva

#### Scenario: Amortización excesiva en v2
- **WHEN** se cargan o importan datos v2 con una amortización puntual excesiva
- **THEN** los datos se rechazan sin reparación automática

### Requirement: Carga tolerante a registros inválidos
El sistema SHALL cargar las hipotecas válidas y descartar solo las inválidas, guardando una copia del texto original antes de poder sobrescribirlo y avisando al usuario.

#### Scenario: Una hipoteca corrupta de tres
- **WHEN** el almacenamiento contiene tres hipotecas y una tiene `amount: "abc"`
- **THEN** se cargan dos, se guarda una copia de seguridad con el texto original y `status` indica «Se recuperaron 2 de 3 ofertas»

#### Scenario: JSON no parseable
- **WHEN** el contenido del almacenamiento no es JSON válido
- **THEN** se guarda copia de seguridad del texto y se informa al usuario sin perder el original

### Requirement: Importación de v1 y v2
El sistema SHALL importar archivos JSON en esquema v1 (migrándolos al vuelo) y v2, y SHALL rechazar identificadores duplicados y registros inválidos indicando el motivo y el nombre de la oferta.

#### Scenario: Importar v1
- **WHEN** el usuario importa un archivo exportado con la versión anterior
- **THEN** las hipotecas se cargan como v2 con un escenario «Base» y se muestra «Importación completada.»

#### Scenario: Oferta inválida
- **WHEN** el archivo contiene una oferta con plazo de 200 años
- **THEN** la importación se rechaza con un mensaje que incluye el nombre de la oferta y el motivo

### Requirement: Exportación en v2
El sistema SHALL exportar siempre en esquema v2 con `schemaVersion: 2`.

#### Scenario: Ida y vuelta
- **WHEN** el usuario exporta y vuelve a importar el mismo archivo
- **THEN** el contenido importado es idéntico al exportado
