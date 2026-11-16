# Design

## Context

La aplicación es una SPA Angular estática en GitHub Pages. `Workspace` carga las ofertas v2 desde `localStorage`, conserva cambios allí y deriva los resultados de amortización en el navegador. No hay autenticación ni backend. La sincronización añade un límite de confianza nuevo: el cliente no puede decidir por sí solo qué datos puede leer o escribir.

## Goals / Non-Goals

**Goals:**

- Añadir cuenta Google y Firestore sin bloquear el arranque ni el uso local cuando Firebase no esté configurado o disponible.
- Mantener documentos de entrada pequeños, reutilizando validación v2 y aislamiento por UID.
- Hacer explícitos la conciliación inicial, los cambios pendientes sin conexión y el cierre de sesión.

**Non-Goals:**

- Mover cálculos, calendarios o reglas de negocio al servidor.
- Añadir una API propia, credenciales de servicio o almacenamiento de archivos.
- Sincronizar datos sin consentimiento autenticado ni cambiar el formato de importación/exportación.

## Decisions

### SDK cliente oficial

Usar los módulos oficiales de Firebase Authentication y Cloud Firestore. Aunque el contexto del proyecto evita dependencias nuevas, se autoriza el SDK web como excepción para esta integración; no se añadirá Admin SDK ni se incorporarán secretos al bundle. La configuración web y la clave API son públicas: restringir su uso en Google Cloud al dominio publicado y configurar ese dominio en Authentication. Si falta la configuración pública, la aplicación queda en modo local.

Alternativa considerada: llamar a las API REST con `fetch`. Se descarta porque requeriría mantener a mano la gestión de tokens, renovaciones, errores y cola offline, aumentando código sensible sin mejorar el límite de seguridad.

### Persistencia local y por cuenta

El modo invitado es el uso local actual, no una identidad anónima de Firebase: no requiere registro, inicialización de Auth ni conexión, y conserva todas las funciones en `hipoteca-comparador-v2`. Crear una caché local identificada por UID para cada cuenta autenticada; al cambiar de cuenta se detiene la sincronización anterior antes de cargar otra. Al registrarse o iniciar sesión, si existen ofertas de invitado, mostrar una conciliación explícita con las ofertas remotas antes de transferir nada. Mantener intacta la copia local durante y después de la carga.

El documento raíz de cada oferta vive en `users/{uid}/mortgages/{mortgageId}` y contiene solo sus campos comunes y una generación activa. Los escenarios, bonificaciones, amortizaciones y tramos de comisión se guardan en subcolecciones propias; cada documento hijo conserva su índice original y generación para reconstruir el orden de las listas. Cada guardado crea una generación completa y actualiza el puntero del documento raíz en un único batch atómico; luego limpia generaciones anteriores en transacciones que comprueban que el puntero no haya cambiado, para no borrar una versión concurrente activa. El repositorio recompone y valida el objeto v2 al leerlo y no guarda resultados calculados. Los límites de la aplicación son 8 escenarios por oferta, 16 bonificaciones y 32 amortizaciones por escenario, y 20 tramos por tipo de comisión; cada nombre admite hasta 200 caracteres.

Una escritura local se guarda primero en la caché activa. Los cambios pendientes, incluidas las eliminaciones, se conservan como una cola local hasta recibir confirmación de Firestore; una respuesta remota no puede reemplazar una modificación local pendiente sin aplicar la regla de `updatedAt`. Así, una caída de red no bloquea la edición ni pierde una eliminación.

### Conciliación y conflictos

Al registrarse desde el modo invitado, o al iniciar la sincronización de una cuenta, se comparan las colecciones local y remota por identificador. Se combinan los identificadores exclusivos y, para un identificador repetido, gana el `updatedAt` más reciente; en empate se conserva la versión remota para que el resultado sea determinista. El invitado puede trabajar sin conexión y transferir esos datos cuando vuelva a estar conectado. La operación se presenta antes de aplicarse y puede aplazarse sin escribir ni borrar en ninguno de los orígenes.

