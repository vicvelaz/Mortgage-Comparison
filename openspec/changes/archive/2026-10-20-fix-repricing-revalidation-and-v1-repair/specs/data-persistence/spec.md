## MODIFIED Requirements

### Requirement: Migración automática desde v1
El sistema SHALL migrar los datos de la versión 1 reparando las amortizaciones puntuales activas que superen el capital restante, ajustándolas al capital restante, o que caigan tras una cancelación o fuera de plazo, desactivándolas. SHALL conservar la copia de seguridad y la clave v1, e informar de las ofertas migradas, ajustadas y descartadas. La carga e importación de datos v2 SHALL continuar rechazando amortizaciones inválidas sin repararlas.

#### Scenario: Resultados idénticos tras migrar
- **WHEN** existen hipotecas v1 con bonificaciones y amortizaciones y se migran
- **THEN** cuota, intereses, coste total y ahorro de cada hipoteca coinciden con los calculados antes de migrar, reproduciendo los ajustes de amortización del motor v1

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