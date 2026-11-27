# Asistente Claude para administradores — plan (27 Nov 2026)

## Objetivo
Que los administradores (Tomás, Mario, Valentina, Amparo) le pidan cosas a Claude desde el panel:
consultas sobre cualquier dato y cambios sobre los datos. Claude trabaja solo sobre la base de Supabase:
nunca toca el código, GitHub ni las edge functions.

## Cómo funciona
- Un chat **«🤖 Asistente»** disponible en todo el panel (botón en el topbar), solo para rol `admin`.
- Edge function nueva **`asistente-admin`** con un ciclo de herramientas (tool use) de la API de Claude.
  Claude decide qué consultar, lee los resultados y responde; no se le manda toda la base en el prompt
  (los agentes actuales sí lo hacen, por eso ven poco y gastan mucho).
- El control de que el usuario es admin se hace **en el servidor** (JWT + `usuarios.rol = 'admin'`),
  no solo ocultando el botón.

## Herramientas que tiene Claude

### Lectura (sin confirmación)
- `listar_tablas` y `describir_tabla`: qué tablas y columnas hay.
- `consultar`: una consulta **SELECT** de solo lectura. Corre en Postgres con una función
  `asistente_consulta(sql)` que:
  - abre la transacción en **READ ONLY** (Postgres rechaza cualquier escritura aunque el SQL la intente),
  - rechaza todo lo que no empiece con SELECT/WITH y cualquier `;` encadenado,
  - corta a los 8 segundos y devuelve como máximo 500 filas,
  - no puede leer tablas sensibles: `arca_tokens`, `auth.*`, `vault.*`, `tokens_api`, secrets.
- Las reglas del negocio van en el prompt: ejercicio 01/07–30/06, cuentas del plan, sociedades, que
  los asientos anulados no cuentan, etc. (un resumen de lo que hoy está en CLAUDE.md).

### Cambios (siempre con confirmación)
Claude **no escribe**: arma una *propuesta de cambio* que el panel muestra como tarjeta
(«Voy a anular el asiento X de $Y — motivo»), con antes/después. Recién cuando el admin aprieta
**Confirmar**, el panel ejecuta el cambio.
- Fase 2 arranca con pocas acciones, todas reversibles:
  - anular / desanular un asiento,
  - corregir campos puntuales (fecha, medio de pago, estado, observaciones) en facturas, órdenes de pago,
    caja, banco, VEP y cuotas de préstamo,
  - cargar filas nuevas en tablas de datos (por ejemplo un movimiento de caja o un VEP).
- **Prohibido:** borrar filas en forma definitiva, tocar `usuarios`, permisos, RLS, tablas de sistema,
  crear o modificar tablas, o ejecutar SQL libre de escritura.
- Para cambios contables complejos (pagos, asientos nuevos), Claude indica qué botón del panel usar
  en vez de hacerlo él, así se respetan las reglas que ya tienen esos flujos.

## Registro y respaldo
- Tabla `asistente_conversaciones` (chats guardados por usuario).
- Tabla `asistente_cambios`: cada cambio confirmado con quién lo pidió, cuándo, el pedido original,
  la fila **antes** y **después**, y un botón **Deshacer** que vuelve la fila a como estaba.
- Uso de tokens a `ia_uso` y control de límite con `chequearLimiteIA()`, igual que los demás agentes.

## Fases
1. **Solo consultas** (función, SQL de la función de lectura, chat en el panel). Se prueba con
   preguntas reales del cierre: saldos, qué falta conciliar, qué le debemos a cada proveedor.
2. **Cambios con confirmación** y registro con deshacer.
3. Más adelante: adjuntar archivos al chat (un PDF o Excel para que lo cruce con la base), y
   ofrecerlo al rol `contable` en modo solo consulta.

## Lo que hace Tomás
- Correr el SQL de cada fase en Supabase.
- Deployar `asistente-admin` copiando el archivo desde GitHub (`raw.githubusercontent.com`), no desde
  una copia local.
