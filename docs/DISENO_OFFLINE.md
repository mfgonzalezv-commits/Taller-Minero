# Anexo — Diseño técnico para trabajo sin conexión (Fase 11)

**Estado: diseño únicamente. No implementado.** Este documento existe para que, cuando se
decida abordar el modo offline, no se empiece desde cero — pero deliberadamente no se tocó
código de la aplicación para esto en el plan maestro.

## Por qué se trata como mini-proyecto aparte

Hoy la aplicación asume conexión permanente: cada Server Action habla directo con la base
de datos en cada clic. Pasar a "funciona sin señal" no es agregar una librería — es cambiar
dónde vive la fuente de verdad mientras el celular está desconectado, y cómo se reconcilia
cuando vuelve a haber señal. Es un cambio de arquitectura, no una función más.

## Alcance ya acordado

**Primero** (mayor valor en terreno, donde de verdad falla la señal):
- Reporte de fallas (Fase 3)
- Inspecciones diarias (Fase 8)
- Registro de horómetro/kilometraje (Fase 5)
- Avances de OT (bitácora, checklist)

**Después**: bodega, compras, funciones administrativas — requieren consistencia más
estricta (stock, dinero) y son más riesgosas para hacer offline-first.

## Estrategia técnica propuesta

### Almacenamiento local
- **IndexedDB** (vía una librería liviana tipo `idb` o `dexie`) en el navegador — no
  `localStorage` (muy chico y síncrono, bloquea el hilo principal con datos de fotos).
- Un store por tipo de operación pendiente: `fallas_pendientes`, `inspecciones_pendientes`,
  `horometros_pendientes`, `bitacora_pendiente`.
- Cada registro pendiente lleva: `idLocal` (UUID generado en el cliente), `payload`,
  `timestampCreacion`, `estado` (`pendiente` | `sincronizando` | `sincronizado` | `error`),
  `intentos`, `errorMensaje`.

### Cola de sincronización
- Un *service worker* (Next.js soporta PWA vía `next-pwa` o configuración manual) detecta
  `online`/`offline` y dispara la sincronización al recuperar señal.
- La cola procesa en orden de creación, un tipo de operación a la vez, para no generar
  condiciones de carrera entre, por ejemplo, dos horómetros del mismo equipo.
- Reintentos con backoff exponencial acotado (ej. 3 intentos, luego queda en `error` visible
  para el usuario, no se pierde).

### Idempotencia
- El `idLocal` (UUID) generado en el cliente viaja en el payload y se guarda en el
  servidor (columna `idempotencyKey` o similar) — si la sincronización se reintenta (por
  ejemplo, se cortó la conexión a mitad de la respuesta), el servidor puede detectar que ya
  procesó ese `idLocal` y no duplicar el registro.
- Esto requiere agregar esa columna a los modelos que acepten escritura offline (`ReporteFalla`,
  `InspeccionDiaria`, `HorometroKm`, `BitacoraOT`) — cambio de schema aditivo, sin romper
  nada existente.

### Conflictos
- Los cuatro flujos elegidos son mayormente **aditivos** (crear un reporte, una inspección,
  una lectura, una entrada de bitácora) — no editan un registro compartido, así que el
  riesgo de conflicto real es bajo comparado con, por ejemplo, editar el mismo campo de un
  ítem de bodega desde dos celulares a la vez.
- Igual puede haber conflicto de **secuencia**: dos horómetros del mismo equipo creados
  offline en orden distinto al que se sincronizan. Mitigación: el timestamp de creación
  viaja en el payload y el servidor usa ESE timestamp (no el de llegada) para las
  validaciones de "salto anormal" de la Fase 5.

### Fotografías pendientes
- Las fotos se guardan como `Blob` en IndexedDB (no como base64 en el registro — muy
  pesado) con una referencia desde el registro pendiente.
- Se suben al adaptador de almacenamiento (Fase 3, pendiente de proveedor) recién al
  sincronizar, con su propia barra de progreso — no deben bloquear la sincronización del
  resto de los datos del reporte si la foto es grande y la señal es mala.

### Estados visibles al usuario
`pendiente` (guardado local, esperando señal) → `sincronizando` → `sincronizado` (o
`error`, con botón de reintentar manual). El usuario nunca debe preguntarse si su reporte
"se perdió" — la cola siempre es visible.

### Riesgos de seguridad y pérdida de datos
- Datos sensibles (nombre, descripciones) quedan en IndexedDB del dispositivo mientras no
  hay señal — en un celular compartido o perdido, eso es exposición. Mitigación: limpiar la
  cola tras sincronizar exitosamente, y considerar cifrado local si se maneja información
  más sensible a futuro.
- Si el usuario borra datos del navegador (o desinstala la PWA) antes de sincronizar, se
  pierde lo pendiente — hay que advertirlo claramente en la UI ("tienes 3 reportes sin
  enviar, no borres los datos de la app").
- La cola debe sobrevivir a que el usuario cierre la pestaña/app — IndexedDB persiste, pero
  hay que probar el comportamiento real en iOS Safari (históricamente más agresivo
  limpiando storage que Android/Chrome).

## Estimación de esfuerzo

Esto es una estimación gruesa para dimensionar la decisión, no un compromiso:

- Infraestructura base (IndexedDB, cola, service worker, detección online/offline): **1–2
  semanas**.
- Adaptar los 4 flujos elegidos (UI que funcione sin red + idempotencia en servidor):
  **~3-4 días por flujo**, así que **2-3 semanas** en total.
- Pruebas reales en terreno con señal mala/intermitente (no solo "modo avión" en el
  escritorio): **1 semana**, y probablemente revela ajustes.

Total aproximado: **5-7 semanas** de un desarrollador, más tiempo de prueba en campo real.

## Plan de implementación independiente (cuando se decida abordarlo)

1. Elegir y probar la librería de IndexedDB (`dexie` recomendado por su API más simple).
2. Agregar `idempotencyKey` a los 4 modelos elegidos (migración aditiva).
3. Implementar la cola y el service worker para **un solo flujo** (horómetro, el más
   simple) de punta a punta, probarlo en terreno real.
4. Repetir para inspecciones, fallas, bitácora — reutilizando la infraestructura ya probada.
5. Recién ahí evaluar extender a bodega/compras, con sus propias reglas de conflicto
   (stock sí puede chocar de verdad entre dos personas).
