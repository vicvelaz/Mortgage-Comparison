# Proposal

## Why

Las ofertas guardadas solo en `localStorage` no se sincronizan entre dispositivos y se pierden si el usuario cambia de navegador o equipo. La sincronización opcional con una cuenta permite recuperar las ofertas v2 sin introducir un backend propio ni impedir el uso local actual.

## What Changes

- Añadir inicio y cierre de sesión con Google y sincronización opcional de ofertas con Firestore bajo `users/{uid}/mortgages/{mortgageId}`, con escenarios, bonificaciones, amortizaciones y comisiones en subcolecciones validadas individualmente.
- Permitir comenzar como invitado, sin registro ni conexión, con todas las funciones actuales y guardado v2 en `localStorage`; usarlo también como caché cuando haya una cuenta.
- Permitir registrarse o iniciar sesión más adelante y, con confirmación, transferir las ofertas locales de invitado a la cuenta, conciliándolas con los datos remotos por `updatedAt`.
- Sincronizar únicamente datos de entrada v2, no resultados ni calendarios calculados.
- Restringir la lectura y escritura de cada documento a la identidad propietaria, validar cada escritura por tipo de documento y rechazar registros malformados al leer; exigir configuración de App Check para el despliegue.
- Mantener intactas las funciones actuales de importación y exportación JSON y la migración local v1 a v2.

## Capabilities

### New Capabilities
- `cloud-sync`: inicio de sesión Google, acceso aislado por usuario a las ofertas, sincronización entre Firestore y caché local, y conciliación inicial de datos.

### Modified Capabilities
- Ninguna. El contrato de `data-persistence` local no cambia; la sincronización autenticada se especifica como capacidad independiente.

## Impact

- Angular: `src/app/app.config.ts`, `src/app/workspace.ts` y sus plantillas/estilos; el almacenamiento actual y sus pruebas en `src/app/mortgage-storage.ts` y `src/app/mortgage-storage.spec.ts`; repositorio Firestore que recompone las subcolecciones como una oferta v2.
- Dependencias y configuración: SDK cliente de Firebase, configuración pública de Firebase para GitHub Pages y reglas de Firestore; no se usarán credenciales de cuenta de servicio.
- Operación: proyecto Firebase Spark, proveedor Google autorizado, base Firestore en región europea y App Check configurados fuera de la aplicación. La autenticación debe funcionar en GitHub Pages, con alternativa de redirección si el navegador bloquea la ventana emergente.