Alternativa considerada: reemplazar todo el conjunto remoto por el local. Se descarta porque puede borrar ofertas creadas en otro dispositivo. Para operaciones posteriores, las escrituras locales pendientes se revalidan al reconectar y se concilian con la misma regla. La cola debe registrar eliminaciones como tombstones hasta que Firestore confirme su aplicación.

### Límites de seguridad

Las reglas de Firestore parten de denegar todo y autorizan lecturas en la ruta del propietario solo cuando `request.auth.uid == uid`; esta regla simple también permite listar subcolecciones para recomponer ofertas. Cada tipo de documento valida expresamente sus campos permitidos, tipos, rangos y nombres de hasta 200 caracteres al escribir; Firestore impone además 1 MiB por documento. El repositorio valida cada registro al recomponerlo y rechaza los malformados. Las reglas no pueden imponer un límite agregado al número de documentos hijos, por lo que el repositorio valida los máximos de elementos de la aplicación. App Check se activa para la aplicación web y se configura en Firebase Console. Probar reglas permitidas y denegadas con Local Emulator Suite antes del despliegue.

Usar Google como proveedor; iniciar con ventana emergente y manejar el fallo del navegador mediante el flujo de redirección compatible. La URL de GitHub Pages debe estar autorizada y el retorno de redirección debe restaurar el estado pendiente sin perder datos locales.

### Límites de sincronización

Escribir al guardar y escuchar cambios remotos de la cuenta activa para reflejarlos en otros dispositivos; detener el listener antes de cerrar sesión o cambiar de UID. Mantener operaciones locales aunque una llamada cloud falle, mostrar estado pendiente/error y reintentar sin duplicar registros. El SDK y su caché no reemplazan `localStorage`: la cola propia conserva cambios y tombstones entre recargas sin conexión.

## Risks / Trade-offs

- **Reglas incompletas podrían exponer ofertas o admitir datos inválidos** → denegar por defecto, validar individualmente documentos raíz e hijos con el emulador, incluidos UID ajeno, sesión ausente, campos desconocidos y tamaños excedidos; validar también los máximos agregados al recomponer ofertas.
- **Conflictos y eliminaciones offline pueden resucitar registros** → conservar `updatedAt` y tombstones pendientes hasta confirmar la sincronización; probar carreras entre dos clientes.
- **Ventanas emergentes o persistencia del navegador pueden estar bloqueadas en Pages** → ofrecer redirección para Auth, mantener una caché local independiente y probar el flujo publicado en navegadores objetivo.
- **Cuotas y lecturas de listeners consumen el plan gratuito** → escuchar únicamente la colección del usuario autenticado y cerrar listeners al salir; revisar cuotas y facturación antes de publicar.
- **La caché local no está cifrada** → no guardar más que los datos de entrada necesarios y no presentarla como almacenamiento seguro en un dispositivo compartido.

## Migration Plan

1. Configurar Firebase Spark, Firestore en región europea, proveedor Google, dominio autorizado, App Check y reglas; validar reglas con el emulador.
2. Desplegar la aplicación con configuración pública. Cualquier usuario puede empezar como invitado y usar todas las funciones existentes, incluso sin conexión; sus ofertas siguen cargándose desde la clave v2 actual.
3. Cuando el invitado decida registrarse o iniciar sesión y tenga conexión, validar el usuario y el esquema, ofrecer conciliación y copiar a Firestore solo tras confirmación. Conservar la colección local y las claves v1/v2.
4. Para rollback, desactivar la configuración de nube o retirar la versión publicada; la aplicación vuelve al modo local y los datos v2 locales no requieren migración inversa. Los documentos remotos no se borran automáticamente.

## Open Questions

- Confirmar qué dominio exacto de publicación y clave de sitio de App Check se usarán al configurar el proyecto Firebase; esto es configuración de entorno y no cambia los contratos de la aplicación.
