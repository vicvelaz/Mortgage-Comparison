# Firebase para la app de hipotecas en GitHub Pages

Evaluación de Firebase como almacenamiento en la nube (usuarios y ofertas de hipoteca) para una web estática alojada en GitHub Pages, con alternativas gratuitas. Fecha de la consulta: 13 de noviembre de 2026.

## Conclusión

**Sí, Firebase es una buena opción** para una web en GitHub Pages. Que las keys sean visibles no es un problema: lo que protege los datos son las reglas de seguridad y el login, no esconder la key.

Recomendación: **Firebase Spark (gratuito) con login de Google y Firestore en una región europea**, guardando solo los datos de entrada de cada hipoteca.

## Por qué la key visible no importa

- Las API keys de Firebase no controlan el acceso a los datos. Eso solo lo hacen las Security Rules y App Check.
- Las keys que crea Firebase vienen restringidas a sus propias APIs, así que no se tratan como secretas y se pueden incluir en el código.
- Lo que sí es secreto son las claves de cuenta de servicio (Admin SDK). Esta app no las necesita.

## Qué hay que hacer para que sea seguro

1. **Reglas de Firestore.** Cada oferta solo la lee y escribe su dueño (`request.auth.uid == uid`). Conviene partir de todo denegado y abrir solo lo necesario, con validación de campos y de tamaño.
2. **Login con Google.** Los proveedores OAuth son los más seguros. Con email y contraseña, activar la protección contra enumeración de cuentas. El login anónimo no sirve como sustituto: se pierde al cambiar de dispositivo, y eso va contra el objetivo.
3. **App Check**, para que solo la propia web pueda llamar al backend.
4. **Restricciones de la key.** Limitarla al dominio `vicvelaz.github.io` y añadir ese dominio a los autorizados de Authentication.
5. **Login por redirección en GitHub Pages.** Algunos navegadores bloquean el almacenamiento de terceros; conviene probar el login con ventana emergente. No se ha verificado en esta consulta.

### Reglas

Las reglas completas y sus pruebas están en [`firestore.rules`](firestore.rules) y
[`firebase-tests/firestore.rules.spec.ts`](firebase-tests/firestore.rules.spec.ts).
Se prueban con el Local Emulator Suite antes de publicarlas.

## Límites gratuitos de Firebase (plan Spark)

- 1 GB de almacenamiento, 20.000 escrituras al día y 50.000 lecturas al día en Firestore.
- Authentication gratis hasta 50.000 usuarios activos al mes.
- Spark no pide tarjeta, y al superar una cuota se restringe el servicio en lugar de cobrar. No hay riesgo de factura sorpresa.
- Las alertas de presupuesto de Google Cloud avisan, pero no cortan el gasto. Por eso conviene quedarse en Spark.
- Cloud Storage de Firebase exige el plan de pago. No hace falta: se guardan solo los datos de entrada de cada hipoteca (importe, plazo, escenarios) y los calendarios se calculan en el navegador.
- Inconveniente: Firestore es tecnología propietaria y migrar los datos a otro sitio es difícil.

## Alternativas gratuitas

| Opción                                     | Qué ofrece gratis                                   | Principal problema                                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Firebase (Spark)**                       | Firestore 1 GB, Auth 50.000 usuarios, sin tarjeta   | Datos propietarios; límites duros                                                                                                                                                                                                          |
| **Supabase**                               | Postgres de código abierto, 500 MB, 50.000 usuarios | Pausa el proyecto tras 7 días sin actividad y hay que reactivarlo a mano                                                                                                                                                                   |
| **Cloudflare Workers + D1**                | 5 M lecturas/día, 100.000 escrituras/día, 5 GB      | Hay que construir el backend y el login; la CPU gratuita (10 ms por petición) no permite hashear contraseñas, así que solo valdría un proveedor externo; desde el 1 de septiembre de 2026 las consultas fallan al superar el límite diario |
| **Appwrite, PocketBase, Convex, Turso**    | No verificado                                       | No se han comprobado sus condiciones gratuitas actuales                                                                                                                                                                                    |
| **Sin backend (Google Drive del usuario)** | Gratis, sin gestionar usuarios                      | Sincronización más frágil; no verificado                                                                                                                                                                                                   |

Para una app de uso esporádico, la pausa de Supabase es el motivo principal para descartarlo.

## Diseño propuesto

- Un documento raíz por hipoteca en `users/{uid}/mortgages/{id}` y subcolecciones para escenarios, bonificaciones, amortizaciones y tramos de comisión. Guardar solo datos de entrada, no los calendarios calculados. La guía de despliegue está en [`docs/firebase-setup.md`](docs/firebase-setup.md).
- Mantener `localStorage` como caché y como modo sin cuenta.
- Al primer login, ofrecer subir los datos locales y resolver conflictos por `updatedAt`.
- Elegir una región europea para Firestore: los usuarios están en España y son datos financieros personales.
- Las ofertas son pequeñas, así que el límite de 1 GB no sería un problema realista.

## Activar la funcionalidad implementada

La integración de autenticación, caché y sincronización está implementada. Para
conectarla a un proyecto real, sigue la guía de [configuración de Firebase](docs/firebase-setup.md):
crea Firestore y el proveedor Google, configura App Check, guarda los valores
públicos de la aplicación web en `src/app/firebase-config.ts`, despliega las reglas
y publica el build. No se deben generar ni copiar tokens de acceso al código; los
SDK los gestionan durante la sesión. La configuración actual mantiene Firebase
desactivado hasta que se rellenen esos valores.

## Fuentes consultadas

- Firebase: claves de API, https://firebase.google.com/docs/projects/api-keys
- Firebase: lista de comprobación de seguridad, https://firebase.google.com/support/guides/security-checklist
- Precios de Firebase 2026, https://blog.back4app.com/firebase-pricing/ y https://www.verdent.ai/guides/devtools/firebase-pricing
- Precios de Firebase Authentication, https://toolradar.com/tools/firebase-auth/pricing
- Límites gratuitos de Supabase 2026, https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ y https://makerkit.dev/blog/saas/supabase-pricing
- Cloudflare D1: aplicación de límites gratuitos, https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Cloudflare: capa gratuita, https://freetier.co/cloudflare-free-tier y https://github.com/halideworks/onelight/wiki/Pricing

Los límites y precios cambian con frecuencia: conviene confirmarlos en las páginas oficiales antes de decidir.
