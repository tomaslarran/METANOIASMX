# Metanoia SMX — Panel de Gestión Interno

## Contexto del proyecto

Panel web interno para **Metanoia SMX**, empresa de capacitación médica en simulación de Salta, Argentina. Tiene dos sociedades: **SUDES** (cursos de simulación médica) y **POINTERS** (logística/servicios).

**Stack:** HTML/CSS/JS monolítico (sin framework) + Supabase (PostgreSQL + Auth + Edge Functions) + GitHub Pages (hosting).

**URL producción:** https://tomaslarran.github.io/METANOIASMX/  
**Repo:** https://github.com/tomaslarran/METANOIASMX  
**Supabase project:** jppxmdvddvbsvymogvcp.supabase.co

**Cierre de balance:** El balance se cierra el **30 de junio** de cada año. Las facturas (`comprobantes_compra`) con fecha ≤ 30/06 de cada ejercicio se marcan con `estado = 'cerrado'` — quedan archivadas sin generar movimiento de caja ni aparecer como pendientes de pago. El ejercicio limpio arranca el 01/07.

---

## Arquitectura

### Frontend
- **Un solo archivo:** `index.html` (~800KB) — todo el HTML, CSS y JS en un archivo
- **Sin framework** — vanilla JS, sin React/Vue/etc.
- **PWA** — service worker (`sw.js`) + manifest (`manifest.json`)
- **Supabase REST API** via función `sb(path, opts)` — wrapper con auto-refresh de token JWT
- **Auth:** Supabase Auth con email/password. Session en `sessionStorage` como `smx_session`

### Backend
- **Supabase PostgreSQL** — base de datos principal
- **Supabase Edge Functions** (Deno/TypeScript) en `supabase/functions/`
- **GitHub Pages** — hosting estático del frontend

### Librerías CDN (cargadas dinámicamente)
- `xlsx` — parseo de archivos Excel
- `jsPDF` — generación de PDFs
- `qrcode-generator` — QR codes
- `Chart.js` — gráficos
- `marked` — markdown rendering
- `mammoth` — extracción de texto de archivos .docx (cargado dinámicamente en chat IA de cursos)

---

## Módulos del panel

| Módulo | ID | Descripción |
|---|---|---|
| Alertas | `pg-alertas` | Dashboard principal con KPIs |
| Tareas | `pg-tareas` | Kanban de tareas del equipo |
| Reuniones | `pg-reuniones` | Gestión de reuniones |
| Comunicaciones | `pg-comunicaciones` | RRSS, métricas, agente IA, videos |
| Cursos | `pg-cursos` | Gestión de cursos de simulación |
| Alumnos | `pg-alumnos` | Base de alumnos |
| Proveedores | `pg-proveedores` | Proveedores externos |
| Instructores | `pg-instructores` | Equipo de instructores |
| Inventario | `pg-inventario` | Control de stock |
| Calendario | `pg-calendario` | Calendario unificado |
| Gráficos | `pg-graficos` | Analytics y reportes |
| Cash Flow | `pg-cashflow` | Finanzas: resumen, préstamos, cobranzas, inversiones, conciliación bancaria, caja |
| Sueldos | `pg-sueldos` | Gestión de honorarios |
| Impuestos | `pg-impuestos` | IVA, IIBB, autónomos, ganancias |
| Comprobantes | `pg-comprobantes` | Facturas de proveedores |
| Cuentas Corrientes | `pg-cuentas` | Cuentas de proveedores |
| Notificaciones | `pg-notif` | Preferencias de notificaciones + 2FA TOTP |
| Usuarios | `pg-usuarios` | Gestión de roles |
| Rutinas | `pg-rutinas` | Tareas recurrentes |
| Oportunidades | `pg-oportunidades` | Intake de oportunidades: Mario carga ideas, Amparo procesa con estados PEV |

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `admin` | Todo |
| `comunicaciones` | Tareas propias + Comunicaciones + Cursos + Calendario (solo cursos) + Notificaciones |
| `instructor` | Tareas propias + Cursos + Calendario (solo cursos) + Alumnos + Notificaciones |
| `logistica` | Tareas propias + Comprobantes (solo propios) + Cuentas + Notificaciones |
| `proveedor` | Portal externo propio |

**Implementación:** CSS classes en `body` (`rol-comunicaciones`, `rol-instructor`, `rol-logistica`). Los nav items tienen clases `comu-visible`, `inst-visible`, `logi-visible`.

**Página inicial por rol** (función `enterPanel`): admin→alertas, comunicaciones→comunicaciones, instructor→cursos, logistica→comprobantes.

---

## Edge Functions

| Función | Descripción |
|---|---|
| `agente-comunicaciones` | Agente IA para RRSS: analiza métricas, valida captions, genera prompts de video, busca tendencias (Tavily API) |
| `agente-financiero` | Agente IA financiero: lee todas las tablas de CF y responde preguntas |
| `agente-cursos` | Agente IA para gestión de cursos (reglas calendario, feriados 2026) |
| `agente-tareas` | Agente IA para gestión de tareas |
| `agente-ejecutivo` | Agente ejecutivo general |
| `agente-mensajes` | Bot 24/7 para Instagram DM / Facebook Messenger / WhatsApp: responde con Claude Haiku, escala al equipo, ignora autorespuestas, lee reglas aprobadas de `agente_mejoras` |
| `agente-oportunidades` | Agente IA analista de oportunidades con contexto multi-dominio |
| `analizar-feedback` | Lee feedback semanal de `mensajes_publico` con comentario, genera reglas con Claude y las guarda en `agente_mejoras` como pendientes |
| `sync-instagram` | Sincroniza posts de Instagram (@metanoiasmx) y Facebook (Metanoiasme.ok, ID: 478694861999786) con Supabase |
| `sync-linkedin` | Sincroniza posts de LinkedIn (org ID: 105737703) — **pendiente aprobación Community Management API** |
| `iniciar-reunion` | Inicia reunión con agente IA (AssemblyAI transcripción) |
| `verificar-reunion` | Verifica estado de reunión y analiza con Claude |
| `leer-factura` | Lee facturas con visión de Claude |
| `whatsapp-agente` | Carga de facturas por WhatsApp via Twilio (flujo conversacional multi-paso) |
| `enviar-diplomas` | Envío automático de diplomas por email (SMTP) al finalizar curso |
| `agente-promociones` | Busca promociones de medios de pago (Viumi, Payway, Banco Macro, Mercado Pago, ICBC) con Tavily + Claude, semanal via pg_cron, requiere aprobación manual antes de contar como vigente |

**Secrets de Supabase:**
- `ANTHROPIC_API_KEY` — Claude API
- `META_ACCESS_TOKEN` — Instagram (@metanoiasmx, ID: 17841470857318268)
- `META_FB_PAGE_TOKEN` — Facebook Page (Metanoiasme.ok, ID: 478694861999786) — **token permanente via Usuario del Sistema** (ver nota técnica #1)
- `META_APP_SECRET` — para verificación firma webhook `X-Hub-Signature-256`
- `META_WH_VERIFY_TOKEN` — token verificación webhook Meta (agente-mensajes)
- `META_WA_TOKEN` — WhatsApp Business API token
- `WA_PHONE_NUMBER_ID` — ID del número de WhatsApp Business
- `WA_AMPARO`, `WA_VALENTINA`, `WA_DANI`, `WA_FLOR` — números WA del equipo para escalación
- `TAVILY_API_KEY` — búsqueda web para agente comunicaciones (reutilizado también por `agente-promociones`)
- `CRON_SECRET` — autentica llamadas programadas (pg_cron) a edge functions sin sesión de usuario (`check-alertas-pagos`, `agente-promociones`)
- `LINKEDIN_ACCESS_TOKEN` — LinkedIn OAuth token (app "Panel Metanoia", vence cada 2 meses)
- `GROQ_API_KEY` — transcripción de audio (Whisper) en agente-mensajes
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — integración WhatsApp via Twilio (whatsapp-agente)
- `ASSEMBLYAI_API_KEY` — transcripción de reuniones

---

## Tablas principales de Supabase

### Core
- `usuarios` — equipo interno (id, nombre, email, rol, activo)
- `tareas` — kanban (nombre, status, prioridad, assignees[], fecha_vencimiento, categoria)
- `notificaciones` — bell notifications (usuario_id, tipo, mensaje, leida, tarea_id)
- `notificaciones_config` — preferencias por usuario

### Cursos
- `cursos` — (nombre, estado, fecha_inicio, fecha_fin, arancel, cupos_max, certificado, etc.)
- `curso_tareas` — checklist de tareas por curso
- `curso_costos` — ítems de costo por curso
- `inscripciones` — alumnos inscriptos (alumno_id, curso_id, estado, monto, cuotas)
- `alumnos` — base de alumnos (nombre, apellido, dni, email, institucion)
- `instructores` — equipo instructores
- `plantillas_curso` — templates de cursos

### Finanzas
- `cf_conceptos` — conceptos del cash flow
- `cf_valores` — valores proyectados/reales por período
- `cf_prestamos` — préstamos activos
- `cf_cobranzas` — cobranzas/cheques
- `cf_inversiones` — inversiones
- `cf_inversiones_movimientos` — movimientos de inversiones
- `cf_empleados` — empleados/honorarios
- `cf_pagos_empleados` — pagos realizados
- `rendimientos_diarios` — rendimientos diarios de inversiones
- `inflacion_mensual` — inflación mensual
- `banco_movimientos` — movimientos del Banco Macro para conciliación (sociedad, fecha, concepto, importe, saldo, conciliado, match_*)
- `caja_movimientos` — movimientos diarios de caja (sociedad, fecha, tipo, concepto, categoria, monto, observaciones)
- `promociones_pago` — promociones de medios de pago (fuente, título, descuento/cuotas, vigencia, estado pendiente/aprobada/rechazada)
- `comprobantes_compra` — facturas de proveedores (cargado_por, proveedor, total, fecha, sociedad, estado)
- `cuenta_corriente` — cuentas corrientes de proveedores

### Comunicaciones
- `publicaciones` — posts de RRSS (plataforma, tipo, fecha_publicacion, likes, alcance, guardados, comentarios, ig_media_id)
- `videos_ia` — videos generados con IA
- `mensajes_publico` — conversaciones del agente de mensajes (plataforma, from_id, from_name, mensaje, respuesta, estado, feedback, feedback_comentario, escalado, motivo_escalado, wa_message_id)
- `agente_mejoras` — reglas aprobadas/pendientes/rechazadas para el agente de mensajes (regla, motivo, estado, feedback_count)

### Oportunidades
- `oportunidades` — intake de oportunidades con 12 campos PEV (idea_cruda, definicion, linea_negocio, ejecutor, estado, fit_estrategico, etc.)

### Otros
- `proveedores` — proveedores externos
- `inventario` — control de stock
- `reuniones` — reuniones del equipo (transcripcion, transcripcion_diarizada, resumen, decisiones, tareas_extraidas, assembly_job_id)
- `rutinas` — tareas recurrentes
- `wpp_sesiones` — sesiones activas de carga de facturas por WhatsApp (telefono, tipo, paso, datos)
- `panel_errores` — errores del panel logueados automáticamente por `sb()` (modulo, path, mensaje, pagina_activa)

---

## Patrones de código importantes

### Llamadas a Supabase
```javascript
// GET
const data = await sb("tabla?select=*&order=created_at.desc");

// POST
const [created] = await sb("tabla", {method:"POST", body: JSON.stringify(obj)});

// PATCH
await sb(`tabla?id=eq.${id}`, {method:"PATCH", body: JSON.stringify(updates)});

// DELETE
await sb(`tabla?id=eq.${id}`, {method:"DELETE"});
```

### Navegación entre páginas
```javascript
goPage('nombre_pagina', document.getElementById('nav-nombre_pagina'));
```

### Toast notifications
```javascript
toast("Mensaje", "ok");  // verde
toast("Mensaje", "err"); // rojo
toast("Mensaje", "inf"); // info
```

### Modales
```javascript
openModal("modal-id");
closeModal("modal-id");
```

### Deploy
```bash
# Todo se hace con git push - GitHub Pages sirve automáticamente
git add index.html
git commit -m "descripción"
git push
# Edge functions se deployán desde Supabase dashboard (Code tab)
```

---

## Equipo

- **Tomás Larran** (tlarran@metanoiasmx.com) — Admin/desarrollador
- **Mario Larran** (mlarran@metanoiasmx.com) — Admin, relaciones y cursos
- **Valentina** (vlarran@metanoiasmx.com) — Admin, redes sociales
- **Amparo** (avirasoro@metanoiasmx.com) — Admin
- **Flor** (florencia.i.bustamante@gmail.com) — Comunicaciones
- **Dani** (danielaspostigo@gmail.com) — Comunicaciones
- **Octavio Marquez** (octavio.marquez@getdarwin.ai) — Comunicaciones (Darwin AI)
- **Derlin** (derlinjmuas@gmail.com) — Instructor

---

## Estrategia y modelo de negocio (Documento Base v4)

### Estructura legal
- **SUDES S.A.S.** (fundada 19/10/2020, Salta) → Proyecto Metanoia SMX → COFRADIA EMC
- HQ: España 1440 (propiedad Colmedsa, comodato acoplado al convenio — perder uno = perder el otro)

### Misión aprobada
Formar profesionales de salud via simulación médica con rigor académico certificable, construyendo autoridad académica regional + negocio sostenible (ninguna fuente de ingresos > 40% del total).

### 4 Líneas de negocio
| Línea | Descripción | Estado |
|---|---|---|
| **A — MSP Convenio** | $80M/mes contrato gobierno (ancla, genera dependencia) | Activo — firmar 1/7/2026 |
| **B — Colmedsa** | Sin pago directo; da espacio, certificación y legitimidad | Activo hasta 16/12/2029 |
| **C — Cursos** | Cursos comerciales (motor real de autonomía) | Escalar a 4 cursos/mes en 2027 |
| **D — COFRADIA** | Comunidad de suscripción médica (3 capas, 5 planes: Free → Expert) | En desarrollo |

### Metodología PEV (Kaizen-PDCA)
PEV1 → PEV2 → PEV3 → aprobación plenaria. Solo PROTOTIPO/APROBADO puede comercializarse.

### Roles
| Rol | Función |
|---|---|
| **Mario** | Visión y originación de oportunidades |
| **Amparo** | Puente humano: decodifica a Mario, coordina ejecución |
| **Tomás** | Puente sistemas: procesos, herramientas, APIs |
| **Valentina** | Coordinación de instructores |
| **Director Médico** | Autoridad clínica/editorial (independiente) |

### Flujo operativo
Mario (ideas crudas) → Amparo (decodifica con Plantilla Intake) → Ejecución / Tomás (sistematiza)
- Sync semanal 30min coordinado por Amparo
- Revisión mensual vs targets por línea de negocio

### Plantilla Intake de oportunidades
12 campos para filtrar ideas antes de llegar al equipo ejecutor:
idea cruda → definición concreta → línea de negocio → a quién sirve → fit estratégico → primer paso testeable → ejecutor → recursos/costo → criterio de éxito → riesgos → estado → metadata

### Modelo financiero (4 años, pesos constantes TC $1.450)
- Dependencia MSP: 76% Año1 → 62% Año2 → 52% Año3 → 50% Año4 (objetivo <40%)
- **COFRADIA sola no alcanza autonomía** — escalar cursos (Línea C) es el driver real
- Con 4 cursos/mes desde 2027: dependencia MSP baja a ~23% Año4
- **Dato crítico pendiente:** costo real de entrega MSP (hoy 50% placeholder — AUREN debe confirmar)

### Instrumentos legales clave
- Acta constitutiva SUDES S.A.S.
- Convenio Colmedsa (hasta 16/12/2029)
- Comodato España 1440 (acoplado al convenio — riesgo crítico)
- Decreto 447
- Contrato MSP (a firmar 1/7/2026)

### Riesgos principales
1. Pagador estatal único con horizonte contractual corto
2. Costo real MSP desconocido (mueve la rentabilidad más que cualquier otro factor)
3. Dependencia del par Mario+Amparo
4. Tomás como segundo cuello de botella (sistemas + procesos + admin)

---

## Pendientes / Roadmap

### Pendiente de decisión (esperando reunión con Auren)
- [ ] **Rol `contable` de solo lectura** — propuesta armada el 1 Oct 2026 (ver `resumen_auren.html` / artefacto "Automatizaciones Auren") para ofrecerle a Auren acceso directo al panel en vez de mandarles archivos por mail: solo lectura a Comprobantes, Cuentas Corrientes, Impuestos (incl. calendario Auren) y Libro Diario/Plan de Cuentas; sin acceso a Cursos/Alumnos/Comunicaciones ni a ninguna acción de carga/edición. Mismo mecanismo que `instructor`/`logistica` (clase CSS + rol en `usuarios`). **Diferido a propósito** hasta la próxima reunión con Auren — confirmar con ellos si les sirve este acceso antes de construirlo, y de paso consultarles qué formato de archivos necesitan (Libro IVA ARCA, padrón de retenciones, numeración estilo Tango) — preguntas completas en el resumen.

### Plan priorizado de lo que falta (armado el 2 Oct 2026)

**A. Urgente / con fecha**
1. **Certificado MiPyME de SUDES vence el 31/10/2026** — renovarlo y subir el nuevo en Cash Flow → 🗂 Resúmenes (la alerta del dashboard ya avisa). Consultar a Estela si el 100% de la ley 25.413 se prorratea por la vigencia desde el 08/08 (agosto 1–7 quedó fuera).
2. **Correr una línea de SQL:** `ALTER TABLE datos_fiscales_sociedad ADD COLUMN IF NOT EXISTS mipyme_archivo_path text;` y re-subir el PDF del certificado.
3. **Correr 🔄 Generar históricos** (Impuestos → Libro Diario): genera 9 cuotas de préstamo jul–sep y las 2 facturas de POINTERS pagadas con Visa. Revisar a mano las 16 cuotas viejas del "Plan de cuotas de tu préstamo" (1–16) marcadas pagadas sin fecha de pago.
4. **Importar extractos jul/ago/sep de SUDES y POINTERS** (los hace Tomás) y mandar los conceptos que no se clasifiquen bien. Después cerrar julio, agosto y septiembre en 🔒 Cierre de mes.
5. **Revisar datos dudosos:** dos retiros de $15.050.000 iguales el 24/07 (posible duplicado), dos depósitos de USD 300 el 03/08 (un solo ingreso real en el extracto), pago de septiembre pendiente de Oscar Farah (SUDES).
6. **Verificar deploys de Supabase que figuran como pendientes** en este archivo: `agente-mensajes` (fechas y fix de NPS `pidiendo_nota` + SQL del estado), las 9 funciones con caching/conteo de tokens (+ SQL de `ia_uso`), `enviar-pago-proveedor` y `enviar-circularizacion`.

**B. Siguiente bloque (en este orden)**
1. **Fase 3 — Ventas e ingresos:** token Sanctum del técnico (`ELEARNING_API_TOKEN`) → SQL `elearning_*` → estado de cuenta en la ficha del alumno → asientos `devengado_venta` / `cobro_venta` por CUIT → control "ingresos" en el cierre de mes (hoy el resultado sale solo con egresos).
2. **Cuenta en dólares:** cuenta contable USD (banco y caja) e importación de esa cuenta del extracto (hoy se lee pero no se importa); incluye el pago de tarjeta en USD.
3. **Reunión con Auren:** rol `contable` de solo lectura, formato de archivos que necesitan (Libro IVA ARCA, padrón de retenciones) y numeración estilo Tango.
4. **Primer cierre completo validado por la contadora** (un mes de punta a punta) antes de depender del panel.

**C. Más adelante**
- Cierre de balance del 30/06/2027 con el módulo actual (la vista del ejercicio ya exporta a Excel).
- Libro IVA digital, facturación electrónica ARCA (CAE) y balance / estado de resultados desde asientos → reemplazo de Finnegans.
- Producto SaaS (multi-organización), biblioteca de PDFs con búsqueda para los agentes, módulo COFRADIA.

**Documento para presentar el sistema:** `resumen_para_presentacion.md` (se le pasa a Claude Chat para armar la presentación).

### Bloqueados por externos
- [ ] LinkedIn sync — esperando aprobación Community Management API (app "Metanoia CMS", enviado 2 Jun 2026)
- [ ] **Meta Business — Human Agent (Instagram DM)** — Revisión del 27 Jul 2026: 3/4 aprobados (`instagram_business_basic`, `manage_messages`, `manage_insights` ✅). `Human Agent` rechazado: Meta no pudo acceder al panel (requiere login — faltaron credenciales de prueba). Para resubmitir: crear usuario rol `comunicaciones` para revisores + instrucciones paso a paso (URL → Login → Comunicaciones → tab Mensajes). Impacto bajo: escalación ya va por WhatsApp. **Diferido.**

### Pendiente de prueba (implementado, validar esta tarde)
- [ ] Integración E-learning + Finnegans — transmisión automática de cursos a plataforma.metanoiasmx.com + facturación vía Finnegans API. Implementado en teoría. Probar a la tarde del 7 Jul 2026.

### Alumnos / Integración Finnegans (próxima prioridad)
- [ ] Interceptar comunicación E-learning ↔ Finnegans — cuando un alumno se inscribe en la plataforma E-learning, Finnegans crea el cliente y gestiona la cuenta contable. El panel debe interceptar ese evento (vía webhook o polling de Finnegans) para capturar el estado de cuenta, factura y recibo. CUIT es el identificador maestro. La comunicación E-learning ↔ Finnegans ya está resuelta; el panel debe sumarse como observador/consumidor de esos eventos.

### Contabilidad y finanzas (baja prioridad)
- [ ] Importador Finnegans — leer archivos exportados de Finnegans (semanal/mensual) y conciliar con comprobantes, cobranzas y caja del panel
- [ ] Resumen mensual ejecutivo — agente IA que lee todos los módulos y genera balance en lenguaje natural (financiero + cursos + comunicaciones)

### Proyecto a largo plazo: reemplazar Finnegans con sistema contable propio
**Decisión (Jul 2026):** construir de a poco un módulo contable dentro del panel con el objetivo de reemplazar Finnegans a futuro. No hacerlo de golpe — cada feature nueva de finanzas debe ir en esa dirección.

**Criterio de diseño:** cada cosa que construyamos en finanzas debe dejar los datos suficientemente estructurados para soportar contabilidad real (doble entrada, plan de cuentas, asientos). No es prioridad inmediata pero es el norte.

**Spec contable completo en:** `plan_modulo_contable_metanoia.md` (generado 16/07/2026 con Claude chat — incluye plan de cuentas SQL, asientos automáticos, cuenta corriente alumnos, parametros impositivos, auditoría de tasas hardcodeadas y estrategia de migración de proveedores).

**ARCA:** AFIP pasó a llamarse ARCA (Agencia de Recaudación y Control Aduanero). Los endpoints de facturación electrónica (CAE), Libro IVA y SICORE corren bajo `arca.gob.ar`.

**Hoja de ruta contable (4 fases, acumulativa):**
1. ✅ `medios_pago` — catálogo de cuentas bancarias y tarjetas por sociedad (Jul 2026)
2. ✅ **Fase 0** — Reporte exportable Excel: facturas pagadas (bruto/neto/retenciones SICORE+IIBB), sueldos, cuotas préstamos, resumen. Botón "📄 Exportar Excel" en Historial de pagos (Jul 2026)
3. ✅ **Fase 1** — `plan_cuentas` (44 cuentas, jerarquía 4 niveles), `parametros_impositivos` (IVA 21/10,5/27%, SICORE 029/031). Implementado y poblado desde 17/07/2026 — **este roadmap no lo reflejaba, ver sección "Auditoría módulo contable (21 Sep 2026)" para el detalle completo y los bugs encontrados/corregidos**. Pendiente real: `proveedor_id`/CUIT/condición fiscal en `proveedores` (sección 8 del spec) — eso sí sigue sin hacerse.
4. ✅ **Fase 2** — Asientos automáticos doble entrada (`asientos_contables` + `asientos_movimientos`), disparados al revisar comprobante (devengado) y al pagar (OP o pago directo). Implementado desde 17/07/2026, mismo caso que arriba — ver auditoría del 21 Sep 2026. 110 asientos generados a la fecha, todos balanceados.
5. [ ] **Fase 3** — `cuenta_corriente_alumnos` + importador Finnegans (cruce por CUIT). Conecta inscripciones con facturación real.
6. [ ] **Fase 4** — Libro IVA ARCA, balance/estado de resultados desde asientos, reemplazo Finnegans (bloqueado por facturación electrónica CAE).

**Bloqueantes antes de reemplazar Finnegans:**
- Facturación electrónica ARCA (CAE) — requiere integración web services
- Libro IVA digital en formato legal
- Validación con contador externo (al menos un cierre mensual completo con el sistema nuevo)

### Convertir el panel en producto SaaS vendible (visión, surgida en congreso, 10 Sep 2026)
- [ ] Empezar a preparar el panel para venderlo como plataforma a terceros (otras instituciones/centros de simulación) — suscripciones, gestión de usuarios por organización. Ya existe una base de multi-tenancy arrancada (`organizaciones`, `organizacion_id` en `usuarios` y `agente_cursos_chats`, ver sección "Implementado 3 Sep 2026 — Multi-tenancy foundation") pero falta:
  - Definir el modelo comercial (planes, precios, qué incluye cada uno)
  - Extender `organizacion_id` a las tablas que todavía no lo tienen (cursos, alumnos, instructores, finanzas, etc.) y todas las policies RLS filtrando por organización, no solo por `authenticated`
  - Onboarding de una organización nueva (alta de org + admin inicial)
- [x] **Análisis de costo de tokens de IA por organización/curso** — arrancado 11 Sep 2026: logging real de tokens por función (`ia_uso`, ver sección "Implementado (11 Sep 2026) — Logging de uso de IA"). Falta el análisis con datos reales (recién arranca a acumular desde el deploy) y decidir el modelo de precios; ver `estrategia_comercial_claude.md` para el marco de la conversación.

### Producto (baja prioridad)
- [ ] Módulo COFRADIA — gestión de planes, suscriptores y contenido (Línea D)
- [ ] Agentes cloud autónomos para automatizaciones (gstack instalado en `~/.claude/skills/gstack/`)

### Cancelado
- ~~Darwin integration~~ — reemplazado por respuesta manual desde el panel (tab Mensajes)
- ~~Importador masivo Excel → Supabase + Finnegans~~ — reemplazado por interceptación directa de eventos E-learning ↔ Finnegans
- ~~Palmier Pro / edición de video~~ — lo gestiona Flor directamente

## Implementado (4 Jun 2026)
- ✅ Sistema de diplomas: Canvas + envío automático por email (SMTP) al finalizar curso
- ✅ Modo claro/oscuro con toggle en topbar (guarda preferencia en localStorage)
- ✅ Búsqueda de alumnos al agregar inscripto (dropdown filtrable)
- ✅ Alertas de tokens API (META_FB_PAGE_TOKEN, META_ACCESS_TOKEN, LINKEDIN_ACCESS_TOKEN) — badge en topbar + alertas en dashboard
- ✅ Tabla `tokens_api` en Supabase para trackear vencimientos
- ✅ Tab "Resumen semanal" en Cash Flow con posición de caja, movimientos, cobranzas, préstamos e inversiones
- ✅ Script CLI `resumen_cashflow.py` instalado en `~/.claude/skills/cashflow/`
- ✅ Script `cashflow.ps1` en carpeta Metanoia para uso rápido en PowerShell
- ✅ Skill de emails institucionales instalado en `~/.claude/skills/emails/`
- ✅ CLAUDE.md actualizado con estrategia, modelo de negocio y roles (Documento Base v4)

## Implementado (9 Jun 2026)
- ✅ Fix login: cada rol redirige a su página inicial accesible (instructor→cursos, logistica→comprobantes)
- ✅ Dropdown "Cambiar estado" en cursos con los 6 estados y badge de color
- ✅ Soporte .docx en chat IA de cursos (mammoth.js extrae texto en browser, edge function lo procesa)
- ✅ agente-cursos: reglas de calendario (feriados 2026, fines de semana, superposición de cursos)
- ✅ agente-cursos: resumen compacto de cursos para ahorrar tokens
- ✅ Facebook sync funcionando con token permanente via Usuario del Sistema en Meta Business Suite
- ✅ sync-instagram: alcance Instagram funcionando (reach,saved); Facebook trae likes+comentarios sin insights

## Implementado (Jun 2026) — Finanzas, Oportunidades, Reuniones
- ✅ Cotizador PEV — bloques de costo por actividad, PDF con secciones, vinculación a cursos, lista de cards
- ✅ Módulo Intake de Oportunidades — 12 campos PEV, estados, agente IA analista con contexto multi-dominio
- ✅ Agente reuniones — transcripción con AssemblyAI, análisis con Claude, vinculación a oportunidades
- ✅ Dashboard de autonomía MSP — KPI dependencia por línea de negocio en tiempo real
- ✅ Gráficos Cash Flow — evolución de caja e ingresos/egresos con Chart.js
- ✅ Conciliación bancaria POINTERS — filtro sociedad en inscripciones + texto extracto bancario genérico
- ✅ Impuestos — etapa "presentado no pagado" en IVA/IIBB + botón Pagar en Autónomos
- ✅ Logging de errores — `sb()` loguea errores automáticamente a `panel_errores` + skill `/panel-debugger`
- ✅ Tab Mensajes en Comunicaciones — historial WhatsApp/IG/FB agrupado por conversación, burbujas, feedback 👍/👎

## Implementado (22 Jun 2026) — Seguridad
- ✅ RLS habilitado en 21 tablas + políticas `{public}` eliminadas (solo `authenticated` puede leer/escribir)
- ✅ XSS sanitizado en módulo mensajes externos (Instagram/FB/WA) — todos los campos de usuario externo pasan por `esc()`
- ✅ XSS sanitizado en módulos tareas, cursos, rutinas, oportunidades, cotizaciones
- ✅ JWT validation en 11 Edge Functions (todas excepto webhooks Meta/Twilio)
- ✅ CORS restringido de `*` a `https://tomaslarran.github.io` en todas las Edge Functions
- ✅ Frontend usa `authToken` (JWT de sesión del usuario) en lugar de anon key al llamar Edge Functions
- ✅ Valores hardcodeados en agente-mensajes (números WA, VERIFY_TOKEN) movidos a Supabase Secrets
- ✅ Verificación de firma webhook Meta (`X-Hub-Signature-256`) en agente-mensajes
- ✅ Verificación de firma webhook Twilio (`X-Twilio-Signature`) en whatsapp-agente
- ✅ Backup mensual automatizado (`backup_mensual.ps1`) programado el día 20 de cada mes a las 9AM

## Implementado (25 Jun 2026) — Alumnos, Cierre mensual, Agente cursos
- ✅ Cierre mensual asistido — Edge Function `cierre-mensual` con checklist de 7 áreas + análisis IA (Claude Haiku); botón "Cerrar mes" en Cash Flow
- ✅ agente-cursos: incorpora Código de Ética y Marco de Buenas Prácticas como referencia normativa (PEARLS, OSATS, Kirkpatrick, conflicto de interés, consentimiento grabación)
- ✅ Limpieza periodo de prueba — alumnos e inscripciones borradas (SQL: DELETE FROM inscripciones; DELETE FROM alumnos)
- ✅ Campo `cuit` en tabla `alumnos` — obligatorio, identificador maestro para integración Finnegans + e-learning
- ✅ Plantilla Excel importación alumnos — 9 columnas (nombre*, apellido*, dni*, cuit*, email, telefono, matricula, especialidad, institucion); DNI y CUIT formateados como texto
- ✅ CUIT en modal, búsqueda y filtros del módulo Alumnos
- ✅ check-alertas-pagos acepta CRON_SECRET como autenticación alternativa (para llamadas programadas sin sesión de usuario)

## Implementado (29 Jun 2026) — Cursos y fixes
- ✅ `linea_negocio` en cursos — 4 categorías: MSP/Convenio, Colmedsa, Comercial, EMC/Gratuito; badge de color en cards, select en modal de creación y en panel de detalle inline, filtro por línea en grilla
- ✅ Estado "Educación médica continua" en cursos — badge teal + dropdown "Cambiar estado" + fix constraint `cursos_estado_check`
- ✅ Fix "Cambiar estado" botón desaparecía — selector `:not([id^='estado-dd-wrap-'])` para no ocultar el wrapper
- ✅ Fix dark dropdowns — `color-scheme: dark/light` en `.sel`, `.mini-sel`, `.fs` (light mode compatible)
- ✅ Cards cursos clickeables — navegan a filtro correspondiente al clickear stat card
- ✅ Sort cursos — selector Fecha/Estado/Nombre/Inscriptos encima de la grilla
- ✅ Fix Benchmark vs Inflación vacío — `getCapActivo` redefinido en scope de `renderBenchmark`
- ✅ Fix `leer-factura` model error — hardcodeado `claude-sonnet-4-6` (eliminada detección dinámica que elegía claude-fable-5)
- ✅ Fix `leer-factura` + `analizarConIA` + `apAnalizar` Unauthorized — usar `authToken||KEY` en lugar de anon key hardcodeada
- ✅ Edge Function `eliminar-usuario` — elimina usuario de Supabase Auth + tabla `usuarios`, solo admins, con guard de auto-eliminación (deployada)
- ✅ Botón "Eliminar" en módulo Usuarios — llama a `eliminar-usuario` con confirmación

**SQL pendiente (correr en Supabase SQL editor):**
```sql
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS linea_negocio text
  CHECK (linea_negocio IN ('MSP / Convenio','Colmedsa','Comercial','EMC / Gratuito'));
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS cuit text;
-- Fix constraint estado cursos:
ALTER TABLE cursos DROP CONSTRAINT IF EXISTS cursos_estado_check;
ALTER TABLE cursos ADD CONSTRAINT cursos_estado_check CHECK (estado IN ('Borrador','Convocatoria','Inscripciones','En curso','Educación médica continua','Completado','Cancelado'));
```

## Implementado (5 Jul 2026) — Archivos de cursos, cola de video, system prompts, planes plataforma

### Tab Archivos en Cursos
- ✅ Tab "📁 Archivos" en detalle de curso — visible para instructores (`cd-tab-archivos`)
- ✅ Bucket Supabase Storage `curso-archivos` + tabla `curso_archivos` (tipo, nombre, storage_path, size_bytes, generado_ia)
- ✅ Upload de archivos por tipo (programa, examen, presentacion, pdf, otro) con validación 45MB
- ✅ Videos van a YouTube: si supera 45MB el bot sugiere subir a YouTube y pegar el link
- ✅ Links de YouTube almacenados directamente en `storage_path`
- ✅ Auto-guardado de PDFs y PPTs generados por IA al curso correspondiente
- ✅ Auto-apertura del tab Archivos al crear un curso desde IA

### Cola de edición de video
- ✅ Sección "🎬 Cola de edición" dentro del tab Archivos
- ✅ Modal para solicitar edición: nombre, URL del video (opcional), instrucciones en lenguaje natural
- ✅ Tabla `video_cola` con estado machine: pendiente → transcribiendo → con_spec → en_edicion → listo
- ✅ Edge Function `procesar-video`: transcripción con AssemblyAI + spec técnica con Claude Haiku
- ✅ Admin puede gestionar cola, generar spec, marcar como listo y agregar el video final al curso

### System prompts — framework 6 bloques
- ✅ `agente-mensajes`: reescritura completa con ROL/CONTEXTO/INSTRUCCIÓN/FORMATO/RESTRICCIONES/EJEMPLOS
- ✅ `agente-mensajes`: FAQ ampliado con info de Darwin AI (tecnología, especialidades, modalidades, quiénes pueden participar)
- ✅ `agente-mensajes`: 5 ejemplos de conversación reales (consulta inicial, cursos, planes, autorespuesta, escalación)
- ✅ `agente-cursos`: ROL y CONTEXTO explícitos al inicio, RESTRICCIONES unificadas, EJEMPLOS de intake guiado

### Planes plataforma
- ✅ Tabla `plataforma_planes` en Supabase — nombre, descripcion, precio_mensual, precio_anual, sin_costo, requisito, activo, orden
- ✅ 5 planes cargados: Médico COLMEDSA, Médico Externo, Residente MSP, PEMCS, Personal No Médico
- ✅ `agente-mensajes` lee los planes dinámicamente en cada request — precios actualizables sin redeploy
- ✅ Módulo `pg-planes` en el panel (nav Cursos → Planes plataforma): CRUD de planes con modal, toggle sin costo

## Implementado (5 Ago 2026) — Programa MSP: integración en agentes IA

- ✅ `agente-cursos`: constante `PROGRAMA_MSP` con contenido operativo completo del convenio MSP Salta — estaciones E1–E7 con instrumentos (OSATS/GOALS/FLS/checklists), fases A–D con fechas y supervisión UNT/SASIM, instructores (Juárez Muas + Parraga como vanguardia, 32 certificándose), distribución por institución, segmentación Ola 1/Ola 2/Incorporados, mapeo de familias de entrenamiento, pendientes priorizados, reglas de evaluación formativa. Modo "PROGRAMA MSP" añadido como modo 2 de operación.
- ✅ `agente-mensajes` (WA/IG/FB): sección "Programa MSP Salta" con descripción del programa, 7 estaciones, cronograma de fases y regla de escalación para residentes que consulten por horarios o avance.
- Fuente: `files_mario/manual de operaciones/Metanoia_SMX_Documento_Unico_Consolidado.docx` (5/8/2026)

**Pendientes operativos del programa MSP (no técnicos):**
- Ajustar columna "Horas objetivo" de la planilla `Metanoia_Planilla_Registro_Seguimientos_PSR.xlsx` de 48 h → 24 h (período vigente; 48 h es horizonte de renovación)
- Incorporar Codimg (checklists digitales) durante agosto para trazabilidad desde el arranque
- Formar instructores en métricas quirúrgicas GOALS/FLS/OSATS (habilitador crítico de E2)
- Confirmar sensores vía aérea (E3) y transductor lineal ecógrafo (E4)

## Implementado (27 Ago 2026) — Competency Tracker + Debriefing PEARLS + NPS post-curso

### Competency Tracker
- ✅ Tab **"📊 Evaluar"** en detalle de curso — selector de instrumento, pill-buttons 1–N por ítem, total dinámico con color según aprobación, textarea de observaciones, botón "Guardar evaluación"
- ✅ Sección **evaluaciones en modal Alumno** — sparkline SVG de evolución de porcentaje + historial cronológico con score y %
- ✅ **Panel gestión de instrumentos** en Usuarios (admin-only): activar/desactivar, eliminar personalizados, crear nuevos con ítems dinámicos y escala configurable
- ✅ 4 instrumentos estándar precargados: **OSATS, GOALS, Mini-CEX, DOPS** (ítems y escala completos en BD)
- ✅ Tablas `instrumentos_evaluacion` + `evaluaciones_alumno` en Supabase con RLS

### Debriefing PEARLS
- ✅ Tab **"📝 Debriefing"** en detalle de curso — lista de debriefings con dots de color indicando secciones completadas
- ✅ Formulario con **6 secciones acordeón**: Partnership / Empathy / Acknowledgment / Reflection / Learning / Supporting
- ✅ Cada sección: guías de preguntas para el instructor + textarea libre de notas
- ✅ Vista de detalle inline + **export Word** (.doc) con estructura por secciones
- ✅ Tabla `debriefings` en Supabase con RLS

### NPS post-curso
- ✅ Tab **"⭐ NPS"** en detalle de curso — NPS score grande con color (verde ≥50, amarillo 0-49, rojo <0)
- ✅ Barra horizontal proporcional Promotores (9-10) / Pasivos (7-8) / Detractores (≤6)
- ✅ Registro manual por alumno inscripto + entrada anónima adicional
- ✅ Tabla `nps_respuestas` en Supabase con RLS
- ✅ Compatible con futura integración WhatsApp (cuando se apruebe el template Meta `nps_post_curso`)

### NPS WhatsApp (integración completa)
- ✅ Edge function `enviar-nps-wpp` — envía template `nps_post_curso` a inscriptos con teléfono (normalización automática formato argentino), registra en `nps_envios`
- ✅ `agente-mensajes` actualizado — detecta respuesta numérica 0-10 de un número con envío pendiente, guarda en `nps_respuestas` (`canal='whatsapp'`), marca `nps_envios.estado='respondido'`, responde con agradecimiento. No pasa a Claude.
- ✅ Tabla `nps_envios` — seguimiento de encuestas enviadas (telefono, wa_message_id, estado: enviado/respondido/fallido)
- ✅ Template Meta `nps_post_curso` — **aprobada** (estado "Activa" en WhatsApp Manager desde el 28/08/2026, idioma **"Spanish" genérico, código `es`** — no `es_AR`).

**✅ Fix (10 Sep 2026):** el envío fallaba con error Meta `#132001 Template name does not exist in the translation` — la edge function pedía la plantilla en idioma `es_AR` pero en WhatsApp Manager quedó aprobada como `es` (Spanish genérico, no Spanish ARG). Corregido `language.code` en `enviar-nps-wpp` de `es_AR` → `es` y deployado. Probado end-to-end: envío funcionando. De paso se mejoró el frontend (`enviarNPSWhatsApp` en `index.html`) para mostrar el error real de Meta en el toast en vez de solo loguearlo en consola — útil si aparece un error parecido en otra plantilla a futuro.

**SQL corrido (Supabase):** `instrumentos_evaluacion`, `evaluaciones_alumno`, `debriefings`, `nps_respuestas`, `nps_envios` + 4 INSERT instrumentos estándar

**⚠️ Corrección (10 Sep 2026):** pese a lo anotado arriba, la tabla `debriefings` en realidad **nunca había quedado creada** en la base — el tab Debriefing de un curso tiraba `PGRST205: Could not find the table 'public.debriefings'`. Se re-creó vía SQL Editor (columnas `curso_id`, `titulo`, `fecha`, `instructor`, `duracion_min`, `escenario_desc`, `observaciones_generales`, `pearls_p/e/a/r/l/s`, RLS `authenticated`) y quedó funcionando. Verificado en producción (10 Sep 2026) que `instrumentos_evaluacion`, `evaluaciones_alumno`, `nps_respuestas` y `nps_envios` sí existen y funcionan (tabs Evaluar y NPS probados sin errores) — el problema fue exclusivo de `debriefings`.

## Implementado (27 Ago 2026) — Agente cursos: Excel, guardar/retomar chats, escenarios clínicos proyectables

- ✅ **Leer Excel en chat IA** — soporte `.xlsx`/`.xls` en `adjuntarArchivoCursoIA`: carga xlsx.js dinámicamente, convierte cada hoja a CSV y lo envía como texto plano al agente
- ✅ **Guardar/retomar chats** — botones 💾 Guardar y 📂 Retomar en modal IA cursos; tabla `agente_cursos_chats` en Supabase; auto-save silencioso en cada respuesta; eliminar desde lista
- ✅ **Escenarios clínicos proyectables** — modo 5 en `agente-cursos` edge function: genera `<ESCENARIO_JSON>` estructurado; frontend parsea y muestra card compacto (urgencia, signos vitales, botón 🖥 Proyectar)
- ✅ **Proyector fullscreen** — modal oscuro con signos vitales grandes (monitor style), presentación clínica, hallazgos, antecedentes, preguntas para el grupo; codificado por urgencia (roja/amarilla/verde)
- ✅ **Audio sintético Web Audio API** — heartbeat normal/S3 galope/soplo sistólico, sibilancias, crepitantes; master gain + slider de volumen en card y proyector; toggle play/stop
- ✅ **Escenarios persistidos en historial** — campo `escenario` en entrada assistant del historial; `cargarChatCurso` reconstruye las cards al retomar; `_cursoEscenarios` se limpia en reset/carga

**SQL corrido:**
```sql
CREATE TABLE IF NOT EXISTS agente_cursos_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  historial jsonb DEFAULT '[]',
  archivos_meta jsonb DEFAULT '[]',
  usuario text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agente_cursos_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON agente_cursos_chats FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Deploy realizado:** `agente-cursos` (modo 5 escenarios + programa MSP)

**Pendiente — Sonidos reales (Opción A, a implementar cuando haya archivos):**
- Bucket Supabase Storage `auscultacion` (público)
- Subir 5-6 archivos `.mp3`: corazón normal, S3 galope, soplo sistólico, sibilancias, crepitantes
- Reemplazar síntesis Web Audio por `fetch + decodeAudioData + loop` en `_toggleSonidoEsc`
- Fuente sugerida: PhysioNet.org (licencia abierta) o grabaciones propias con estetoscopio digital

## Implementado (24 Ago 2026) — VEPs + Exportación NC Finnegans + Mobile fixes

- ✅ **Tab VEPs** en módulo Impuestos — lista de VEPs pendientes/pagados, upload PDF, extracción IA automática con Claude visión
- ✅ `leer-factura` edge function: soporte `tipo=vep` — prompt ARCA especializado para extraer tipo_impuesto, periodo, fecha_vencimiento, monto, sociedad
- ✅ Calendario: VEPs pendientes aparecen bajo filtro Finanzas con dot naranja/rojo según urgencia
- ✅ Dashboard alertas: VEPs vencidos o próximos (≤30 días) se suman a alertas de impuestos
- ✅ Botón **"💳 OP"** desde VEP — pre-carga modal de Orden de Pago en CF con datos del VEP
- ✅ Marcar VEP como pagado / eliminar
- ✅ Exportación NC Finnegans — botón "Exportar XLS" en Comprobantes convertido a dropdown: **Facturas** (comportamiento anterior) / **Notas de crédito** (nuevo); archivo `notas_credito_finnegans_FECHA.xls`
- ✅ Mobile fixes — scroll horizontal en todas las tablas JS-generadas (caja, historial, historial pagos, cuotas préstamos, sueldos pendientes, ap-tabla-cuotas)

**SQL corrido (31 Ago 2026):**
```sql
-- Tabla VEPs
CREATE TABLE IF NOT EXISTS impuestos_vep (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text,
  tipo_impuesto text NOT NULL,
  periodo text,
  fecha_vencimiento date NOT NULL,
  monto numeric NOT NULL,
  numero_vep text,
  estado text DEFAULT 'pendiente',
  fecha_pago date,
  observaciones text,
  storage_path text,
  cargado_por text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE impuestos_vep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON impuestos_vep FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Storage creado (31 Ago 2026):**
- ✅ Bucket: `impuestos-vep` → Public

**Deploy realizado (31 Ago 2026) — Supabase Dashboard → Edge Functions:**
- ✅ `leer-factura` — deployado con soporte tipo=vep
- ✅ `agente-mensajes` — deployado con programa MSP Salta

## Implementado (24 Jul 2026) — Caja: cambio de moneda, historial, transferencias inter-sociedad

- ✅ Transferencias entre cuentas (caja, banco, inversiones) con trazabilidad — referencia "Desde → Hacia" en `observaciones`, campo `moneda` en `caja_movimientos`
- ✅ 4 cajas independientes: ARS/USD × SUDES/POINTERS — selector de sociedad y moneda en toggle buttons; cada combinación tiene su propia vista y KPIs
- ✅ Tipo **"💱 Cambio de moneda"** en formulario de caja — selecciona cuenta origen ARS (caja o banco) y cuenta destino USD, ingresa monto ARS + cotización (ARS/USD), calcula monto USD automáticamente. Crea egreso ARS + ingreso USD en una sola operación. Observaciones registran la tasa usada.
- ✅ **Historial de caja** — botón "📋 Historial" en la barra de controles. Modal con filtros: sociedad, moneda, fecha desde/hasta (default: mes actual). Resumen de ingresos/egresos/balance neto por sociedad+moneda. Tabla completa paginable. Botón "📥 Exportar Excel" genera `.xlsx` con todos los campos.
- ✅ Auto-crear cuenta contable al agregar medio de pago — `autoCrearCuentaContable()` busca el padre correcto en `plan_cuentas` por tipo (activo/pasivo) y genera el siguiente código. PATCH al medio con `cuenta_contable_id`.
- ✅ Cambiar contraseña desde topbar — dropdown usuario → 🔑 Cambiar contraseña → modal con validación, llama a `PUT /auth/v1/user` con el JWT del usuario.
- ✅ Fix OP modal — `abrirOrdenPago` es async y lazy-carga `medios_pago` si no fueron cargados (cuando se abre CF sin visitar la tab Cuentas primero).

**SQL corrido (31 Ago 2026):**
```sql
ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'ARS';
ALTER TABLE medios_pago ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES plan_cuentas(id);
```

## Implementado (16 Jul 2026) — Finanzas: KPIs, cierre balance, historial integrado, reporte contable

- ✅ Historial de pagos integrado como sub-tab dentro de "Pendientes de pago" — eliminado tab separado. Muestra facturas pagadas con retenciones Ganancias/IIBB desglosadas, cuotas con capital+intereses, sueldos. `ordenes_pago` se carga en `loadCF`.
- ✅ 6 bugs de KPIs corregidos: `saldo_pendiente` → `saldo_actual`, filtros cobranzas case-sensitive (`"cobrado"` → `"Pendiente"`), `fecha_vencimiento` inexistente en cuotas proyección caja → `fecha`, inversiones filtradas solo activas, sueldos variables excluidos del badge pendiente.
- ✅ Estado `cerrado` en `comprobantes_compra` — facturas pre-30/06/2026 (198 registros vía SQL). No aparecen en Pendientes, alertas ni calendario. Badge gris "🗂 Cierre balance". Sin botones Pagar/OP.
- ✅ Tab Caja unificado dentro de "🏦 Cuentas & Caja" — sub-tabs: "💳 Cuentas y tarjetas" / "💵 Caja". Tab bar con un tab menos.
- ✅ **Fase 0 contable** — Reporte exportable Excel (4 hojas: Facturas pagadas, Sueldos, Cuotas préstamos, Resumen con totales y retenciones SICORE+IIBB practicadas). Respeta filtros de sociedad y mes activos. Botón en sub-tab Historial.
- ✅ CLAUDE.md actualizado con spec contable completo (`plan_modulo_contable_metanoia.md`), roadmap 4 fases y nota ARCA.

## Implementado (3 Sep 2026) — Colaboración de chats + Mensajería interna + Multi-tenancy foundation

- ✅ **Tab "💬 Mensajes"** en pg-instructores — tab bar "👥 Instructores" | "💬 Mensajes (N)" con badge de no leídos
- ✅ **Mensajería interna** — conversaciones entre usuarios del panel (panel izquierdo con lista, panel derecho con burbujas), notificación automática al destinatario
- ✅ **Colaboración de chats IA** — botón "👥 Invitar" en modal agente-cursos; al guardar un chat el dueño puede invitar a colaboradores; lista de chats muestra sección "COMPARTIDOS CONMIGO" con badge "compartido"
- ✅ **Privacy de chats** — `listarChatsCurso()` filtra por `user_id` del usuario logueado (con fallback por email)
- ✅ **`_updateChatLabel()`** actualizado para mostrar/ocultar botón Invitar según si hay chat guardado
- ✅ **Multi-tenancy foundation** — tablas nuevas incluyen `organizacion_id`; `guardarChatCurso()` persiste `user_id` y `organizacion_id`; arquitectura lista para escalar a FASGO/SASIM
- ✅ **Tipos de notif nuevos** — `colaboracion_chat` (👥) y `mensaje_interno` (💬) en `tipoNotifLabel` / `tipoNotifIcon`; `clickNotif()` navega al chat o a mensajes según tipo
- ✅ **pg-mensajes como página standalone** — eliminado de pg-instructores, movido a ítem propio en sidebar visible para todos los roles (comu/inst/logi); badge de no leídos actualizado cada 60s
- ✅ **Búsqueda en modal de invitación** — input de búsqueda con auto-focus que filtra usuarios en tiempo real por nombre
- ✅ **Aceptar/rechazar desde notificaciones** — botones ✅/❌ en el panel de notificaciones para invitaciones de colaboración; meta del chat guardado en `bellNotifs` y recuperado por ID (evita problemas de serialización JSON en onclick attrs)
- ✅ **Aceptar/rechazar desde listado de chats** — sección "INVITACIONES PENDIENTES" en modal de chats con botones inline
- ✅ **Nombre de usuario sobre burbujas** — en chat IA de cursos, el nombre del usuario aparece en gris pequeño encima de cada burbuja enviada (tiempo real y al retomar chats guardados); historial persiste campo `nombre` por mensaje
- ✅ **Ideas en colaboración en Borradores** — `loadColabIdeasSection()` muestra cards con borde punteado morado en filtro Borradores de Cursos para cada chat colaborativo aceptado; click abre el chat directo
- ✅ sw.js v42 → v44

**SQL a correr en Supabase (3 Sep 2026):**
```sql
-- Multi-tenancy: tabla de organizaciones
CREATE TABLE IF NOT EXISTS organizaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  slug text UNIQUE,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE organizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON organizaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO organizaciones (nombre, slug) VALUES ('Metanoia SMX', 'metanoia-smx') ON CONFLICT (slug) DO NOTHING;

-- Agregar organizacion_id a usuarios (para multi-tenancy futuro)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS organizacion_id uuid REFERENCES organizaciones(id);

-- Agregar user_id y organizacion_id a chats (para privacidad y multi-tenancy)
ALTER TABLE agente_cursos_chats ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES usuarios(id);
ALTER TABLE agente_cursos_chats ADD COLUMN IF NOT EXISTS organizacion_id uuid REFERENCES organizaciones(id);

-- Tabla colaboradores de chat
CREATE TABLE IF NOT EXISTS chat_colaboradores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES agente_cursos_chats(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invitado_por uuid REFERENCES usuarios(id),
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptado','rechazado')),
  organizacion_id uuid REFERENCES organizaciones(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, usuario_id)
);
ALTER TABLE chat_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON chat_colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla mensajes internos entre usuarios del panel
CREATE TABLE IF NOT EXISTS mensajes_internos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  from_nombre text NOT NULL,
  to_user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  to_nombre text NOT NULL,
  contenido text NOT NULL,
  leido boolean DEFAULT false,
  organizacion_id uuid REFERENCES organizaciones(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE mensajes_internos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON mensajes_internos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agregar campo meta a notificaciones (para datos extras como chatId)
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS meta jsonb;
```

**Deploy realizado (3 Sep 2026):** `git push` — solo frontend.

## Implementado (3 Sep 2026) — Agente mensajes: fixes, promo anual, imágenes en panel

### agente-mensajes (edge function)
- ✅ **Descripción de curso ampliada** — campo ampliado a 1200 chars; agente lee descripción completa para responder preguntas de fecha, arancel, formato sin pedir datos al usuario
- ✅ **REGLA GLOBAL promo** — hasta el 31/10/2026 suscripción anual SIN CARGO; bot lo menciona proactivamente en conversaciones sobre cursos/precios
- ✅ **REGLA respuesta directa** — responde con info del curso disponible sin pedir datos de contacto primero
- ✅ **Fix escalación CRÍTICO** — al recibir datos del usuario (nombre/email/tel), retorna `{"escalar":true,...}` directo sin confirmar en texto; ejemplos explícitos en system prompt
- ✅ **Link wa.me en notificación** — notificación al equipo incluye `https://wa.me/NUMERO` del cliente para contactar directo desde el celular
- ✅ **Imágenes en Storage** — imagen de cliente (WA/IG/FB) se sube al bucket `mensajes-media` (público) y URL guardada en `imagen_url` de `mensajes_publico`

### Panel — Tab Chats (antes "Mensajes")
- ✅ **Renombrado Mensajes → Chats** — sidebar y tab interno de Comunicaciones
- ✅ **Sección "💬 En proceso"** — conversaciones donde bot respondió pero no cerradas/escaladas
- ✅ **Fix Terminados** — solo muestra `estado = 'cerrado'` explícito
- ✅ **Detección histórica de escalados** — por frases en respuesta del bot para clasificar conversaciones viejas sin flag
- ✅ **Botón "📤 Escalar" manual** — en sección En proceso
- ✅ **Visualización de imágenes** — miniatura dentro de burbuja del cliente si `imagen_url` existe
- ✅ **Préstamos finalizados colapsables** — en CF, sin cuotas pendientes van a sección plegada

### Eliminado
- ✅ Exportación Pixelio eliminada de Cursos, Alumnos e Instructores (botones + funciones JS)

**SQL corrido (3 Sep 2026):**
```sql
ALTER TABLE mensajes_publico ADD COLUMN IF NOT EXISTS imagen_url text;
```

**Storage creado (3 Sep 2026):** Bucket `mensajes-media` → Public

**Deploy realizado (3 Sep 2026):** `agente-mensajes` deployado + `index.html` vía `git push`

---

## En desarrollo (7 Sep 2026) — Integración E-learning bidireccional

**Plataforma e-learning:** https://plataforma.metanoiasmx.com — Laravel + Livewire + Flux, desarrollada por técnico externo con acceso al código.

**Arquitectura:** Panel ↔ e-learning bidireccional vía API REST (Sanctum) + webhook de inscripciones en tiempo real.

**Spec para el técnico Laravel:** `spec_api_elearning_laravel.md` — 5 endpoints + webhook + variables de entorno.

**Edge Function `sync-elearning`** creada en `supabase/functions/sync-elearning/index.ts`:
- `action=sync_cursos` — trae cursos de e-learning → `elearning_cursos`
- `action=sync_inscripciones` — trae inscripciones → `elearning_inscripciones`
- `action=sync_all` — ambas en una sola llamada
- `action=publish_curso` — envía un curso del panel → e-learning (POST /api/cursos)
- `source=webhook&action=webhook_inscripcion` — recibe notificación de nueva inscripción en tiempo real (sin JWT, con X-Webhook-Secret)

**Secrets a agregar en Supabase:**
- `ELEARNING_URL` = `https://plataforma.metanoiasmx.com`
- `ELEARNING_API_TOKEN` = personal access token de Sanctum (el técnico lo genera)
- `ELEARNING_WEBHOOK_SECRET` = secreto compartido para validar webhooks (acordar con el técnico)

**SQL a correr en Supabase:**
```sql
-- Tabla espejo de cursos del e-learning
CREATE TABLE IF NOT EXISTS elearning_cursos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  elearning_id text UNIQUE NOT NULL,
  nombre text,
  descripcion text,
  estado text,
  fecha_inicio date,
  fecha_fin date,
  cupos_max int,
  cupos_inscriptos int DEFAULT 0,
  precio numeric,
  panel_curso_id uuid REFERENCES cursos(id),
  raw jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_cursos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla espejo de inscripciones del e-learning
CREATE TABLE IF NOT EXISTS elearning_inscripciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  elearning_id text UNIQUE NOT NULL,
  elearning_curso_id text,
  alumno_nombre text,
  alumno_email text,
  alumno_cuit text,
  alumno_telefono text,
  fecha_inscripcion timestamptz,
  estado text DEFAULT 'inscripto',
  monto_pagado numeric,
  raw jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_inscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_inscripciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Log de sincronizaciones
CREATE TABLE IF NOT EXISTS elearning_sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text,
  registros_synced int DEFAULT 0,
  errores int DEFAULT 0,
  detalle text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Pendiente:**
- [ ] Técnico Laravel implementa los 5 endpoints + webhook (entregar `spec_api_elearning_laravel.md`)
- [ ] Correr SQL en Supabase
- [ ] Deployar `sync-elearning` en Supabase Dashboard
- [ ] Agregar secrets `ELEARNING_URL`, `ELEARNING_API_TOKEN`, `ELEARNING_WEBHOOK_SECRET`
- [x] **Pantalla "E-learning" en el panel** (2 Oct 2026, menú Cursos → E-learning, solo admin): botón 🔄 Sincronizar ahora (`sync_all`, con pistas si falla el token o la ruta), estado de la última sincronización y último evento recibido, KPIs, y pestañas Resumen · Pagos y facturas · Suscripciones · Clientes · Cursos · Inscripciones · Eventos. El resumen lista: facturas con error, pagos pendientes con contacto (seguimiento), registrados que no pagaron (con botón *Copiar mails*) y suscripciones por vencer en 30 días. Sin datos muestra la guía de conexión. Probada en vacío contra la base real y con datos simulados. **Falta probar con datos reales** cuando el técnico entregue el token (el 2 Oct las 7 tablas `elearning_*` existen pero están vacías).
- [ ] Botón "Publicar en e-learning" en detalle de curso del panel
- [ ] `agente-mensajes` lee `elearning_cursos` para responder preguntas de fechas/cupos/precios en tiempo real

### Estado de cuenta de clientes vía e-learning (29 Sep 2026)

**Contexto:** reunión con Agustín (técnico de la plataforma). La plataforma ya trae el plugin de Finnegans (credenciales configuradas, catálogos cargados, factura automática al aprobar pago). Decisiones: se agrega `condicion_fiscal` al registro de alumnos → **Factura A solo a responsables inscriptos, B al resto**; Viumi se suma como medio de pago alternativo a MercadoPago; Agustín prueba en sandbox si "provincia de destino" es obligatoria. Tomás quedó en completar la spec de la API con el módulo de estado de cuenta.

- ✅ `spec_api_elearning_laravel.md` sección 6 — eventos al panel por el mismo webhook (`action: "webhook_evento"`): `cliente.creado/actualizado`, `pago.aprobado/rechazado`, `factura.emitida/error`, `suscripcion.por_vencer` (7 días antes)/`vencida`/`renovada`. Idempotencia por `evento.id`, reintentos con backoff, endpoint `GET /api/alumnos/{cuit}/estado-cuenta` para reconciliar, `GET /api/eventos` opcional
- ✅ `sync-elearning` — procesa `webhook_evento`: upsert en `elearning_clientes` (por CUIT normalizado a 11 dígitos), `elearning_pagos` (pago + factura en la misma fila), `elearning_suscripciones`; log en `elearning_eventos`. Suscripción por vencer/vencida y factura con error → notificación de campanita a todos los admins activos
- 🐛 **Fix seguridad:** el webhook nunca validaba `X-Webhook-Secret` — cualquiera con la URL podía cargar inscripciones. Ahora compara contra `ELEARNING_WEBHOOK_SECRET` (comparación en tiempo constante, falla cerrado si el secret no está cargado) y las acciones `webhook_*` solo se aceptan por webhook y las de sync solo desde el panel con JWT
- ✅ Tipos de notificación nuevos en `tipoNotifLabel`/`tipoNotifIcon`
- ✅ **Ficha completa del registro del campus** (pedido de Tomás: que el panel quede con los mismos datos que la plataforma): `nombre_completo`, email, DNI/cédula, CUIT, matrícula, profesión y documentos legales aceptados (versión + fecha, evidencia de consentimiento). La spec le pide a Agustín **sumar al formulario**: `condicion_fiscal`, `tipo_persona` (+ `razon_social` para empresas/laboratorios), `provincia` (completa "provincia de destino" de la factura) y `telefono` (no aparece en el formulario actual — necesario para seguimiento por WhatsApp)
- ✅ `elearning_clientes.alumno_id` se vincula solo si ya existe un alumno en el panel con ese CUIT (con o sin guiones). **No crea alumnos nuevos** en `alumnos`: la plataforma manda "nombre completo" en un solo campo y `alumnos` exige nombre y apellido por separado — partirlo automático falla con apellidos compuestos. Decidir más adelante si se pide a Agustín separar los campos o se crea el alumno a mano desde la ficha
- ✅ Evento `pago.pendiente` (orden de pago creada sin pagar) — mismo `pago_id` que el aprobado que lo resuelve; un pendiente que llega tarde por reintento no pisa un pago ya aprobado. Base para el seguimiento de "se registraron y no pagaron" (casos reales de la reunión: Agostina Sarmiento, Giovanna Massaglia, Nicolás Pérez)
- ✅ Avisos de vencimiento **agrupados por fecha** — la promo "Nivel 11 sin cargo" vence para todos el 30/10/2026, así que el 23/10 llegarían decenas de `suscripcion.por_vencer` juntos. En vez de una notificación por alumno, se mantiene una sola por fecha (en `notificaciones.meta.clave`) y se actualiza el texto con el conteo ("N suscripciones vencen el 30/10")
- Del resto de la reunión (fuera del alcance del panel): Agustín prueba en sandbox si "provincia de destino" es obligatoria en Finnegans, evalúa Viumi (3-6 cuotas sin interés con Macro, acredita directo en la cuenta Macro), hace el botón de actualizar cursos sin duplicar (el panel ya actualiza por `elearning_id`), y revisa Wix para dejar solo el registro del dominio

**SQL pendiente (correr junto con el SQL de arriba de `elearning_*`):**
```sql
CREATE TABLE IF NOT EXISTS elearning_eventos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id text UNIQUE NOT NULL,
  tipo text NOT NULL,
  alumno_cuit text,
  ocurrido_en timestamptz,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS elearning_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cuit text UNIQUE NOT NULL,
  elearning_alumno_id text,
  nombre_completo text, email text, dni text, telefono text,
  matricula text, profesion text,
  condicion_fiscal text,            -- responsable_inscripto | monotributista | exento | consumidor_final
  tipo_persona text,                -- fisica | juridica
  razon_social text,
  provincia text,
  documentos_aceptados jsonb,       -- [{documento, version, aceptado_en}] evidencia de consentimiento
  registrado_en timestamptz,
  finnegans_cliente_codigo text,
  alumno_id uuid REFERENCES alumnos(id),
  raw jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS elearning_pagos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id text UNIQUE NOT NULL,
  cuit text,
  concepto text, elearning_curso_id text, suscripcion_id text,
  monto numeric, moneda text DEFAULT 'ARS', medio_pago text, referencia_externa text,
  fecha_pago timestamptz, estado text,
  factura_estado text, factura_tipo text, factura_punto_venta text, factura_numero text, factura_fecha date,
  factura_neto numeric, factura_iva numeric, factura_total numeric,
  cae text, cae_vencimiento date, finnegans_comprobante_id text, factura_pdf_url text, factura_error text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS elearning_suscripciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  suscripcion_id text UNIQUE NOT NULL,
  cuit text,
  plan text, periodicidad text, monto numeric,
  fecha_inicio date, fecha_vencimiento date,
  renovacion_automatica boolean,
  estado text,
  aviso_por_vencer_en timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE elearning_suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON elearning_suscripciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Pendiente:**
- [x] Spec v2 lista para mandar a Agustín (29 Sep 2026); el secret va por WhatsApp
- [x] Secrets `ELEARNING_WEBHOOK_SECRET` y `ELEARNING_URL` cargados, `sync-elearning` deployada (29 Sep 2026)
- [x] Secret `ELEARNING_API_TOKEN` cargado (5 Oct 2026) — "🔄 Sincronizar ahora" funciona: trajo 6 cursos y 17 inscripciones. Las rutas `/api/cursos`, `/api/inscripciones`, `/api/alumnos`, `/api/eventos` existen (401 sin token)
- [x] SQL de las 7 tablas `elearning_*` corrido (29 Sep 2026); `sync-elearning` con "Verify JWT" desactivado en el dashboard (necesario para que el webhook de Laravel llegue a la función)
- [ ] Primer evento real del webhook — al 5 Oct 2026 todavía no llegó ninguno: **no hubo ningún pago todavía** (las 17 inscripciones son registros sin cobro). Cuando entre el primer pago, revisar la pestaña Eventos de Cursos → E-learning
- [ ] Vista en el panel: estado de cuenta en la ficha del alumno (pagos, facturas, suscripción) + listado de suscripciones por vencer + listado de pagos pendientes para seguimiento
- [ ] Mail de seguimiento a los que se registraron y no pagaron (Agostina Sarmiento, Giovanna Massaglia, Nicolás Pérez y otros) — tarea de Tomás de la reunión del 29/09
- [ ] Mensaje automático de renovación (WhatsApp template o email) al recibir `suscripcion.por_vencer` — hoy solo avisa al equipo por campanita
- [ ] Cruce `elearning_clientes.alumno_id` ↔ `alumnos` por CUIT (base de la Fase 3 contable: `devengado_venta`/`cobro_venta`)

---

## Implementado (23 Jun 2026) — Agente mensajes y mejoras continuas
- ✅ agente-mensajes: bot 24/7 para IG DM / FB Messenger / WhatsApp — Claude Haiku, escalación al equipo vía WA, transcripción de audio con Groq/Whisper, visión para imágenes
- ✅ agente-mensajes: detecta y descarta respuestas automáticas (`{"ignorar":true}`), manejo de etiquetas/shares, tono mejorado
- ✅ Feedback con comentario en mensajes — campo `feedback_comentario` en `mensajes_publico`, textarea inline
- ✅ Sistema de mejoras del agente — Edge Function `analizar-feedback` analiza feedback semanal con Claude, propone reglas, equipo aprueba/rechaza en tab Agente IA, reglas aprobadas se inyectan en el system prompt
- ✅ 2FA TOTP en Notificaciones — enroll/verify/unenroll via Supabase Auth MFA API, QR con qrcode-generator

---

## Implementado (7 Sep 2026) — Audio en agente de cursos, mobile, tareas multi-día, permisos

### Agente de cursos — audio
- ✅ Botón 🎤 en el chat "Crear curso con IA" — graba audio con MediaRecorder y lo transcribe
- ✅ Edge Function `transcribir-audio` — usa AssemblyAI (mismo proveedor y secret `ASSEMBLYAI_API_KEY` que Reuniones, no depende de Groq)
- ✅ Extracción de nombre de curso más robusta al crear desde IA — si la charla no definió un nombre explícito, el agente infiere uno siguiendo la nomenclatura estándar; fallback al nombre del chat guardado; parseo de JSON tolerante a texto extra
- ✅ Archivos adjuntados durante la charla con el agente se suben automáticamente a la tab Archivos del curso al crearlo (bucket `curso-archivos`)
- ✅ Wording: agente de cursos ya no usa "comercializarse/comercialización" — usa "implementarse/implementación"

### Mobile
- ✅ Modal de detalle de reunión — fila de botones (PDF/Word/Agregar audio/Re-analizar/Eliminar) hace wrap en vez de desbordar la pantalla
- ✅ Mensajes internos — en mobile se muestra una pantalla a la vez (lista o conversación) con botón "←" para volver, en vez de layout de 2 columnas fijas

### Tareas
- ✅ Campo `fecha_inicio` en tareas — permite que una tarea abarque varios días (ej. un congreso). Se edita en el modal de creación y en la tarjeta expandida. En el Kanban se muestra como rango "dd/mm → dd/mm"; en Calendario aparece un evento de inicio además del de vencimiento
- ✅ Filtro "solo mis tareas" (antes solo `instructor`/`logistica`) ahora también aplica a `comunicaciones`, según el cuadro de roles de este documento

### Permisos — Cursos para instructores
- ✅ El módulo Cursos filtra la grilla y los KPIs para el rol `instructor`: solo ve cursos donde está asignado en `curso_instructores` (match por `instructores.email` = email de su usuario) o donde su nombre coincide con el campo legado `instructor_nombre`
- ⚠️ **Es un filtro de frontend, no una política RLS** — las tablas `cursos`/`curso_instructores` siguen con policy `{authenticated} USING (true)`, por lo que un instructor que inspeccione las llamadas REST podría seguir leyendo cursos ajenos. Si se necesita un límite real a nivel de datos, hay que sumar una policy RLS específica para el rol instructor (pendiente, requiere decidir cómo exponer el rol al motor de RLS — hoy el rol vive en la tabla `usuarios`, no en un claim de JWT).
- ⚠️ **Riesgo de datos:** si el registro del instructor en la tabla `instructores` no tiene cargado el mismo email que su usuario de login, o el curso no está vinculado ni por `curso_instructores` ni por `instructor_nombre`, ese instructor va a ver la grilla de Cursos vacía. Antes de dar por cerrado este punto, verificar/completar el email en Instructores y los vínculos en `curso_instructores` para Derlin (único instructor activo al momento de este cambio).

**SQL corrido.** **Deploy realizado (15 Sep 2026):** `transcribir-audio` y `agente-cursos` (wording + extracción de nombre) deployados.

---

## Implementado (8 Sep 2026) — Diploma: coordenadas, fecha, y firma digital de instructores

### Fixes de layout (arrastraban desde que se actualizó diploma-fondo.png)
- ✅ Recalculadas a mano todas las coordenadas de texto del diploma (nombre, DNI, curso, instructor, fecha) contra el fondo actual — antes quedaban superpuestas con las etiquetas del molde
- ✅ Unificado el generador de impresión (botón "Generar diploma") con el de email — antes tenía su propio layout en mm, desincronizado
- ✅ Nombre del alumno e instructor: `textBaseline` cambiado de `middle` a `alphabetic` — antes la línea en blanco atravesaba el texto por el medio en vez de quedar como un renglón normal
- ✅ Fecha del certificado: ahora usa `fecha_fin` del curso (o `fecha_inicio` si no hay fin) en vez de la fecha del día en que se genera/envía el diploma — función `fechaCertificadoCurso(curso)`

### Firma de Mario (CEO)
- ✅ `firma-mario.png` — firma procesada desde una foto (fondo de papel eliminado con máscara de alpha por diferencia de luminosidad local + limpieza de ruido por componentes conexas, tinta coloreada para matchear el resto del texto)
- ✅ Se dibuja apoyada sobre la línea de firma derecha, con "MARIO LARRÁN – CEO METANOIA" debajo

### Firma digital de instructores ("Mi firma")
- ✅ Botón **"🖊️ Mi firma"** en el dropdown del usuario (topbar) — visible solo para roles `instructor` y `admin`
- ✅ Modal con **pad de firma** (canvas + eventos pointer, dibuja con mouse/dedo) + opción de subir una imagen en su lugar
- ✅ Al guardar: sube la firma a Storage (`firmas-instructores/<instructor_id>.png`, upsert) y actualiza `instructores.firma_url`. Matchea al instructor por email (mismo criterio que el filtro de Cursos para el rol instructor)
- ✅ La firma se dibuja automáticamente en el diploma (línea izquierda, con "{NOMBRE} – INSTRUCTOR" debajo) cuando se genera o envía el certificado — se trae el `firma_url` en las 3 funciones de diploma (`generarCertificado`, `enviarDiplomaEmail`, `enviarTodosLosDiplomas`) vía el join `curso_instructores→instructores`
- ✅ Si el instructor no cargó firma todavía, el diploma sigue funcionando igual — solo queda el renglón en blanco con su nombre debajo, sin romper nada

Todo validado con Playwright (renderizando el canvas real contra el fondo real) antes de subir, en varios escenarios: con firma de instructor, sin firma de instructor, título de curso a 1 y 2 líneas.

**SQL corrido** (`instructores.firma_url`). **Storage:** bucket `firmas-instructores` creado como Public.

---

## Implementado (8 Sep 2026) — Perfil unificado + fix fecha diploma + Dr./Dra.

### Botón "👤 Mi Perfil"
- ✅ Unifica en un solo modal (`modal-perfil`, 4 tabs) lo que antes eran 2 modales sueltos (Cambiar contraseña, Mi firma) + agrega edición de datos personales y preferencias
- ✅ Tabs: **Datos** (nombre, teléfono, y si es instructor: especialidad/matrícula/institución/género) · **🖊️ Firma** (mismo pad de firma de antes) · **🔑 Seguridad** (cambio de contraseña + 2FA, mismo flujo de antes) · **⚙️ Preferencias** (tema claro/oscuro, acceso directo a Notificaciones)
- ✅ `abrirPerfil()` precarga los datos del usuario logueado y de su ficha de instructor (si existe, por email); `guardarPerfilDatos()` hace PATCH a `usuarios` y, si corresponde, a `instructores`
- ✅ Reemplazadas las 2 entradas del dropdown del topbar por una sola: "👤 Mi Perfil"

### Fix fecha del diploma
- ✅ La fecha larga en español ("08 de septiembre de 2026") se salía del margen derecho de la página en algunos casos — ahora tiene auto-ajuste de tamaño de fuente igual que el título del curso

### Dr. / Dra. en el diploma según género del instructor
- ✅ Nuevo campo **Género** en la ficha de instructor (modal Instructores y tab Datos de Mi Perfil) — Masculino/Femenino/Sin especificar
- ✅ Si está cargado, el diploma antepone automáticamente "Dr." o "Dra." al nombre del instructor (línea "dictada por" y línea de firma) en las 3 funciones de diploma

**SQL corrido** (`instructores.genero`).

**Fix RLS bucket `firmas-instructores` (8 Sep 2026):** marcar el bucket como Public solo habilita lectura pública — hacía falta política explícita para que un `authenticated` pueda subir/actualizar su firma (daba `403 new row violates row-level security policy`):
```sql
CREATE POLICY "Autenticados pueden subir firmas" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firmas-instructores');

CREATE POLICY "Autenticados pueden actualizar firmas" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'firmas-instructores');
```

**⚠️ Bug de plataforma sin resolver (9 Sep 2026) — uploads directos del navegador a Storage rechazados por RLS pese a policy y JWT correctos:** con Derlin (instructor) el upload de la firma seguía dando `403/400 "new row violates row-level security policy"` incluso después de: confirmar por SQL (`pg_policies`) que las policies de `firmas-instructores` son correctas y sin restrictivas en conflicto, agregar el header `apikey`, y verificar el JWT del usuario decodificado (`role: "authenticated"`, `aud: "authenticated"`, no vencido). Es decir: policy bien, token bien, y aun así falla — algo en cómo el servicio de Storage de este proyecto resuelve el rol no está funcionando como debería. **No investigar más por ese lado sin soporte de Supabase.**

**Workaround aplicado:** subir la firma vía Edge Function `subir-firma-instructor` (usa `service_role`, que no depende de esa RLS) en vez de `fetch()` directo del navegador a `/storage/v1/object/...`. Mismo patrón de JWT validation que el resto de las funciones.

**Riesgo:** los demás uploads directos a Storage desde el frontend (`curso-archivos`, `Facturas`, `impuestos-vep`, `oportunidades`) usan el mismo mecanismo roto y podrían fallar igual en cualquier momento para cualquier usuario no-admin. Si aparece el mismo error en esos módulos, aplicar el mismo workaround (Edge Function + service_role) en vez de perder tiempo con las policies.

**Deploy realizado (15 Sep 2026):** `subir-firma-instructor` deployada.

---

## Implementado (9 Sep 2026) — Agente de cursos: panel de progreso del proyecto

**Motivación:** el chat de "Crear curso con IA" ya genera el contenido y arma el curso completo (no es un simple auxiliar), pero al vivir como un chat genérico sin indicador de avance, el equipo no lo estaba tomando en serio como herramienta de trabajo. Se rediseñó el modal para que se sienta como el espacio donde se arma el proyecto del curso, no una conversación descartable.

- ✅ Modal renombrado "✨ Crear curso con IA" → **"🎓 Proyecto de curso — Asistente IA"**, ensanchado a `max-width:920px` con layout de dos columnas: chat a la izquierda, panel **"📋 Proyecto del curso"** fijo a la derecha
- ✅ Panel de progreso muestra en vivo los 10 bloques (A→J) de la Plantilla de Diseño Guiado ya existente en `agente-cursos` (necesidad educativa, destinatarios, objetivos, nivel/modalidad, recursos, estructura, evaluación, consideraciones especiales, ética/datos, ruta PEV) — cada uno con ⚪ pendiente / 🟡 en curso / ✅ completo + resumen de una línea con el dato confirmado
- ✅ Edge function `agente-cursos`: nueva sección "7. PROGRESO DEL PROYECTO" en el system prompt — durante el modo INTAKE GUIADO, el agente emite `<PROGRESO_JSON>` en cada respuesta (acumulativo) con el estado de los bloques tocados hasta el momento
- ✅ Frontend parsea `<PROGRESO_JSON>` igual que `<ESCENARIO_JSON>`/`<DOCUMENTO_JSON>`; el progreso queda guardado por mensaje en `agente_cursos_chats.historial` y se reconstruye al retomar un chat guardado (`cargarChatCurso`)
- ✅ Botón "📋 Progreso" en el header para mostrar/ocultar el panel; en mobile el panel pasa a overlay a pantalla completa con su propio botón de cierre (sin depender del ancho de ventana para volver al chat)
- ✅ Probado con Playwright contra el archivo real (bypaseando el login solo para inspección visual, sin credenciales): layout desktop de dos columnas, panel oculto por defecto en mobile, overlay fullscreen y su cierre — todo verificado antes de este commit
- ✅ Backup de `index.html` y `agente-cursos/index.ts` previos al cambio en `backups/pre_rediseno_cursos_ia_20260909/` (también recuperable con `git checkout 094d5dd -- index.html supabase/functions/agente-cursos/index.ts`)

**Deploy realizado (9 Sep 2026):** `agente-cursos` (nueva sección PROGRESO_JSON en el system prompt) — deployado en Supabase Dashboard.

**Pendiente de decisión (no bloqueante):** si el panel de progreso resulta útil en la práctica, evaluar extraerlo de la ficha `ficha_diseno` en vez de un JSON paralelo, y unificar el render de burbujas (hoy sigue duplicado en 3 lugares: `sendCursoIA`, `cargarChatCurso`, mensaje de bienvenida) — no se tocó en este cambio para no ampliar el alcance.

---

## Implementado (9 Sep 2026) — Fix: no se podía cambiar el nombre de un curso ya creado

**Motivación:** el modal de curso (`modal-curso`) solo tenía flujo de creación (`createCurso()`) — no existía ningún `editCurso()` ni forma de hacer PATCH del campo `nombre` una vez creado el curso. Detectado al pedir cambiar el nombre de un curso ya cargado (REPA).

- ✅ Ícono ✎ al lado del título en el detalle de curso (`.cd-title`, `selectCurso()`) — click activa edición inline
- ✅ `renombrarCurso(id)` reemplaza el título por un input pre-cargado con el nombre actual (autoseleccionado) + botones "✓ Guardar" / "Cancelar"; Enter guarda, Escape cancela
- ✅ `guardarNombreCurso(id)` hace `PATCH cursos?id=eq.${id}` con el nombre nuevo, actualiza el array `cursos` en memoria y refresca el detalle + la grilla
- ✅ Probado con Playwright contra el archivo real (sin login): el input aparece con el texto completo seleccionado y los botones funcionan

---

## Implementado (9 Sep 2026) — Diploma: firma en 2 líneas, Coordinador, carga horaria + permisos instructor + aprobación de certificados

### Diploma
- ✅ Nombre y cargo bajo cada firma separados en dos renglones (antes "NOMBRE – CARGO" en una sola línea)
- ✅ "INSTRUCTOR" renombrado a "COORDINADOR"
- ✅ Nueva línea "Carga horaria: X hs cátedra" en el espacio libre junto a "Fecha", usando `cursos.duracion_horas` (se omite si no está cargada)

### Permisos — más tabs de curso visibles para el rol instructor
- ✅ El rol `instructor` ahora también ve las tabs **Instructores y materiales**, **Inscriptos**, **Evaluar**, **Debriefing** y **NPS** del detalle de curso (antes solo veía Información y Archivos) — mismo mecanismo CSS que ya se usaba para desbloquear Archivos/Clases (`body.rol-instructor .cd-tab-adm[onclick*="cd-..."]`). Checklist, Presupuesto y Cotizaciones siguen ocultos (son de gestión interna/admin).
- ⚠️ Sigue siendo un desbloqueo de frontend, no una policy RLS nueva — mismo caveat ya documentado para el filtro de "mis cursos" del rol instructor.

### Aprobación de certificados por el instructor (nuevo)
- ✅ Antes de emitir/enviar diplomas de un curso, si el curso tiene un instructor vinculado (`curso_instructores`) y todavía no aprobó, aparece un banner en la tab Inscriptos: **"⏳ Pendiente de aprobación de {instructor}"** con botón **"✅ Aprobar y firmar certificados"**, visible solo para ese instructor (matcheado por email, mismo criterio que el resto del panel) o un admin
- ✅ Al aprobar, se graban `cursos.certificados_aprobados=true`, `certificados_aprobados_por`, `certificados_aprobados_en`, y recién ahí se habilitan los botones de Imprimir/Enviar/Enviar a todos (antes muestran "🔒 Pendiente")
- ✅ Doble gate: además de ocultar los botones, `generarCertificado`/`enviarDiplomaEmail`/`enviarTodosLosDiplomas` verifican la aprobación del lado del cliente antes de ejecutar (`_certificadosAprobadosOk`) — sigue siendo un chequeo de frontend, no reemplaza una policy RLS
- ✅ Si el curso no tiene instructor vinculado en `curso_instructores`, no aplica el gate (se puede emitir igual, no hay firma de terceros en juego)
- ✅ **Backfill obligatorio en el SQL de abajo:** los cursos ya existentes se marcan como aprobados automáticamente para no bloquear diplomas de cursos ya cerrados/en curso — el gate rige desde ahora en adelante para certificados nuevos

**SQL corrido (9 Sep 2026):**
```sql
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS certificados_aprobados boolean DEFAULT false;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS certificados_aprobados_por text;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS certificados_aprobados_en timestamptz;
-- Backfill: no bloquear cursos que ya venían funcionando antes de este cambio
UPDATE cursos SET certificados_aprobados = true WHERE certificados_aprobados IS NOT true;
```

---

## Implementado (9 Sep 2026) — Agente de promociones de medios de pago

**Motivación:** pedido de Tomás para tener un radar semanal de promociones de tarjetas/bancos (cuotas sin interés, descuentos) para ofrecer a los clientes al cobrar cursos.

**Diseño acordado:** búsqueda web automática (Tavily) + revisión manual antes de que la promo cuente como vigente (mismo patrón que `agente_mejoras` en Comunicaciones) — no se publica nada sin que un admin la apruebe. Frecuencia: semanal.

- ✅ Edge Function `agente-promociones` — busca con Tavily promociones de **Viumi, Payway, Banco Macro, Mercado Pago e ICBC**, le pasa los resultados a Claude Haiku para estructurarlos, borra los pendientes previos (evita acumulación de duplicados semana a semana) y carga los hallazgos nuevos como `estado='pendiente'`
- ✅ Acepta autenticación por JWT de usuario (disparo manual) O por header `x-cron-secret` (disparo programado) — mismo patrón que `check-alertas-pagos`
- ✅ Tabla `promociones_pago` — fuente, título, descripción, % descuento, cuotas sin interés, vigencia, url, estado (pendiente/aprobada/rechazada)
- ✅ Nuevo tab **"🎁 Promociones"** en Cash Flow — sección "⏳ Pendientes de revisión" con botones Aprobar/Rechazar, sección "✅ Vigentes" con las aprobadas, botón "🔄 Buscar ahora" para disparo manual sin esperar al cron
- ✅ Probado con Playwright contra el archivo real (datos simulados, sin backend): layout de dos secciones, botones funcionando

**⚠️ Hallazgo importante durante la implementación:** `check-alertas-pagos` (función existente) tiene el soporte de `CRON_SECRET` en el código pero **nunca tuvo un disparador automático real** — ni pg_cron, ni GitHub Action, ni tarea programada. Hoy solo se ejecuta si alguien aprieta el botón manual del panel. Para que "semanal" sea real acá, se agrega `pg_cron` + `pg_net` (ver SQL abajo) — es la primera vez que este proyecto tiene un cron real corriendo del lado de Supabase.

**Secret agregado en Supabase → Edge Functions → Secrets:**
- `CRON_SECRET` = `8c41426e297656f051a3a69cf07fbab32ff734694890b1fd8533631399940187`
  (ya existe `TAVILY_API_KEY` de agente-comunicaciones, se reutiliza)

**SQL corrido (9 Sep 2026)** — tabla creada, extensiones `pg_cron`/`pg_net` activadas, job `agente-promociones-semanal` registrado (id 5, corre lunes 09:00 hora Salta):
```sql
-- Tabla de promociones
CREATE TABLE IF NOT EXISTS promociones_pago (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fuente text NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  descuento_pct numeric,
  cuotas_sin_interes int,
  vigencia_desde date,
  vigencia_hasta date,
  url_fuente text,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  revisado_por text,
  revisado_en timestamptz,
  raw jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE promociones_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON promociones_pago FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Cron semanal (lunes 09:00 hora Salta = 12:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'agente-promociones-semanal',
  '0 12 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/agente-promociones',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','8c41426e297656f051a3a69cf07fbab32ff734694890b1fd8533631399940187'),
    body := '{}'::jsonb
  );
  $$
);
```
**Deploy realizado (9 Sep 2026):** `agente-promociones` deployado en Supabase Dashboard. Los 3 pasos (SQL + cron, secret, deploy) están completos — el flujo automático semanal ya está activo. Pendiente: probar "🔄 Buscar ahora" en el panel para validar el circuito end-to-end antes de esperar al primer disparo del cron.

**Pendiente de decisión (no bloqueante):** si Viumi/Payway/ICBC no tienen suficiente presencia web indexada, la búsqueda puede volver vacía seguido para esas fuentes — si pasa varias semanas, evaluar si conviene cargar esas promos a mano en vez de por búsqueda.

---

## Implementado (10 Sep 2026) — Simuladores/materiales: auto-detección desde el agente IA + disponibilidad en calendario

**Motivación:** surgido en congreso — el agente de cursos ya menciona qué simulador hace falta durante la charla de diseño, pero eso quedaba solo como texto de conversación; nunca bajaba como ítem real a la tab "Instructores y materiales", y no había forma de ver si ese simulador ya estaba comprometido por otro curso en fechas superpuestas.

### Auto-detección al crear curso con IA
- ✅ El prompt de extracción de `crearCursoDesdeIA()` ahora también pide `materiales_necesarios: []` — simuladores/maniquíes/equipos mencionados en la charla
- ✅ Cada nombre se matchea contra `inventario` (comparación normalizada sin tildes/mayúsculas, mismo criterio que el match de instructor por nombre — `_normTxt`)
- ✅ Si matchea: se guarda en `_cursoIAMaterialesDetectados` y al confirmar el curso (`createCurso()`) se inserta solo en `curso_materiales` (cantidad estimada 1, editable después a mano)
- ✅ Si NO matchea contra ningún ítem del Inventario: aviso `🔧 Mencionaron "X" pero no está en el Inventario` — no bloquea la creación, solo informa
- ✅ Si matchea y hay otro(s) curso(s) en fechas superpuestas usando el mismo ítem: suma las cantidades de todos (este curso + los demás) y compara contra `inventario.stock_actual` — si no alcanza, aviso `❌ no alcanza el stock en estas fechas` con el detalle de cuánto pide cada curso; si alcanza, aviso informativo (no bloqueante) **antes** de crear el curso

### Disponibilidad persistente en "Instructores y materiales"
- ✅ `loadInstMat()` cruza cada material ya asignado al curso contra `curso_materiales` de TODOS los demás cursos (mismo `item_id`) con fechas superpuestas (excluye cursos Cancelados), **sumando** `cantidad_estimada` de todos ellos + la de este curso y comparando el total contra `inventario.stock_actual` — no es un chequeo binario "¿lo usa alguien más?", sino "¿la demanda simultánea supera el stock físico?" (ej: ítem con 3 unidades, un curso pide 3 y otro pide 2 en la misma fecha → `❌ No alcanza el stock: se necesitan 5 pero hay 3`). Si hay superposición pero el stock sí alcanza, el aviso es informativo (ámbar), no de error. Aplica a cualquier curso, no solo a los creados por IA
- ✅ Se muestra también el campo `inventario.observaciones` (si tiene algo cargado) como nota de condición/mantenimiento del equipo debajo del ítem — reutiliza el campo existente en vez de agregar uno nuevo
- ⚠️ No hay campo dedicado de "condición del equipo" en `inventario` — por ahora se resuelve con `observaciones` (texto libre). Si hace falta algo más estructurado (ej. estado operativo/en mantenimiento con opciones fijas), es un paso siguiente, no incluido acá.

**Sin SQL pendiente** — usa columnas y tablas que ya existían (`inventario.observaciones`, `inventario.stock_actual`, `curso_materiales`).

---

## Implementado (11 Sep 2026) — Logging de uso de IA (tokens por función)

**Motivación:** paso previo indispensable para poder vender el panel como SaaS con licencia mensual (ver "Convertir el panel en producto SaaS vendible") — antes de fijar un precio hay que saber cuánto cuesta realmente en tokens de Claude operar el panel. Hasta ahora no había ningún registro de consumo real, solo estimaciones.

- ✅ Tabla `ia_uso` — cada llamada a la API de Claude que ya hace una edge function ahora también inserta una fila con `funcion`, `modelo` (leído en vivo de la respuesta de la API, no hardcodeado, para que no se desactualice si cambia el modelo pedido), `input_tokens`, `output_tokens`
- ✅ Instrumentadas las **9 funciones de mayor volumen**: `agente-cursos`, `agente-mensajes`, `agente-financiero`, `leer-factura`, `agente-comunicaciones`, `verificar-reunion`, `agente-reuniones`, `agente-promociones`, `cierre-mensual`
- ✅ Insert con `await` + `try/catch` silencioso (no bloquea la respuesta al usuario si falla el logging) — se descartó fire-and-forget porque el runtime de Deno no garantiza que una promesa sin awaitear termine de correr después de devuelta la respuesta
- ✅ Las funciones sin cliente `service_role` propio (`leer-factura`, `agente-comunicaciones`) loguean con `supabaseAuth` (JWT del usuario) en vez de `supabase` — funciona por la policy `{authenticated} USING (true) WITH CHECK (true)` ya estándar en el proyecto
- ⏸️ **Deliberadamente sin instrumentar** (bajo volumen, no aportan al análisis de costo por curso/organización): `agente-tareas`, `agente-ejecutivo`, `agente-oportunidades`, `analizar-feedback`, `cofradia-borrador`, `cofradia-clasificar`, `leer-prestamo`, `procesar-video`, `whatsapp-agente`, `agente-plataforma`. Sumar cuando se necesite afinar el análisis.
- ⏸️ **Sin costo en $ calculado al insertar** — se guardan tokens crudos + modelo; la conversión a $ queda para una vista futura con una tabla de precios en JS fácil de actualizar (Sonnet 5 $2/$10 por MTok in/out, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5, Opus 5 $5/$25 — precios de referencia al 11 Sep 2026, la mayoría de las funciones de este proyecto todavía corre en `claude-sonnet-4-6`, no en Sonnet 5)
- 🐛 **Bug preexistente encontrado y corregido de paso:** `agente-comunicaciones` usaba `createClient` sin importarlo — el chequeo de JWT (`const supabaseAuth = createClient(...)`) iba a tirar `ReferenceError` en cada llamada. Se agregó el import. Si el dashboard de Supabase tenía una versión distinta ya deployada (posible, dado el flujo de deploy manual), redeployar con el código actualizado del repo.

**SQL corrido** (tabla `ia_uso`). **Deploy realizado (15 Sep 2026):** las 9 funciones de arriba redeployadas — el logging ya está en efecto.

**Ver también:** `estrategia_comercial_claude.md` en la raíz del repo — documento para llevar a una sesión aparte de Claude chat y trabajar la estrategia de comercialización/pricing del panel como SaaS.

---

## Implementado (11 Sep 2026) — Límites de tokens de IA: aviso, bloqueo duro y pedido de aumento

**Motivación:** pedido explícito de Tomás — no alcanza con medir el consumo de tokens (ver sección anterior), hace falta poder **restringir** cuánto puede gastar cada usuario/organización en IA, para poder contabilizar y cobrar por uso u ofrecer planes más altos cuando se venda el panel como SaaS. Decisión de diseño acordada: avisar al acercarse al límite, bloquear duro al alcanzarlo, y dejar la puerta abierta a "pagar por más" (sin pasarela de pago real todavía — hoy es un admin editando el límite a mano). Granularidad: por organización **y** por usuario, ambos límites independientes.

### Esquema
- `organizaciones.limite_tokens_mensual` (bigint, null = sin límite) + `alerta_pct_tokens` (int, default 80 — a qué % avisar)
- `usuarios.limite_tokens_mensual` (bigint, null = sin tope individual — solo aplica el de la organización)
- `ia_uso.usuario_id` — se agregó desde el arranque de la tabla (ver sección anterior) para poder sumar consumo por usuario, no solo por organización

### Backend — bloqueo duro
- Las mismas 9 edge functions instrumentadas para logging ahora también **chequean el límite antes de llamar a Claude** (`chequearLimiteIA()`, duplicada inline en cada función por la misma razón que el logging: el deploy es copy-paste de un solo archivo, no hay bundler compartido). Suma tokens del mes en curso (`ia_uso` desde el día 1) contra el límite de organización y, si el usuario tiene uno propio, también contra el de usuario — el primero que se pase corta.
- Al bloquear, cada función devuelve el mensaje de bloqueo respetando su propio contrato de respuesta para que se vea bien en el lugar donde ya se muestra (no un error genérico): `agente-cursos`/`agente-financiero`/`agente-comunicaciones`/`agente-reuniones` devuelven `{respuesta: mensaje}` (se ve como una respuesta más del chat); `verificar-reunion` devuelve el objeto de análisis con `resumen` = mensaje y el resto de los campos vacíos; `cierre-mensual` deja `resumen.analisis` = mensaje sin llamar a Claude; `leer-factura` devuelve HTTP 402 con `{error: mensaje}` (su convención de error ya existente); `agente-promociones` devuelve `{encontradas:0, bloqueado:true, error: mensaje}` sin gastar en Tavily.
- `agente-mensajes` (el bot de WhatsApp/IG/FB, sin JWT/usuario interno) es un caso especial: al bloquear, **no se queda mudo** — responde al cliente "en este momento no puedo responder automáticamente, el equipo se va a comunicar" y dispara la misma escalación por WhatsApp al equipo que ya existe para errores de Claude, marcando la conversación como pendiente. Como no hay usuario JWT en un webhook, el chequeo ahí es solo a nivel organización (asume la única organización activa — a revisar cuando haya multi-tenant real y cada línea de WhatsApp pertenezca a una org distinta).
- El mensaje de bloqueo siempre incluye la fecha de renovación (primer día del mes siguiente) para que quede claro cuándo se resetea el conteo.

### Frontend
- **Módulo Usuarios** — nueva card "🎚️ Uso de IA — organización" arriba de la lista: barra de progreso con color (verde <80%, ámbar 80-99%, rojo ≥100% bloqueado), tokens usados/límite/%, fecha de renovación, y botón "Editar límite" para fijarlo (vacío = sin límite)
- **Modal Editar usuario** — nuevo campo "Límite mensual de tokens de IA (personal)"; si está cargado, se ve un badge `🎚️ Xk tok/mes` en la card del usuario en el listado
- **Dashboard de Alertas** — si el uso de la organización llega al `alerta_pct_tokens` (80% por defecto), aparece una alerta (🟡 aviso / 🔴 crítica si ya llegó al 100%) con el % actual y la fecha de renovación, que lleva al módulo Usuarios al clickearla
- **"Pedir aumento" (v1):** hoy Tomás es admin y dueño de la única organización, así que "pedir aumento" es directamente editar el límite desde esa misma card — no hay pasarela de pago ni flujo de aprobación separado todavía. Cuando haya organizaciones-cliente reales pagando una licencia, ahí sí va a hacer falta un flujo real (ej: botón que abra un pedido de upgrade de plan en vez de un input editable a mano).

**SQL corrido** (`organizaciones.limite_tokens_mensual`/`alerta_pct_tokens`, `usuarios.limite_tokens_mensual` — verificado 15 Sep 2026 contra la API real, no solo asumido).

**Deploy realizado (15 Sep 2026):** las mismas 9 funciones de la sección de logging (`agente-cursos`, `agente-mensajes`, `agente-financiero`, `leer-factura`, `agente-comunicaciones`, `verificar-reunion`, `agente-reuniones`, `agente-promociones`, `cierre-mensual`) — el bloqueo por límite ya está activo.

**Sin límite cargado hoy = sin cambio de comportamiento** — tanto `organizaciones.limite_tokens_mensual` como `usuarios.limite_tokens_mensual` arrancan en `null`, así que nada se bloquea hasta que se cargue un número a propósito desde el panel.

---

## Fix (14 Sep 2026) — Bugs en `agente-mensajes` que podían dejar conversaciones sin ninguna respuesta

**Motivación:** Tomás reportó que la sección de Comunicaciones "estaba fallando en la parte de respuestas automáticas". No había errores nuevos en `panel_errores` (tabla RLS-protegida, solo legible por `authenticated` — no se pudo auditar con la anon key), así que el diagnóstico fue por revisión de código y del historial de commits del archivo.

- ✅ **Race condition en el debounce de mensajes en ráfaga** — cuando un cliente mandaba 2+ mensajes seguidos muy rápido (algo común: preguntar en dos globos separados), CADA invocación de la función esperaba 2s y después contaba cuántos mensajes "pendientes" había; si había 2 o más, esa invocación abortaba sin responder. Con 2+ invocaciones corriendo casi en paralelo, **todas** se veían a sí mismas + a las otras como "2+ pendientes" y **todas** abortaban — la conversación quedaba sin ninguna respuesta, ni del bot ni de alerta al equipo. Fix: cada invocación ahora guarda el `id` de la fila que insertó y, tras el debounce, chequea si esa fila sigue siendo la más reciente pendiente; si no lo es, deja que la invocación del mensaje más nuevo sea la que procese y combine todo.
- ✅ **Filtro de historial de conversación silenciosamente vacío** — `.eq("es_respuesta_manual", false)` es estricto en Postgres (`NULL != false`), así que excluía también las filas viejas donde esa columna nunca se seteó explícitamente (quedó en `NULL`). Efecto: el bot podía perder el contexto de mensajes previos de la misma conversación al armar la respuesta. Cambiado a `.or("es_respuesta_manual.eq.false,es_respuesta_manual.is.null")`.
- ✅ **`responder-mensaje`** (botón "Responder" manual del panel, en Chats de Comunicaciones): las respuestas a Instagram DM se mandaban con el endpoint, page ID y token de **Facebook** (`graph.facebook.com` + `FB_PAGE_ID` + `META_FB_PAGE_TOKEN`) en vez de los de Instagram (`graph.instagram.com` + `IG_PAGE_ID` + `META_ACCESS_TOKEN`) — mismo criterio que ya usa correctamente `agente-mensajes` para el envío automático. Esto rompía cualquier respuesta manual a un DM de Instagram.

**No confirmado como causa única** — no se pudo verificar contra `panel_errores` ni `mensajes_publico` en vivo (RLS bloqueó la lectura con la anon key), así que estos son los bugs reales encontrados en el código, pero puede haber otro factor puntual del incidente que reportó Tomás sin que quedara evidencia en el repo.

**Deploy realizado (15 Sep 2026):** `agente-mensajes`, `responder-mensaje`.

---

## Fix (15 Sep 2026) — Agente de promociones: búsqueda poco certera

**Motivación:** Tomás probó "🔄 Buscar ahora" y el agente traía ruido — promos genéricas de cualquier tarjeta/comercio en vez de lo que realmente sirve: planes de cuotas sin interés que ofrecen los procesadores/posnet (Viumi, Payway) al cobrar con tarjetas de determinado banco. Ejemplo real que dio Tomás: "en Viumi a veces ofrecen pagos en cuotas con tarjetas Macro... y cosas así en su posnet". Además el agente confundía **Banco Macro** con **Makro** (cadena de supermercados mayoristas, sin relación).

- ✅ Reescritas las 5 queries de Tavily en `agente-promociones` para apuntar específicamente a "posnet + planes de cuotas sin interés + comercios adheridos" en vez de "promociones [fuente] Argentina" genérico
- ✅ Reescrito el system prompt de Claude: sección explícita "QUÉ BUSCAR" (financiación para comercios que cobran con tarjeta, no ofertas de compra al público) y "QUÉ DESCARTAR" (promos de una cadena/local específico no relacionado, y regla explícita para no confundir Banco Macro con Makro supermercados)
**Deploy realizado (15 Sep 2026):** `agente-promociones` (queries + system prompt reescritos). Pendiente: correr "🔄 Buscar ahora" de nuevo y confirmar que el ruido bajó.

---

## Implementado (14 Sep 2026) — Chat IA de cursos vinculado a un curso existente + contexto automático

**Qué hace hoy** (resumen — el detalle bug-por-bug de cómo se llegó acá se podó del historial el 15 Sep, ver commit `389e5dc`):

- `agente_cursos_chats.curso_id` — un chat guardado puede quedar vinculado a un curso ya existente. Botón **"🔗 Vincular curso"** en el header del modal de chat (buscador por nombre); se restaura solo al retomar (`cargarChatCurso`) un chat que ya tiene `curso_id`.
- Botón **"🤖 Colaborar con IA"** en el detalle de cada curso (`abrirChatIAParaCurso()`) — abre directo el chat vinculado a ese curso: retoma el guardado si existe, o arranca uno nuevo ya vinculado. Con un chat vinculado, el botón "💾 Crear curso" se oculta (evita duplicar el curso por error).
- Los documentos generados (`_descargarDocumentoIA()`) se guardan en la tab Archivos del curso vinculado del chat — ya no dependen de `_cursoDetalleId` (variable ajena que podía apuntar a cualquier otro curso visitado antes).
- **Contexto automático:** al abrir "Colaborar con IA", `_cargarArchivosCursoComoContexto(cursoId)` trae los archivos ya subidos a la tab Archivos (mismo pipeline de extracción que `adjuntarArchivoCursoIA`: mammoth para `.docx`, xlsx.js para `.xlsx`/`.xls`, base64 directo para PDF/imágenes — tope `MAX_ARCHIVOS=6`/`MAX_MB=8`). Además, `agente-cursos` recibe `curso_id` en cada mensaje y arma un bloque `## CURSO EN CONTEXTO` en el system prompt con la ficha del curso (`cursos.*`), instructores (`curso_instructores`), inscriptos activos (`inscripciones`) y materiales (`curso_materiales`) — el agente no necesita que le repitas fechas/cupos/instructor si ya están cargados.

**Estado:** confirmado funcionando end-to-end en producción (14-15 Sep 2026).

---

## Implementado (16-17 Sep 2026) — Estandarizar respuestas: sacar de la IA lo que es puro dato

**Motivación:** conversación con Tomás — con el técnico están viendo cómo reducir el uso de tokens/IA en `agente-mensajes` y `agente-cursos` estandarizando las respuestas que son datos puros (cantidad de inscriptos, calendario, público objetivo, precio) en vez de hacer que la IA las razone cada vez. Arrancado por `agente-cursos` a pedido de Tomás. Motivo real no es el costo en dólares (a este volumen es marginal, ver sección de límites de IA) sino velocidad, consistencia y evitar que la IA alucine un dato que ya está en la base.

### Paso 1 — Calendario 100% en JS, sin IA
- Modal "Nuevo Curso" — al tocar fecha inicio/fin (`oninput`), `checkFechaCursoNuevo()` valida al instante: fin de semana, feriado nacional 2026 (mismo listado que antes vivía en el system prompt de `agente-cursos`), y superposición con otro curso ya cargado (contra el array `cursos` en memoria, sin ninguna llamada a IA)
- Pendiente (no incluido en este cambio): el chequeo de fecha *conversacional* dentro del chat ("¿podemos dar el curso el 25 de mayo?") sigue pasando por el LLM — interceptarlo requiere reconocer la pregunta en lenguaje natural, que es más complejo que un campo de formulario

### Paso 2 — Respuesta directa para preguntas puntuales sobre un curso vinculado
- `_tryRespuestaDirectaCurso(texto, cursoId)` en `sendCursoIA()` — si el chat está vinculado a un curso y el mensaje es corto (≤80 caracteres) y matchea un patrón conocido (inscriptos, cupos, precio/arancel, público objetivo), responde directo desde `cursos` (ya en memoria) + una consulta liviana a `inscripciones` para el conteo real — sin llamar a `agente-cursos`
- La respuesta se marca visualmente "⚡ Respuesta directa — no se usó IA" para que quede claro que no pasó por Claude
- Cualquier mensaje que no matchee ningún patrón (o supere los 80 caracteres) sigue el camino normal hacia la IA — ante la duda, no se intercepta

### Paso 3 — `publico_objetivo` como columna real + ciclo de vida completo
- Nueva columna editable `cursos.publico_objetivo` (modal de creación + vista de detalle, mismo patrón que `respaldo_institucional`)
- `crearCursoDesdeIA()` la extrae como campo propio (antes quedaba mezclada dentro del texto libre de `descripcion`)
- **Regla clave del interceptor:** si la columna está cargada → respuesta directa (como inscriptos/cupos/precio). Si está vacía → se deja pasar a la IA, porque ahí no hay un dato para buscar — es una decisión de diseño todavía no tomada (Bloque B del Intake Guiado). Interceptar ahí sería inventarle una respuesta al usuario en vez de responder un lookup real
- **Cierre del círculo:** cuando el agente genera una `ficha_diseno` con `publico_objetivo` definido, aparece un botón "💾 Guardar público objetivo" en la card del documento (`_guardarPublicoObjetivoDesdeFicha()`) que lo escribe directo en el curso vinculado — la próxima vez que alguien pregunte, ya es un lookup puro

**SQL corrido** (`cursos.publico_objetivo` — verificado 17 Sep 2026 contra la API real).

**Sin deploy de Edge Functions** — todo este cambio es frontend puro (`index.html`), no tocó ninguna función.

### Paso 4 — Lo mismo en `agente-mensajes` (el bot de cara al cliente, el que más consume)
- `_tryRespuestaDirectaCurso()` + `_matchCursoEnTexto()` en la edge function — antes de traer `publicaciones`/`mejoras`/`planes` y de llamar a Claude, intenta responder directo si el mensaje pregunta por **cupos** o **precio/arancel** de un curso que identifica sin ambigüedad (matcheo de palabras distintivas del nombre contra `cursos`, exige que el mejor candidato le gane claro al segundo)
- Mucho más conservador que en el panel por ser un canal externo con clientes reales: no intercepta fechas ni público objetivo (solo cupos/precio), mensajes >150 caracteres siempre van a la IA, imágenes siempre van a la IA, y ante cualquier ambigüedad de curso no intercepta
- Si intercepta: ahorra las 3 queries de contexto (`publicaciones`/`mejoras`/`planes`) + el llamado completo a Claude; el mensaje queda igual registrado en `mensajes_publico` como `estado='respondido'` para no romper el historial ni las vistas de Chats del panel

**Deploy realizado (17 Sep 2026):** `agente-mensajes`.

### Paso 5 — Fechas como cuarto patrón (panel + agente-mensajes)
- Misma lógica replicada en los dos lugares donde ya vivían cupos/precio: "¿cuándo es/empieza/termina el curso X?", "fecha de inicio/fin" → responde `fecha_inicio`/`fecha_fin` de `cursos` sin pasar por la IA
- En el panel: patrón agregado a `_tryRespuestaDirectaCurso()` (chat vinculado a un curso)
- En `agente-mensajes`: mismo patrón + requiere identificar sin ambigüedad el curso mencionado (`_matchCursoEnTexto`), igual que cupos/precio — mismas reglas de seguridad (mensaje corto, curso sin ambigüedad, dato cargado)

**Deploy pendiente (Supabase Dashboard → Edge Functions):** `agente-mensajes` (nuevo patrón de fechas).

### Paso 6 — Stock de inventario como lookup, no como razonamiento de IA
- Motivación: `agente-cursos` manda el `INVENTARIO_EQUIPOS` completo (tabla de 12 ítems) en cada mensaje y le pide a la IA que razone disponibilidad — el mismo problema que cupos/precio/fecha, aplicado a stock
- Nuevo interceptor `_tryRespuestaDirectaStock(texto)` en `sendCursoIA()`, probado después de `_tryRespuestaDirectaCurso` en la misma llamada
- Matchea el ítem de inventario por nombre (`_matchInventarioEnTexto`, mismo criterio de palabras distintivas que el matcheo de cursos)
- **Sin fecha mencionada:** responde `stock_disponible`/`stock_actual` directo
- **Con fecha mencionada** (`_parseFechaDeTexto` soporta "10 de mayo", "10/05", "10-05-2026"): calcula disponibilidad real para ese día sumando `cantidad_estimada` de TODOS los cursos no cancelados que usan ese ítem en fechas superpuestas — **misma lógica exacta que ya usa `loadInstMat()`** en la tab "Instructores y materiales" de un curso (no es una regla nueva, es la lógica determinista ya validada de la sección "Implementado 10 Sep 2026", ahora expuesta también por chat)
- Ante cualquier duda (ítem ambiguo, mensaje largo) no intercepta, sigue a la IA

**Sin deploy de Edge Functions** — frontend puro (`index.html`).

**Próximos candidatos (a definir con Tomás cuando se retome):** evaluar si conviene el mismo tratamiento en otros agentes (`agente-financiero`, `agente-comunicaciones`); replicar el interceptor de stock también en `agente-mensajes` si algún cliente externo llega a preguntar por equipamiento (poco probable, es más un caso de uso interno).

### Paso 7 — Prompt caching en `agente-cursos` (Lever #1 de reducción de tokens)

**Motivación:** después de cerrar el paso 6, Tomás preguntó si había formas de reducir el gasto de prompts además de los interceptores. Se propusieron 4 palancas (caching, armado condicional del prompt, downgrade de modelo para consultas simples, recorte de `agente-mensajes`); se arrancó por la de mayor impacto y menor riesgo.

- `agente-cursos` — el `system` se partió en dos bloques: `sistemaEstatico` (SKILL_CURSOS + PROGRAMA_MSP + DOCS_NORMATIVOS + INVENTARIO_EQUIPOS + ESTRATEGIA_OFERTA + PLANTILLA_DISENO — miles de tokens que nunca cambian) con `cache_control: {type:"ephemeral"}`, y `sistemaDinamico` (fecha de hoy, modo conciso, cursos/instructores en vivo, curso en contexto) sin cache, siempre después del bloque cacheado para no invalidarlo
- Anthropic GA, sin beta header — el bloque estático supera de sobra el mínimo cacheable de Sonnet (1024 tokens)
- **Hallazgo propio durante la implementación:** con caching activo, `response.usage.input_tokens` pasa a ser solo el remanente sin cachear — los tokens reales quedan repartidos en `cache_creation_input_tokens` (escritura, ~1.25×) y `cache_read_input_tokens` (lectura, ~0.1×), dos campos que `ia_uso` y `chequearLimiteIA()` nunca sumaban. Sin corregirlo, el límite de tokens y el desglose de uso por función iban a **subestimar el consumo real** apenas se activara el cache en cualquier función
- Corregido en las **9 funciones instrumentadas** (`agente-cursos`, `agente-mensajes`, `agente-financiero`, `agente-comunicaciones`, `verificar-reunion`, `agente-reuniones`, `agente-promociones`, `cierre-mensual`, `leer-factura`) y en **3 lugares del panel** que también sumaban `ia_uso`: `loadDetalleUsoIA()` (modal "Ver detalle" de Usuarios), la KPI de alertas del dashboard (línea ~5285) y `loadLimiteIAOrg()` (card "🎚️ Uso de IA — organización", línea ~20305) — los tres ahora incluyen `cache_creation_input_tokens`/`cache_read_input_tokens` en el `select` y en la suma
- Solo `agente-cursos` tiene la restructuración real de caching (bloque estático/dinámico separado); las otras 8 funciones solo recibieron el fix de conteo, para que el agregado compartido de `ia_uso` no quede mal apenas se sume caching en cualquiera de ellas más adelante

**SQL pendiente (correr en Supabase SQL editor):**
```sql
ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS cache_creation_input_tokens int DEFAULT 0;
ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS cache_read_input_tokens int DEFAULT 0;
```

**Deploy pendiente (Supabase Dashboard → Edge Functions):** las 9 funciones de arriba — ninguna de estas ediciones está en efecto hasta redeployarlas (y correr el SQL antes, si no el INSERT con los campos nuevos puede fallar).

**Pendiente (fase 2, no arrancada):** aplicar el mismo split estático/dinámico de caching a `agente-mensajes` — ahí `buildSistema()` entrelaza texto estático (FAQ, reglas, ejemplos) con datos dinámicos (`cursosTexto`, `pubTexto`, `mejorasTexto`, `planesTexto`, `siteContent`) en un solo string, así que requiere reordenar la función, no es un split mecánico como en `agente-cursos`. Quedan también sin explorar las otras 3 palancas propuestas (armado condicional del prompt, downgrade a Haiku para consultas simples, recorte de `agente-mensajes`).

### Fix crítico (17 Sep 2026) — `agente-mensajes` llevaba tiempo respondiendo sin datos reales de cursos

**Motivación:** Tomás reportó un caso real (curso de cirugía mínimamente invasiva de Derlin Juárez Muas) donde el bot gastó ~10.000 tokens en 3 llamadas y aun así contestó evasivo ("no tengo el arancel publicado... prefiero conectarte con el equipo") pese a que el curso **sí tenía arancel cargado ($850.000) y cupo (100)**.

- **Causa raíz:** la consulta `supabase.from("cursos").select(...)` en `procesarMensaje()` pedía una columna `instructor` que **no existe** en la tabla (el campo real es `instructor_nombre`) — Postgres devuelve error 42703 en el `select` completo, así que `cursos` volvía `null`/vacío en **absolutamente todos los mensajes**, sin ninguna señal de error visible (el catch silencioso de Supabase JS no tira excepción, solo deja `data:null`)
- Efecto doble: (1) el interceptor `_tryRespuestaDirectaCurso()` nunca tenía datos contra los que matchear, así que cupos/precio/fecha de CUALQUIER curso siempre caían a la IA; (2) la IA tampoco tenía contexto real de cursos (`cursosTexto` quedaba en "No hay cursos próximos publicados"), así que improvisaba respuestas evasivas en vez de alucinar o de admitir que no tenía nada — el prompt completo (FAQ, reglas, ejemplos, programa MSP, fetch del sitio web) se seguía gastando igual, por nada
- **Fix:** `instructor` → `instructor_nombre` en el `select` y en el armado de `cursosTexto` (`buildSistema`)
- Verificado contra la API real: con la columna corregida, el curso de Derlin Juárez Muas trae `arancel:850000, cupos_max:100` — el interceptor ahora sí lo va a resolver sin IA

**No se sabe hace cuánto estaba roto** — no hay forma de saber desde cuándo (no quedó registrado en `panel_errores`, que es de errores del panel, no de edge functions). Cualquier respuesta histórica del bot sobre cupos/precio/fecha de un curso específico pudo haber sido una improvisación de la IA sin datos reales de por medio, no una alucinación aislada.

**Deploy pendiente (Supabase Dashboard → Edge Functions):** `agente-mensajes`.

---

## Auditoría módulo contable (21 Sep 2026) — Fase 1 y 2 ya existían, sin documentar

**Motivación:** Tomás quería evaluar orientar el plan de cuentas a la numeración de Tango Gestión (el nuevo equipo de contadores usa Tango, más simple que Finnegans) y pidió analizar a fondo el estado real de la contabilidad de partida doble antes de seguir. Al revisar la base directamente se descubrió que **la Fase 1 y la Fase 2 del roadmap contable (`plan_modulo_contable_metanoia.md`) ya estaban implementadas y funcionando desde el 17/07/2026** — 44 cuentas en `plan_cuentas`, `parametros_impositivos` cargado, 110 asientos contables reales generados automáticamente. Ninguna sesión anterior lo dejó anotado acá, así que el roadmap decía "pendiente" hace más de dos meses.

**Lo que funciona bien:** los 110 asientos existentes están **perfectamente balanceados** (debe=haber sin excepción, verificado sumando todos los `asientos_movimientos` por asiento). El motor de partida doble (`generarAsiento()`) en sí es correcto.

**Bugs reales encontrados y corregidos (commit `c5d0a6b`):**

1. **Los asientos de pago de sueldo fallaban el 100% de las veces, en silencio.** El código mandaba `tipo:"pago_sueldo"` pero el `CHECK` constraint de `asientos_contables.tipo` solo acepta `'sueldo'` (verificado con inserts de prueba directos contra Supabase). El `.catch(()=>{})` que envolvía la llamada se tragaba el error sin ningún aviso — **0 asientos de sueldo existían en la base** pese a que se pagan sueldos regularmente.

2. **Causa raíz de fondo:** `_MCF_META` (el catálogo de cuentas sugeridas cuando el modal de "cuenta faltante" se dispara) tenía el eje 4/5 **invertido** respecto al `plan_cuentas` real — asumía 4=Egresos/5=Ingresos, cuando el plan poblado en julio es al revés (4=Ingresos, 5=Egresos). Esto hizo que el código de sueldo (`4.2.01.001`) y el de intereses de préstamo (`4.2.03.001`) apuntaran a cuentas de **Ingresos** en vez de Egresos. Corregidos a los códigos reales (`5.1.01.001` Sueldos y cargas sociales, `5.3.01.001` Intereses pagados) en los 4 lugares que generan estos asientos. `_MCF_META`/`_mcfTipoByCode` reescritos para coincidir con la numeración real.

3. **12 de 18 comprobantes marcados "pagado" nunca generaban su asiento de pago.** Existe un botón "Pagar" directo (`confirmarPagoComp`, sin Orden de Pago formal) que solo movía `caja_movimientos`, nunca la contabilidad — a diferencia del flujo de OP formal, que sí genera el asiento. Resultado: la cuenta "Proveedores" en los libros estaba sobreestimada (mostraba deuda de facturas ya pagadas). Agregado el asiento también en ese camino, con `origen:"comprobante_pago"` (distinto de `"comprobante"`, que ya usa el devengado del mismo comprobante) para no colisionar en la deduplicación del backfill.

4. **`mcfConfirmar()` no creaba los niveles intermedios faltantes del plan de cuentas.** Si una cuenta nueva necesitaba un padre que no existía todavía, quedaba huérfana (`cuenta_padre_id: null`), rompiendo la jerarquía y los subtotales. Encontrado en producción: la cuenta `4.2.03.001 "Intereses y gastos financieros"` (creada 15/09/2026) estaba huérfana por este motivo — verificado que no tenía movimientos asociados y se borró. Nuevo helper `_mcfAsegurarPadres()` crea la cadena completa de ancestros antes de crear la cuenta imputable.

**SQL pendiente (correr en Supabase SQL editor)** — el código ya usa `'pago_cuota_prestamo'` y `'ajuste_manual'` como tipos legítimos y distintos (con su propio label/color en el Libro Diario), pero nunca se agregaron al constraint original:
```sql
ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_tipo_check;
ALTER TABLE asientos_contables ADD CONSTRAINT asientos_contables_tipo_check
  CHECK (tipo IN ('devengado_compra','pago_compra','devengado_venta','cobro_venta','sueldo','ajuste','apertura','pago_cuota_prestamo','ajuste_manual'));
```

**Pendiente — correr backfill después del SQL:** botón admin "🔄 Generar históricos" (tab Libro Diario, dentro de Impuestos) — ahora también cubre los 12 pagos directos sin OP y debería poder generar los asientos de sueldo que fallaban. Todavía no se corrió después de este fix.

**Sin hacer todavía (no es bug, es alcance):** el lado de ingresos (ventas/cursos/alumnos) — `devengado_venta`/`cobro_venta` — nunca se implementó. Coincide con la Fase 3 del roadmap (`cuenta_corriente_alumnos` + importador Finnegans), que sigue pendiente. Hoy los libros contables solo tienen la mitad de la película: compras sí, ventas no.

**Decisión pendiente de Tomás — numeración estilo Tango:** todavía no se tocó el plan de cuentas para alinearlo a Tango Gestión. Paso siguiente sugerido: pedirle al equipo de contadores el export/pantallazo del plan de cuentas real que usan en su instancia de Tango, para calcarlo en vez de aproximarlo — cada instalación personaliza su propia numeración.

**SQL corrido (21 Sep 2026):** el ALTER del constraint de arriba ya se ejecutó en Supabase.

**Pendiente para la próxima sesión:** después de correr "🔄 Generar históricos" (Libro Diario), quedaron algunos asientos de **cuotas de préstamos sin generar** — Tomás lo notó al revisar, todavía no se investigó la causa (podría ser cuotas sin `prestamo_id` válido, sin `capital`/`intereses` cargados, u otra cosa). Retomar desde ahí.

---

## Implementado (24 Sep 2026) — Aprobación de cursos + escalación bot por email dinámica

### Aprobación de cursos para publicar
- ✅ **Cursos creados por no-admins** siempre se crean en `Borrador` con `publicacion_aprobada=false`
- ✅ **Admins que crean cursos**: auto-aprobados (sin fricción para el flujo habitual de Tomás/Mario/Amparo)
- ✅ **Banner de estado de aprobación** en el detalle de curso (entre cd-header y cd-tabs):
  - 🟡 Ámbar para admins: "⏳ Borrador pendiente..." + botón "✅ Aprobar para publicar"
  - 🟡 Ámbar para no-admins: "⏳ Borrador pendiente de aprobación de un administrador" (sin botón)
  - 🟢 Verde: "✅ Aprobado para publicar por [nombre] · [fecha]"
- ✅ **`setEstadoCurso` bloqueado** para no-admins: no pueden pasar a Convocatoria/Inscripciones/En curso/Educación médica continua si `publicacion_aprobada=false`
- ✅ **Edge function `aprobar-publicacion-curso`**: PATCH + email SMTP a todos los admins activos + al creador del curso (match por `usuarios.nombre`)
- ✅ **SQL corrido (24 Sep 2026)**: 3 columnas + backfill (`publicacion_aprobada=true` para cursos que ya no son Borrador)

```sql
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS publicacion_aprobada boolean DEFAULT false;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS aprobado_para_publicar_por text;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS aprobado_para_publicar_en timestamptz;
UPDATE cursos SET publicacion_aprobada = true WHERE estado != 'Borrador';
```

### Escalación bot por email — destinatarios dinámicos
- ✅ `sendEmailEscalacion` en `agente-mensajes` ya no usa emails hardcodeados — lee `notificaciones_config.escal_bot_email=true` y envía a esos usuarios
- ✅ Toggle "📨 Escalaciones del bot (email)" en pg-notif, visible solo para admins y comunicaciones
- Fallback: si nadie tiene el toggle activado, envía a `tlarran@metanoiasmx.com`

### Estándar de documentos del agente de cursos (4 entregables)
- ✅ `ESTANDAR_DOCUMENTOS` en `agente-cursos` — calidad mínima basada en los 4 documentos presentados en el congreso (ficha PEV1, contenido teórico, manual de facilitador, cronograma)
- ✅ Tipo `contenido_teorico` — módulos con secciones en prosa + examen por módulo, renderer Word
- ✅ Sistema de aprobación de cursos agendado para cuando se incorporen instructores SASIM

### Pendiente agendado
- [ ] **Biblioteca de PDFs + búsqueda semántica para agentes** — ver discusión del 24 Sep 2026. Opción B (texto full-text search en PostgreSQL sin embeddings) como primera iteración. Cuando la biblioteca de material médico crezca y la búsqueda quede corta, migrar a pgvector.

---

## Implementado (1 Oct 2026) — Automatizaciones Auren (A-F), Centro de Control, fixes NPS/diploma/permisos

**Motivación:** Tomás compartió el "DIAGNOSTICO CONTABLE ACTUAL ND.pdf" de Auren (estudio contable externo) — primera evaluación formal de los circuitos administrativo-contables. Se construyeron las 6 automatizaciones propuestas, de más simple a más compleja, y de paso se resolvieron varios pedidos sueltos del mismo día (cuenta puente de socios, Centro de Control semanal, fixes de NPS/diploma/permisos). Detalle completo en memoria (`project_diagnostico_auren_automatizaciones.md`).

### Automatizaciones Auren A-F (todas implementadas y deployadas)
- **A — Calendario impositivo**: tabla `calendario_impositivo` con fechas tope Auren (SUDES/POINTERS), tab en Impuestos, alertas en dashboard, **y ahora integrado también al Calendario unificado** (filtro Finanzas, dot naranja/rojo según urgencia)
- **E — "📢 Avisar compra nueva"**: botón en dropdown de usuario (hoy restringido solo a `admin`, ver más abajo) → card pendiente en Comprobantes + notificación al responsable de pagos
- **F — Medios de pago personales**: toggle "personal" en `medios_pago` + badge + alerta mensual de gasto con plata personal (apoya independencia patrimonial)
- **B — Checklist semanal "Circuito de pagos (jueves)"**: rutina recurrente con sub-tareas (tabla `rutinas` existente) + alertas de rutinas en dashboard. De paso se encontró y corrigió un bug: el generador de tareas desde rutinas usaba el campo `notas` en vez de `descripcion` para el contenido del checklist.
- **C — Email automático al proveedor**: edge function `enviar-pago-proveedor` — comprobante de pago + certificado de retención al marcar "pagado" vía OP formal
- **D — Circularización de saldos**: botón "Circularización" en Comprobantes, edge function `enviar-circularizacion`, email a proveedores con mayor saldo pendiente

### De paso (pedido explícito, no parte del diagnóstico original)
- ✅ **OP con logo y datos fiscales reales** — `generarPDFOrdenPago` (ahora async) carga `logo-sudes.png`/`logo-pointers.png` + `getFiscalSociedad()` (razón social, CUIT, domicilio, condición IVA) en vez del texto genérico "Metanoia SMX · SUDES"
- ✅ **Cuenta puente de socios** — para facturas pagadas con plata personal de los socios, con detalle **por socio individual** (no un pozo común): medios de pago nuevos tipo `cuenta_socio` ("Aporte Socios SUDES"/"POINTERS"), tabla `aportes_socios` (socio_id, sociedad, tipo aporte/devolución), cuentas `2.1.05.001`/`002` en plan de cuentas, tab "🤝 Socios" en Cuentas Corrientes con botón de devolución. Se encontró de paso que `medios_pago.cuenta_contable_id` estaba documentado como corrido en julio pero nunca se había ejecutado, y que `getBancoCodigoPorMedio()` adivinaba la cuenta contable por nombre en vez de usar el vínculo real — ambos corregidos.

### Centro de Control semanal (nueva página, `pg-control`)
- ✅ 5 secciones: reuniones sin convertir a tareas, tareas vencidas por persona (con botón eliminar), promociones por aprobar, NPS pendiente, próximas visitas
- 🐛 **Bug real encontrado y corregido**: los action items extraídos de transcripciones de reuniones (`reuniones.tareas_extraidas`, JSONB) nunca se convertían en tareas reales del Kanban — quedaban como texto muerto para siempre. Ahora cada ítem tiene botón "✓ Crear tarea" que inserta en `tareas` y marca `convertida:true` in-place en el JSONB.

### Fix NPS — feedback sin nota numérica se perdía
- 🐛 Alumnos que respondían con comentario cualitativo sin enviar nunca un número 0-10 (caso real: Bryanna Ortiz) nunca generaban fila en `nps_respuestas` — el flujo solo actuaba si podía parsear un número. Nuevo estado `pidiendo_nota` en `nps_envios`: si llega comentario sustantivo sin número, el bot lo guarda y vuelve a pedir la nota; si el alumno nunca la manda, **Tomás puede pedirle a Claude que interprete una nota según el comentario** (criterio explícito del usuario) en vez de dejarlo sin puntuar.

### Fixes de permisos y diploma (1 Oct 2026)
- ✅ **"📢 Avisar compra nueva"** ahora oculto para `comunicaciones`/`instructor`/`logistica`/`proveedor` (mismo patrón CSS `body.rol-X`) — queda solo para `admin`, preparado para el futuro rol `contable`
- ✅ **Diploma — solo firman los instructores `rol=titular`** de `curso_instructores` (no asistentes/invitados) — confirmado que la columna `rol` ya existe en producción con valores `titular`/`asistente`/`invitado`

**Pendiente de cierre:** armar el resumen final de todo lo automatizado + propuesta para elevar a los contadores de Auren, y preguntarles qué archivos/exports les sirven (rol `contable` sigue diferido hasta esa reunión, ver sección de arriba).

---

## Implementado (2 Oct 2026) — Extractos bancarios (PDF Macro), resúmenes guardados y cierre de tarjeta

**Motivación:** preparar el cierre de mes y de balance (30/06). Los gastos bancarios nunca se contabilizaban y no había archivo de resúmenes. Criterios contables **confirmados por la contadora (Estela, 2 Oct 2026)**.

- ✅ **Importar extracto PDF del Macro** (Cash Flow → Conciliación → 📄): lee el PDF en el navegador con pdf.js (lectura por coordenadas, sin IA). El signo de cada movimiento sale de la variación del saldo. Detecta la sociedad por CUIT (`datos_fiscales_sociedad`). **Controles contra el propio banco**: el saldo debe cerrar, y la suma de DBCR 25413 y de SIRCREB debe coincidir con los totales que imprime el extracto; si no cierra, no deja importar. Probado con agosto 2026 de SUDES: 0 errores, asiento balanceado al centavo.
- ✅ **Pantalla de revisión** antes de confirmar: controles, totales por categoría, asiento propuesto y reclasificación manual de cualquier movimiento. La cuenta en dólares se lee pero **no se importa todavía** (falta cuenta contable USD).
- ✅ **Asiento mensual `gastos_bancarios`** (un asiento por extracto): comisiones/mantenimiento → 5.3.01.002; intereses → 5.3.01.001; IVA de comisiones/intereses → 1.1.03.001; percepciones IVA → 1.1.03.003; SIRCREB → 1.1.03.004 (activo a favor, no gasto); **ley 25.413**: 33% informado por el banco → 1.1.03.002 (crédito a computar) y el resto → 5.3.02.001 (gasto); **con certificado MiPyME vigente computa el 100%** (checkbox en la revisión, se recuerda en `datos_fiscales_sociedad.mipyme_vigente`). Comisión de transferencia de $121 = $100 neto + $21 IVA.
- ✅ **🗂 Resúmenes** (nueva pestaña de Cash Flow): archivo de todos los extractos con el PDF original (bucket privado `extractos-bancarios`, enlace firmado), saldos, totales por concepto, asiento generado, cobertura de los 12 meses del ejercicio (1/07–30/06) por sociedad, exportación a Excel y anulación de una importación.
- ✅ **Cierre de tarjeta**: en el extracto, el débito "VISA PESOS" tiene botón 💳 *Cerrar tarjeta*. Asiento `liquidacion_tarjeta`: Debe tarjeta (pasivo 2.1.06.xxx) / Haber banco; los cargos financieros (intereses, sellos) van a gasto. Marca las facturas pagadas con esa Visa (`comprobantes_compra.liquidacion_tarjeta_id`). El saldo de la tarjeta puede quedar negativo si hay consumos sin factura cargada; se corrige solo al cargarlas.
- 🐛 **Bug corregido**: las 2 Visa y las 2 cuentas Macro no tenían `cuenta_contable_id` y `getBancoCodigoPorMedio` caía en "banco" por el nombre: una compra con Visa figuraba como salida de banco. Se crearon 2.1.06.001/002 (Visa SUDES/POINTERS), se vincularon los 4 medios y se corrigió el asiento de Signal Seguridad. Las 2 facturas de POINTERS pagadas con Visa siguen sin asiento de pago: correr 🔄 Generar históricos.
- Cuentas nuevas en el plan: 1.1.03.002/003/004, 2.1.06 (+.001/.002), 5.3.01.002, 5.3.02 (+.001).

- ✅ **Certificado MiPyME con alerta de vencimiento** (🗂 Resúmenes, tarjeta por sociedad): se sube el PDF, el panel lee el CUIT (verifica que sea de SUDES o POINTERS) y la fecha de vencimiento ("Hasta: dd-mm-aaaa"), pide confirmarla y la guarda en `datos_fiscales_sociedad.mipyme_vencimiento`. Alerta en el dashboard desde 60 días antes (crítica si venció). El importador de extractos solo aplica el 100% si el certificado sigue vigente al fin del período; si venció, usa 33% y avisa. **Certificado de SUDES cargado el 2/10/2026: vigencia 08-08-2026 → 31-10-2026** (renovar antes del 31/10). ⚠️ Arranca el 08/08: del extracto de agosto, los movimientos del 1 al 7 quedan fuera de la vigencia; consultar a la contadora si se prorratea.

- ✅ **Cruce panel ↔ banco** (Conciliación): los movimientos que carga el panel (sin saldo) se cruzan contra el extracto importado: mismo signo, mismo importe y fecha a ±5 días (primero exacto, después ±0,5% marcado como "aproximado"). Corre solo al importar y con el botón 🔗 *Cruzar con el banco*. El par se muestra como una sola fila del lado del banco. **Resaltado**: rojo = está en el panel y no aparece en el banco (solo dentro de meses con extracto importado); ámbar = está en el banco y falta en el panel; filtro "Solo diferencias". Anular un match libera ambos lados. **Cruce ampliado (2 Oct 2026, a partir del extracto de julio de POINTERS):** además del cruce panel↔banco, el botón 🔗 y la importación ahora (a) **unifican duplicados del panel** — un mismo pago anotado por varios caminos (orden de pago + Cash Flow + pago directo, caso Finnegans ×3) se reconoce por número de factura + importe, o por concepto contenido en otro del mismo día e importe; los duplicados quedan marcados `match_tipo='duplicado'` y ocultos (no se borra nada); (b) cruzan los débitos del banco contra **cuotas de préstamos y planes de pago** (AFIP/Rentas se cargan como préstamos; importe exacto, fecha de pago o vencimiento ±6 días), **órdenes de pago** (neto a pagar), **facturas pagadas** y **inversiones** (suscripción, aportes y rescates). Importe exacto primero, después tolerancia de $1. Lo que sigue sin contrapartida queda resaltado en ámbar. **Fondos comunes:** los créditos del CUIT 30693657977 ("ROSARIO VALORE", "GC2") son **rescates de fondos** (Avantia, etc.), no cobros → categoría `rescate_fci`; los débitos "Liq.Susc" son `suscripcion_fci`. Se cruzan con los rescates/aportes cargados en Inversiones (importe exacto, ±6 días). Reclasificados los ya importados de POINTERS jul. **Caso POINTERS jul — resuelto el 2/10/2026 (datos corregidos en Inversiones, AXIS Avantia):** (1) el rescate de $374.945 del 07/07 era en realidad $374.000 pedido a Avantia por mail el 13/07 → corregido monto y fecha (y devueltos $945 al valor del fondo); (2) el cheque Fenix Jul-26 POINTERS de $20.000.000 se depositó directo en la inversión (la cobranza dice "📈 AXIS AVANTIA", cobrado 21/07) pero solo se había registrado el neto de $6.000.000 → aporte corregido a $20.000.000 del 21/07 más un rescate de $14.000.000 del 23/07 transferido a Macro (capital $58,5M → $72,5M; valor del fondo sin cambios). El rescate de $37.625.055 del 07/07 es un eCheck para pagar simuladores, no entra al banco. **Lección:** un cheque depositado en una inversión debe registrarse como aporte por el total y los rescates por separado; registrar el neto rompe el cruce con el banco. Pendiente de revisar lo mismo en SUDES (cheques de julio y agosto también cobrados a AXIS/Money Market).
- ✅ **🖨 Lista de control** (por extracto, en Resúmenes y en la pantalla de revisión): gastos bancarios e impuestos con casillero, fecha y monto, por sección (ley 25.413, SIRCREB, IVA/percepciones, comisiones, intereses, pagos AFIP/Rentas), con subtotales y control contra los totales que informa el banco. Se usa junto al extracto impreso (PDF original, botón 📄) para tildar con resaltador.

**SQL:** `sql_extractos_bancarios.sql` ejecutado el 2/10/2026 (bucket + tablas + columnas + tipos de asiento + `cierres_mensuales`). **Falta correr la última línea**: `ALTER TABLE datos_fiscales_sociedad ADD COLUMN IF NOT EXISTS mipyme_archivo_path text;` (para guardar el PDF del certificado).

### 🔒 Cierre de mes contable (nueva pestaña de Cash Flow, por sociedad)
- ✅ Pestaña **🔒 Cierre de mes** (el botón "Cerrar mes" de arriba lleva acá): elegís sociedad y mes y verifica contra la base real (datos y asientos, sin IA, sin edge function nueva). El checklist operativo + análisis IA anterior sigue disponible con el botón "📋 Checklist operativo + IA".
- **Controles**: extracto bancario importado y contabilizado · cruce panel↔banco · pagos de tarjeta cerrados · facturas del mes con asiento de devengado (con cuadre de importes comprobantes vs asientos) · pagos de facturas con asiento (OP o pago directo) · sueldos (pagos sin asiento y empleados sin pago) · cuotas de préstamos (pagadas sin asiento / vencidas sin pagar) · asientos balanceados · VEP vencidos y envíos a Auren pendientes · variación del banco extracto vs libros (informativo: difiere mientras no exista el lado de ventas/cobros).
- **Resumen del mes**: ingresos, egresos, resultado, IVA débito/crédito, gastos bancarios y balance de sumas y saldos por cuenta. Imprimible.
- **Cerrar / reabrir** (`cierres_mensuales`): registra quién y cuándo, guarda una foto de los controles y números; **con pendientes exige una nota** explicando por qué se cierra igual. Cierre **con aviso**, no bloqueante: si se contabiliza algo en un mes cerrado, `generarAsiento` avisa con un toast, y al abrir el mes el panel muestra "cambió después del cierre" comparando contra la foto. Reabrir deja constancia en las notas.
- **Vista del ejercicio** (1/07–30/06) al pie de la pestaña: 12 meses con extracto, asientos, ingresos, egresos, resultado, IVA y estado de cierre; tocar un mes lo verifica. **Exporta a Excel** (cierres por mes + sumas y saldos del ejercicio) para el cierre de balance.
- Probado contra datos reales: SUDES ago/sep y POINTERS sep dan 0 asientos desbalanceados y las facturas cuadran al centavo.
- 🐛 **Bug corregido (cuotas de préstamo sin asiento)**: `backfillAsientos` (🔄 Generar históricos) usaba listas globales (`cfPrestCuotas`, `cfPrestamos`, `cfPagosEmpleados`, `cfEmpleados`) que solo se cargan al visitar Cash Flow; corrido desde Impuestos no encontraba nada y dejaba cuotas y sueldos sin asiento. Ahora carga sus propios datos y, para cuotas, ignora lo anterior al `2026-07-01` (ejercicio cerrado). Además `confirmarPagoCuota` ya no traga el error al generar el asiento. **Pendiente: correr 🔄 Generar históricos** — hoy hay 9 cuotas de jul–sep 2026 pagadas sin asiento que va a generar; otras 16 cuotas más viejas (préstamo "Plan de cuotas de tu préstamo" cuotas 1–16, mar-2025 a jun-2026, marcadas pagadas sin fecha de pago) quedan fuera del corte y hay que revisarlas a mano.
- ✅ **Reporte exportable de NPS** (2 Oct 2026): botón **⭐ Reporte NPS** en Cursos (todos los cursos) y **📥 Reporte exportable** dentro de la pestaña NPS de cada curso. Filtros por curso y período, vista previa y dos salidas: **Excel de 5 hojas** (Resumen con NPS, % promotores/detractores, tasa de respuesta, distribución 0–10 y tabla por curso · Respuestas · Comentarios de menor a mayor nota · Sin responder · **Texto de la encuesta**) y **PDF de descarga directa** (jsPDF, 2 páginas: resumen, por curso, comentarios, sin responder y, como anexo, el texto de la encuesta). El texto de la encuesta está en la constante `_NPS_TEXTOS` de `index.html` (plantilla inicial `nps_experiencia_metanoia` + mensajes de seguimiento del bot); **si se cambia la plantilla en Meta o los textos de `agente-mensajes`, actualizar esa constante** para que el reporte siga diciendo lo que realmente se envía. Fórmulas: `NPS = % promotores (9–10) − % detractores (0–6)`; `tasa de respuesta WhatsApp = alumnos con nota registrada ÷ encuestas enviadas` (un envío por alumno y curso; los reenvíos no cuentan doble). "Sin responder" también marca los que figuran como respondidos pero sin nota guardada, para revisar. Hoy esos 4 son envíos de prueba de Tomás/Patricia.
- **Pendiente (lo hace Tomás, 2 Oct 2026):** importar los extractos de **julio, agosto y septiembre** de SUDES y POINTERS y ver cómo funciona. Lo que no tenga contrapartida queda resaltado (rojo = está en el panel y no en el banco; ámbar = está en el banco y no en el panel); sin extracto, el control del cierre da "crítico". Ajustar reglas de clasificación si aparecen conceptos que hoy caen en "otros pagos/cobros".
- **Ventas / ingresos (`devengado_venta`/`cobro_venta`) quedan en el roadmap** (Fase 3). El técnico de la plataforma e-learning avisó el 2 Oct que **la API ya está lista**: falta que genere el token Sanctum (`ELEARNING_API_TOKEN`) y correr el SQL de las tablas `elearning_*` (ver sección de integración E-learning). Hasta entonces el resultado del mes sale solo con egresos.

### 💳 Pago único de facturas (2 Oct 2026) — fase 1: protecciones

**Problema:** cada botón de pago escribía un conjunto distinto de registros y ninguno controlaba duplicados. La auditoría de los datos reales (20 facturas pagadas desde julio) encontró: Finnegans con 4 movimientos de banco, una factura con 2 de caja, **todas** las pagadas dejaban un egreso de caja (también las de banco y tarjeta) y 147 egresos de caja (~$140M) creados solo por *revisar* facturas. Además el botón **Pagar** directo solo existía para notas de crédito: toda factura, hasta las de tarjeta, tenía que pasar por una orden de pago.

**Regla de negocio (Tomás, corregida el mismo día):** una **orden de pago (OP) no es un pago**: es la *instrucción* de cómo se va a pagar una factura (medio, retenciones). Generarla deja la factura **impaga**; el pago se registra recién cuando se **paga la orden**. La OP existe por las **retenciones** (facturas A por transferencia/efectivo/cheque), pero **cualquier factura puede tener una**. Las facturas chicas o de **tarjeta** se pagan directo con 💳 Pagar (no llevan OP). La Caja muestra **solo efectivo real**.

**Cómo quedó:** un único punto de entrada `registrarPagoFactura()` (helpers `_pagoTesoreria`, `_pagoAsiento`, `_pagoFresco`, `_pagoMedioTipo`) que usan Pagar, Pagar OP y Cash Flow:
- **Dos caminos separados, nunca juntos:** (1) **💳 Pagar** = elegís el medio y se registra en el acto; (2) **📄 Generar OP** = crea la orden (estado `borrador` en la base, "pendiente de pago" en pantalla), sin tocar tesorería ni asientos; después **💸 Pagar OP** (`abrirPagarOP` / `confirmarPagarOP`) registra el pago y marca orden y factura como pagadas. Una OP pendiente se puede editar (✎), ver en PDF o anular (`anularOP`, solo si no está pagada).
- **No se paga dos veces** la misma factura (se vuelve a leer el estado en la base; protege del doble clic y de pantallas desactualizadas). Con una OP pendiente, el **Pagar directo queda bloqueado** (hay que pagar la orden o anularla).
- **Un solo registro de tesorería según el medio:** banco → `banco_movimientos` (reconoce uno ya existente por número de factura + importe); efectivo / cheques de terceros → Caja (reutiliza la línea existente); **tarjeta → ninguno** (la deuda queda en la tarjeta hasta 💳 Cerrar tarjeta); cuenta de socio → aporte del socio. Para banco, tarjeta y socio se retira la línea de caja heredada de la revisión.
- **Un solo asiento** de pago, aunque antes hubiera uno con el otro origen (`comprobante_pago` / `orden_pago`).
- **Una sola OP por factura:** generarla de nuevo actualiza la pendiente (conserva el número); una factura con OP pagada no admite otra. OP con tarjeta: se bloquea.
- **Retenciones practicadas y conciliación bancaria solo consideran OP pagadas.**
- **Revisar una factura ya no crea un egreso de caja.**
- **Botones** (`_accionesPagoHTML`, en Pendientes de pago y Comprobantes): sin OP → 📄 Generar OP + 💳 Pagar; con OP pendiente → 💸 Pagar OP + 📄 PDF + ✎; notas de crédito → solo Pagar.
- **Cash Flow → Pagar concepto:** si el número de factura tipeado corresponde a una factura cargada, el pago va por el camino único (si ya estaba pagada, avisa y solo actualiza el valor real; si el monto no coincide, pide pagar desde Comprobantes por las retenciones). Sin factura cargada, sigue siendo un gasto suelto, ahora sin duplicarse.
- Probado con 31 controles sobre una base simulada (generar OP sin pagar, pagar OP por banco/efectivo/socio, doble pago, pagar directo bloqueado con OP pendiente, anular, tarjeta, movimiento ya anotado desde Cash Flow, botones).

**✅ Limpieza de caja hecha (2 Oct 2026, con OK de Tomás):** se borraron 149 líneas "Auto desde comprobantes" (146 egresos de facturas revisadas/cerradas/pagadas por banco/de una factura ya eliminada + 3 ingresos que se habían generado desde notas de crédito, entre ellas una de $37,6M). Se conservó 1: San Lorenzo $13.569,58, pagada en efectivo. Caja resultante: SUDES +$19,1M, POINTERS +$19,3M (antes −$10,1M y −$53,9M). Respaldo restaurable en `backups/caja_auto_comprobantes_20261002.json`.

**Pendiente (fase 2):** (a) ~~limpiar los egresos de caja heredados~~ hecho; (b) modal único de pago (Pagar + Orden de pago juntos); (c) columna `comprobante_id` en `banco_movimientos` para enlazar el pago a la factura sin depender del número; (d) asiento para gastos sueltos de Cash Flow sin factura; (e) revisar `delComprobante` y el revertir "revisado" por si borran/limpian la línea de caja.

### 👤 Sueldos con factura de honorarios (2 Oct 2026)

**Motivación:** Daniela Postigo, Florencia Bustamante, Agustín Cima y Oscar Farah facturan sus honorarios; el sueldo y la factura se pagaban por separado y podían duplicarse. Todo se vincula por **CUIT, 11 dígitos sin guiones** (decisión de Tomás: el CUIT es la clave en todo el panel).

- **Ficha del empleado:** campo `cf_empleados.cuit` (se guarda normalizado; valida 11 dígitos).
- **Pagar un sueldo** (Sueldos → Pagar): si el empleado tiene CUIT, el modal lista sus facturas pendientes (revisadas/pendientes, de la misma sociedad), propone la del período y avisa si el monto difiere del mensual. Elegir una factura → se paga **esa factura** por `registrarPagoFactura` (un solo movimiento de banco/caja y un solo asiento: no se genera el asiento de sueldo para no duplicar) y el mes queda marcado pagado y vinculado (`cf_pagos_empleados.comprobante_id`). Sin factura → pago directo de sueldo, como antes.
- **Con retenciones (Oscar):** botón "📄 Necesita orden de pago" vincula la factura al mes y abre el generador de OP; si la factura ya tiene una OP pendiente, al confirmar se abre 💸 Pagar OP. El mes se marca pagado cuando se paga la orden.
- **Al revés:** pagar la factura desde Comprobantes / Pagar OP marca el mes de sueldo del empleado con ese CUIT (`_sueldoSincronizarPago`; período = mes de la fecha de la factura, no pisa un mes ya pagado).
- Desmarcar un mes vinculado a factura solo quita la marca de Sueldos (avisa; el pago de la factura no se revierte).
- Probado con 18 controles sobre una base simulada.

**SQL pendiente (correr en Supabase SQL editor antes de usar):**
```sql
ALTER TABLE cf_empleados ADD COLUMN IF NOT EXISTS cuit text;
ALTER TABLE cf_pagos_empleados ADD COLUMN IF NOT EXISTS comprobante_id uuid REFERENCES comprobantes_compra(id) ON DELETE SET NULL;
```
**Pendiente:** cargar el CUIT de los 4 desde ✎ en Sueldos.

### 🧾 Catálogo de productos de Finnegans (2 Oct 2026)

**Motivación:** los productos del formulario de facturas estaban fijos en el HTML (18 opciones) y se desactualizaban respecto de Finnegans (el catálogo real tiene 49). **El Excel de importación usa el CÓDIGO del producto** (columna PRODUCTO), no el nombre; los códigos y nombres a veces difieren (ej. nombre "Asesoramiento de logistica y eventos" → código `LOGISTICA`; nombre "Asesoramiento técnico y transferencia de Know How…" → código `ASESORAMIENTO`) y hay un typo real en un código de Finnegans (`Varios materiales construccióin 21%`) que hay que respetar tal cual.

- Tabla `productos_finnegans` (`codigo` único, `nombre`, `stockeable`, `uso` compra/venta/interno, `iva` 21/10.5/27/exento/nograv/null, `activo`). `sql_productos_finnegans.sql` la crea y carga los 49 del export del 2/10/2026 (**correrlo en Supabase**).
- Las opciones fijas del formulario **se mantienen** (todas existen en el catálogo, verificado por código); el catálogo suma debajo un grupo **"Otros productos de Finnegans"** en cada select según su IVA (los de IVA sin definir aparecen en 21%, 10,5% y exento). Los de `uso` venta/interno (Cursos, Suscripción, Saldos iniciales, percepciones, TESTDELETE…) no aparecen en compras. Sin la tabla, todo sigue como antes.
- Botón **🔄 Productos Finnegans** (Comprobantes, solo admin): se sube el export de Finnegans (PDF o Excel con Nombre/Código/Stockeable), muestra qué es nuevo / cambió / ya no está (con opción de desactivar) y aplica. El lector de PDF funciona aunque el PDF venga rotado; probado con el export real (49/49). Los productos nuevos se clasifican por el nombre (IVA, compra/venta); se corrige a mano en la tabla si hace falta.
- **A confirmar con Tomás:** (1) para las facturas C de honorarios (Daniela, Florencia, Agustín, Oscar), ¿el producto correcto es `honorarios profesionales` y va en neto exento? Hoy `sugerirProductosFinn` mapea "honorarios" a `ASESORAMIENTO`; (2) el IVA de los productos genéricos sin tasa en el nombre (seguros, peajes, reparación, etc.).

---

## Notas técnicas críticas

1. **Token Facebook (permanente via System User):** `META_FB_PAGE_TOKEN` ya no vence. Se generó mediante Usuario del Sistema en Meta Business Suite:
   - **Meta Business Suite** → Configuración → Usuarios → Usuarios del sistema → "Panel Metanoia" (Admin)
   - Asignar activos: página Metanoiasme.ok con todos los permisos
   - Asignar app: **Configuración → Apps → Panel control → Asignar personas** (seleccionar "Panel Metanoia")
   - Generar token con expiración **"Nunca"** y permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_manage_insights`, etc.
   - Con ese System User token, llamar a `GET https://graph.facebook.com/v21.0/me/accounts?access_token=TOKEN` → copiar el `access_token` de la página Metanoiasme.ok del JSON de respuesta (es el token permanente de la page)
   - Pegar ese page token como `META_FB_PAGE_TOKEN` en Supabase → Edge Functions → Secrets
   - **NOTA:** Si se pierde el token o se regenera, repetir el paso "Generar token" desde el mismo System User (no hay que crear uno nuevo).

2. **Token Instagram:** `META_ACCESS_TOKEN` generado desde developers.facebook.com → Casos de uso → API de Instagram → Generar token.

3. **CSS roles:** El sistema de permisos usa `body.rol-X` classes + CSS `!important`. NO usar JS `element.style.display` para controlar visibilidad de nav items de roles — el CSS lo overridea correctamente.

3b. **`onclick="..."` con strings dinámicos:** NUNCA usar `JSON.stringify(texto)` directo dentro de un atributo `onclick` doble-comillado — `JSON.stringify` siempre envuelve el string en comillas dobles literales, que cortan el atributo ahí mismo y dejan el handler con JS incompleto (`SyntaxError: Unexpected end of input`, sin ningún error visible en el panel — pasa con cualquier valor, no es un caso raro). El escape correcto es comillas simples + backslash literal para apóstrofes: `'${esc(texto).replace(/'/g,"\\'")}'`. La entidad HTML `&#39;` (usada en varios botones ya existentes: `abrirChatColaborativo`, `cargarChatCurso` desde el listado, invitaciones de chat, conversaciones internas) **no sirve** para esto — decodifica de vuelta a comilla simple real antes de que el navegador compile el handler, así que no protege el string JS interno si el nombre/usuario tiene un apóstrofe.

4. **index.html monolítico:** Todo el código está en un solo archivo. Buscar secciones con `<!-- ══ NOMBRE ══ -->` comentarios. Las funciones JS están al final del archivo.

5. **GitHub Actions:** No hay CI/CD automático — deploy manual via `git push`.

6. **LinkedIn apps:** Hay DOS apps en LinkedIn Developers:
   - "Panel Metanoia" (Client ID: 777fx285cpfz1s) — Share on LinkedIn, para posting futuro
   - "Metanoia CMS" (Client ID: 77fn5v3ziq376h) — Community Management API (pendiente aprobación)

7. **Darwin AI:** Integración futura con api.getdarwin.ai — contacto: Octavio Marquez. Objetivo: hub de comunicaciones (ver y responder consultas desde el panel).

8. **gstack:** Instalado en `~/.claude/skills/gstack/`. Comandos disponibles: `/gstack-review`, `/gstack-qa`, `/gstack-investigate`, `/gstack-health`.

---

## Patrones de seguridad (obligatorios para nuevos agentes y módulos)

### Edge Function — JWT validation (toda función llamada desde el panel)
```typescript
const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Validar JWT del usuario
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  // Resto de la función con service role para queries...
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
```

### Frontend — llamar Edge Function (usar authToken, no KEY)
```javascript
const res = await fetch(`${SB}/functions/v1/nombre-funcion`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken||KEY}` },
  body: JSON.stringify({ ... })
});
```

### Edge Function — webhook Meta (verificación X-Hub-Signature-256)
```typescript
const rawBody = await req.text();
const appSecret = Deno.env.get("META_APP_SECRET");
if (appSecret) {
  const signature = req.headers.get("X-Hub-Signature-256") || "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  if (signature !== expected) return new Response("Forbidden", { status: 403 });
}
const body = JSON.parse(rawBody);
```

### Frontend — insertar datos en innerHTML (siempre escapar)
```javascript
// MAL — vulnerable a XSS:
el.innerHTML = `<div>${dato}</div>`;

// BIEN — usar esc() siempre con datos de BD o input de usuario:
el.innerHTML = `<div>${esc(dato)}</div>`;
```

### RLS — nueva tabla (siempre habilitar al crearla)
```sql
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON nueva_tabla FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Confirmado por Tomás (2 Oct 2026, pantallas de Finnegans):** `honorarios profesionales` = IVA 0% (cuenta de compras "Honorarios profesionales") → va en **neto exento** para las facturas **C** de Daniela, Florencia y Agustín; `Asesoramiento profesional` = IVA 21% (mismo rubro contable) → factura **A** de Oscar (abogado). `sugerirProductosFinn` ahora lo propone solo: si el CUIT es de un empleado activo o el concepto dice "honorarios", factura C → exento/`honorarios profesionales`, factura A → 21%/`Asesoramiento profesional` (se re-sugiere al cambiar el tipo de factura). Pendiente: IVA de los productos genéricos (lista enviada a Tomás para que informe la tasa de cada uno).

**IVA del catálogo definido por Tomás (2 Oct 2026):** 21% → Asesoramiento financiero, ELEMENTOS DE SIMULACIÓN, Logistica y fletes, Prestación de servicio de catering…, Reparación automotor, SEGUROS, Servicio de aislación, Servicio de consultoria…, mantenimiento de cuenta, peajes. Exento (IVA 0) → Varios representacion/marketing, prestamos. Con esto ningún producto de compras queda sin IVA y cada uno aparece solo en el select que le corresponde.

### 🧮 Retención de Ganancias según la tabla oficial de ARCA — RG 830 (2 Oct 2026)

**Motivación:** Tomás mostró cómo Finnegans retiene a Oscar Farah (OP-33: neto $600.000 → retención $59.310) y pidió actualizar las tasas con el simulador de ARCA (https://servicioscf.afip.gob.ar/calc-rg830/). **El panel calculaba mal:** aplicaba `base × % fijo` (honorarios 6% = $36.000 contra $59.310 correctos), sin monto no sujeto, sin escala, sin mínimo y sin acumular los pagos del mes. Además los códigos viejos (029, 031, 079, 011, 028, 093) no son los del régimen. **Ninguna OP emitida hasta hoy llevó retención** (todas con código vacío y 0%), así que el cambio no toca historial.

- **Tablas nuevas** `rg830_conceptos` (24 regímenes: código, concepto, % inscripto, % no inscripto humana/jurídica, monto no sujeto, mínimo) y `rg830_escala` (8 tramos mensuales), cargadas desde el simulador con `sql_rg830_ganancias.sql` (**correrlo en Supabase**). Sin las tablas, la OP sigue con el catálogo viejo.
- **Reglas, verificadas contra el simulador en 7 casos + 27 puntos de la escala:** base = pagos del mes + este pago · los **inscriptos descuentan el monto no sujeto, los no inscriptos NO** · % fijo o, si el % es 0 ("s/escala": profesiones liberales, comisionistas, corredores, derechos de autor, albaceas/directores), **escala mensual 5/9/12/15/19/23/27/31%** (tramos de $71.000, $71.000, $71.000, $71.000, $142.000, $142.000, $284.000 y el resto) · a retener = total − retenido antes en el mes · si es menor al **mínimo ($240; $1.020 inmuebles urbanos)** no se retiene.
- **Orden de pago:** el select ahora lista los regímenes oficiales (p. ej. `119 — Profesiones liberales, oficios`, `94 — Locaciones de obra y/o servicios`); se agregaron **Situación en Ganancias** (inscripto / no inscripto) y **Tipo de persona** (por defecto según el CUIT: 20/23/24/27 humana, 30/33/34 jurídica); el % pasa a ser el efectivo y se muestra el detalle del cálculo (base, no sujeto, imponible, escala, retenido antes). Los pagos del mes se suman solos buscando OP del mismo CUIT, sociedad, régimen y mes.
- **Actualizar los valores** (el monto no sujeto, la escala y los mínimos se actualizan por inflación, hoy semestralmente): abrir el simulador, correr en la consola `listaconceptos` (los 75 conceptos con su `MONTO_NO_SUJETO`, `PORCENT_A_RETENER`, `MONTO_MINIMO`) y consultar `default.aspx/CalcularRetencion` con id_alicuota 73 para reconstruir la escala; regenerar `sql_rg830_ganancias.sql`. Valores vigentes al 2/10/2026: no sujeto profesiones liberales $160.000, locaciones $67.170, bienes $224.000, alquileres $11.200.
- **Pendiente:** que Tomás defina qué proveedores se retienen y con qué régimen (nadie se retuvo hasta ahora) — ej. Oscar Farah (factura A) → `119`. Retención de IIBB (Salta) y SUSS no se tocaron.

### 📒 Proveedores por CUIT, estado de cuenta del ejercicio y circularización (2 Oct 2026)

**Motivación:** de 343 facturas, 271 no estaban vinculadas a ningún proveedor del maestro (solo había 15 proveedores). Decisión de Tomás: **todo se maneja por CUIT**, y **lo cerrado (ejercicio anterior al 30/06) no se toca**.

- **Datos corregidos (script, con respaldo en `backups/`):** se crearon **42 proveedores** nuevos (los CUIT con facturas abiertas que no estaban en el maestro; quedan `revisado=false` para revisar IIBB y email; condición de IVA inferida del tipo de factura: A → responsable inscripto, C → monotributo) y se vincularon **118 facturas** no cerradas por `proveedor_maestro_id`. Las 174 cerradas quedaron como estaban. **Sin vincular (4):** 3 con CUIT de dígito verificador inválido (`Productos Quimicos Salta SRL`, y 2 de `JACARANDA SA` cuyo CUIT correcto es 33-61122668-9) y 1 sin CUIT (`Blas Rovaletti`) → corregir el CUIT en la factura (afecta el Excel a Finnegans). Se anularon 2 órdenes de pago "pendientes" viejas (restos del modelo anterior; respaldo en `backups/ops_borrador_anuladas_20261002.json`).
- **Disparador en la base** (`sql_proveedores_circularizacion.sql`): toda factura nueva se vincula sola al proveedor por CUIT y, si no existe, lo crea "sin revisar" (valida el dígito verificador; cubre formulario, ARCA, WhatsApp e IA).
- **📒 Estado de cuenta** (Comprobantes, solo admin): por sociedad y ejercicio (01/07–30/06), por proveedor: facturado, notas de crédito, pagado (con retenciones), saldo; detalle de comprobantes al tocar la fila; **control contra los libros** (cuenta 2.1.01.001); exporta a Excel. Saldo = (facturado − pagado) − (NC − NC cobradas); un pago cancela la factura completa (transferido + retención). **Verificado con datos reales:** SUDES cuadra con los libros al centavo.
- **✉️ Circularización v2:** usa el mismo cálculo (resta NC, excluye las sociedades propias, p. ej. SUDES SAS en POINTERS), por sociedad y ejercicio; el correo trae el resumen del ejercicio y la tabla de comprobantes que componen el saldo; se puede escribir el email faltante ahí mismo (se guarda en Proveedores); queda registrada en `circularizaciones` y se carga la respuesta (conforme / con diferencia + saldo del proveedor) tocando la etiqueta ✉️ del estado de cuenta. **Redeployar `enviar-circularizacion`** (supabase/functions/enviar-circularizacion/index.ts).
- 🐛 **Bug contable corregido:** las **notas de crédito nunca generaban asiento de devengado** (el código las excluía). En POINTERS la NC-A 0002-00000001 de SUDES SAS ($37.625.055,66, anula la factura 0002-00000081 "Préstamo de echeq") dejaba los libros con un gasto y una deuda de más: la diferencia del control era exactamente ese monto. Nuevo `_lineasDevengado(c)` (la NC es el asiento invertido: Debe Proveedores / Haber Gasto e IVA) para revisar y para 🔄 Generar históricos. **Pendiente: correr 🔄 Generar históricos** para generar el asiento de esa NC; después el control de POINTERS debe dar 0.
- Datos del ejercicio 2026/27 al 2/10/2026: SUDES 29 proveedores con $22,0M de saldo; POINTERS 25 proveedores con $63,3M (incluye $20,5M con SUDES SAS, empresa vinculada, y $20,9M con CIGI Motos).

### ✉️ Pago de orden de pago: comprobante, mail al proveedor y certificado de retención (2 Oct 2026)

**Motivación:** Tomás probó la OP de Oscar Farah (retención $59.310 correcta) y pidió automatizar el mail: al pagar la orden, que pida el comprobante de pago (PDF o foto) y mande al proveedor el comprobante + la OP + el certificado de retención.

- **💸 Pagar OP** pide el **comprobante de pago** (PDF hasta 4 MB o foto, que se reduce a 1600 px/JPEG) — obligatorio salvo la casilla "Pagar sin comprobante (efectivo u otro caso)" — y el **email del proveedor** (precargado del maestro; si se escribe uno nuevo se guarda en Proveedores; casilla para no enviar). Se valida todo antes de registrar el pago.
- **Certificado de retención** (`generarPDFCertificadoRetencion`): constancia con agente de retención, sujeto retenido, régimen, comprobante, base, alícuota efectiva e importe retenido; se genera solo si hubo retención.
- **Mail** (edge function `enviar-pago-proveedor`, **redeployar**): adjunta comprobante de pago, orden de pago y certificado; además guarda el comprobante en el bucket privado `comprobantes-pago` (con service role: evita el bug de RLS de Storage del navegador) y su ruta en `ordenes_pago.comprobante_pago_path`. **SQL: `sql_comprobante_pago.sql`.**
- 🐛 **Bug heredado corregido:** el PDF de la OP se adjuntaba mal — `jsPDF` entrega `data:application/pdf;filename=generated.pdf;base64,…` y la función solo quitaba `data:application/pdf;base64,`, así que el adjunto podía llegar corrupto. Ahora se limpia en el cliente y en la función.
- **Sueldos:** la ficha de cada persona con CUIT muestra **💸 Pagar OP** cuando tiene una orden de pago pendiente (antes, al pasar la factura a OP pendiente, "desaparecía" de Sueldos); al pagar la OP el mes de sueldo se marca solo y la pantalla se actualiza. Los CUIT de Daniela, Florencia, Oscar y Agustín estaban vacíos en la base: se cargaron desde el maestro de proveedores (por coincidencia de nombre, confirmado).
- **Préstamo de POINTERS a SUDES por el eCheck de $37.625.055** (rescate de Avantia del 07/07/2026, usado para pagar simuladores Delec): se registró en Cash Flow → Préstamos (SUDES, "POINTERS SAS (empresa vinculada)", saldo $37.625.055, **sin cuotas y fuera de la proyección de caja**). Reemplaza a la factura A 0002-00000081 de SUDES SAS a POINTERS, que se elevó a ARCA sin querer y se anuló con la NC-A 0002-00000001 (se netean). **Pendiente de la contadora:** el asiento intercompany (en POINTERS: Préstamo a SUDES contra Inversiones; en SUDES: contra lo que corresponda a la compra de simuladores — la factura de Delec no figura cargada en SUDES). Las inversiones (Avantia) todavía no tienen asientos (la cuenta 1.1.04.001 no tiene movimientos).

---

## 📌 Cierre de jornada — viernes 2 Oct 2026 (retomar el lunes 5 Oct)

**Hecho hoy (todo en producción salvo lo marcado):** pago único de facturas y OP como instrucción · limpieza de 149 líneas de caja heredadas · sueldos con factura por CUIT · catálogo de productos de Finnegans (49) con importador · retención de Ganancias RG 830 con la tabla oficial de ARCA · 42 proveedores creados y 118 facturas vinculadas por CUIT · estado de cuenta de proveedores por ejercicio + circularización v2 · notas de crédito con asiento de devengado · OP: comprobante de pago + mail al proveedor con OP y certificado de retención · préstamo POINTERS→SUDES ($37.625.055) en Cash Flow.

**A correr / hacer por Tomás (en este orden):**
1. SQL en Supabase: `sql_proveedores_circularizacion.sql` (tabla `circularizaciones` + disparador por CUIT) y `sql_comprobante_pago.sql` (columna + bucket `comprobantes-pago`). Ya corridos: Sueldos (`cf_empleados.cuit`, `cf_pagos_empleados.comprobante_id`) y `sql_productos_finnegans.sql`. **Falta confirmar:** `sql_rg830_ganancias.sql` (si la OP de Oscar dio $59.310, ya está corrido).
2. Redeploy de Edge Functions: `enviar-pago-proveedor` (adjuntos + Storage), `enviar-circularizacion` (detalle del saldo). Siguen pendientes de verificar los deploys viejos (`agente-mensajes`, funciones con conteo de tokens).
3. 🔄 **Generar históricos** (Impuestos → Libro Diario): genera el asiento de la NC-A 0002-00000001 de SUDES SAS ($37,6M) y las cuotas de préstamo / pagos con Visa pendientes. Después el **control contra libros de POINTERS** (📒 Estado de cuenta) debe dar diferencia 0.
4. Probar el circuito con una orden real chica (mail propio como proveedor): llegan comprobante + OP + certificado.
5. Cargar emails de proveedores (los 42 nuevos no tienen) y corregir los 4 CUIT inválidos/vacíos en facturas (Productos Químicos Salta, 2 de JACARANDA → 33-61122668-9, Blas Rovaletti).
6. Importar extractos jul/ago/sep de SUDES y POINTERS; cerrar julio, agosto y septiembre en 🔒 Cierre de mes; renovar certificado MiPyME de SUDES (vence 31/10).
7. Definir con la contadora: a quién se retiene Ganancias y con qué régimen (nadie se retuvo hasta hoy; Oscar → 119) · asiento del préstamo intercompany POINTERS→SUDES (la factura de Delec no está cargada en SUDES; las inversiones de Avantia no tienen asientos) · tratamiento de la NC por el "préstamo de echeq".

**Pendientes de desarrollo (por prioridad):**
- Fase 3 contable: ventas/cobros (`devengado_venta`/`cobro_venta`) — espera el token Sanctum del técnico (`ELEARNING_API_TOKEN`) y el SQL `elearning_*`.
- Cuenta en dólares (cuenta contable USD + importar esa cuenta del extracto).
- Asientos de inversiones (Avantia): hoy no hay ninguno en la cuenta 1.1.04.001.
- Rol `contable` de solo lectura (esperando la reunión con Auren) y numeración estilo Tango.
- Ver el comprobante de pago guardado desde el historial de OP (hoy solo se guarda la ruta en `ordenes_pago.comprobante_pago_path`).
- IIBB de Salta y SUSS en la orden de pago (solo está Ganancias).
- Revisar que "Varios construcción" salga solo en el select de 21% (hoy también aparece en 10,5% por ser opción fija del HTML).

**Backups de datos tocados hoy** (en `backups/`): `caja_auto_comprobantes_20261002.json`, `ops_borrador_anuladas_20261002.json`, `proveedores_creados_20261002.json`.

### 🔧 Mail del pago de OP no salía (5 Oct 2026) — función nunca desplegada

**Síntoma:** al pagar una OP y apretar enviar, el panel avisaba que no se pudo enviar el email al proveedor.
**Causa verificada contra Supabase:** la edge function **`enviar-pago-proveedor` devuelve 404 (no existe en el proyecto)**. Las otras 36 funciones del repo sí están desplegadas. El 1 Oct la Automatización C figuraba como "deployada" en este archivo, pero esa función nunca se creó en el dashboard. Un 404 del gateway no trae CORS, por eso el navegador lo muestra como "Failed to fetch". Además falta correr `sql_comprobante_pago.sql` (la columna `ordenes_pago.comprobante_pago_path` y el bucket `comprobantes-pago` no existen).
**Qué se hizo:** (1) el panel ahora explica el error ("no responde la función de envío… el pago quedó registrado") y (2) botón **✉️ Reenviar** en Comprobantes para facturas pagadas con OP: pide el email y, opcional, el comprobante, y manda OP + certificado + comprobante. La función se probó localmente con un correo simulado (11 controles: adjuntos, nombres seguros, PDF sin prefijo `filename=generated.pdf`, guardado en el bucket, casos sin email/sin sesión).
**Pendiente de Tomás:** crear la función en Supabase → Edge Functions → *Deploy a new function* → nombre exacto `enviar-pago-proveedor` → pegar `supabase/functions/enviar-pago-proveedor/index.ts` (usa los secrets `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` que ya usa `enviar-diplomas`); correr `sql_comprobante_pago.sql`; cargar el email de los proveedores (Farah no tiene). Después reenviar el mail de la OP de Auren (OP-202610-9220, la que se pagó en la prueba) con ✉️ Reenviar.
**Estado de órdenes al 5 Oct:** OP-202610-9220 (Auren) pagada con retención $64.008,60; OP-202610-0254 (Farah) sigue pendiente de pago (retención $59.310).
**Lección:** verificar los deploys pegándole a la función (`POST /functions/v1/<nombre>` sin sesión: 401 = existe, 404 = no existe) en vez de confiar en lo anotado.


---

## 🌐 Cambio de dominio del panel — ANÁLISIS GUARDADO, SIN EJECUTAR (5 Oct 2026)

**Estado:** Tomás consiguió dominio propio para que el panel deje de llamarse `tomaslarran.github.io/METANOIASMX`. **Decisión: esperar a la reunión de equipo antes de hacer nada.** No se tocó ninguna función, ni el DNS, ni GitHub. Retomar cuando el equipo defina el dominio.

**Datos relevantes**
- Tienen **dos dominios en DonWeb** y la idea es **mantener ambos registrados** para que nadie más los use: `metanoiasme.com` (con **e**, el nuevo) y `metanoiasmx.com` (con **x**, el del correo `@metanoiasmx.com` y de `plataforma.metanoiasmx.com`). El DNS de ambos se administra en DonWeb.
- `metanoiasme.com` **ya tiene un sitio web** (Apache en DonWeb, IP 66.97.40.106) y el correo va por **Google Workspace** (MX `aspmx.l.google.com`): **no tocar la raíz, `www` ni los MX**. `panel.metanoiasme.com` está libre.
- **Decisión pendiente (reunión):** cuál dominio usa el panel. `panel.metanoiasmx.com` sería coherente con el correo y la plataforma; `panel.metanoiasme.com` ya está conseguido y no choca con nada. El otro queda de reserva (opcional: redirección en DonWeb hacia el principal). Anotar vencimiento y renovación automática de ambos.
- Con dominio propio **no hay redirección**: la barra muestra siempre `panel.<dominio>`. La única redirección es la inversa (GitHub manda la dirección vieja `github.io` a la nueva). Se usa un **CNAME** (no una "redirección" de DonWeb).

**Qué se rompería si se cambia solo el DNS:** **32 edge functions** tienen `Access-Control-Allow-Origin` fijo en `https://tomaslarran.github.io`; con el dominio nuevo el navegador bloquea todas sus respuestas y el panel deja de funcionar en cada acción que las llama. Además `invitar-usuario` y `recuperar-password` tienen la dirección vieja en `REDIRECT` (mails de invitación / recuperar contraseña) y Supabase Auth necesita la URL nueva. El panel en sí (`index.html`, `manifest.json`, `sw.js`) **no** tiene la dirección escrita. Las funciones con `*` (`sync-instagram`, `sync-linkedin`) y las 3 sin CORS (`agente-ejecutivo`, `agente-mensajes`, `whatsapp-agente`) no se tocan. Webhooks de Meta, Twilio y la plataforma de cursos apuntan a Supabase: no cambian.

**Plan en orden (cero cortes: la dirección vieja sigue andando hasta el final)**
1. **Código (lo prepara Claude):** `tools/cambio_dominio_mk_cors.js` (preparado, **no ejecutado**) convierte las 32 funciones a un CORS por pedido que acepta ambas direcciones: `corsBase` + `corsPara(req)` con `ORIGENES_PERMITIDOS` leído del secret `ORIGENES_PERMITIDOS` (por defecto la vieja + `https://panel.metanoiasme.com`; **ajustar al dominio elegido antes de correrlo**) y `REDIRECT` de los mails leído del secret `PANEL_URL`. Verificar con una prueba local (OPTIONS con distintos `Origin`) antes de subir.
2. **Redeployar las 32 funciones:** a mano desde el dashboard de Supabase, o con una orden desde la PC (`npx supabase functions deploy <nombre> --project-ref jppxmdvddvbsvymogvcp --use-api`, requiere un Personal Access Token de Supabase; no probado). **Cuidado:** redeployar solo las 32 con CORS (hoy tienen "verify JWT" activo); no redeployar las 3 de webhook sin CORS porque perderían su configuración sin JWT.
3. **DonWeb → Zona DNS del dominio elegido:** agregar un registro **CNAME** `panel` → `tomaslarran.github.io.` (sin tocar nada más).
4. **GitHub → Settings → Pages → Custom domain:** poner `panel.<dominio>`; esperar el certificado HTTPS (minutos a ~1 h) y tildar *Enforce HTTPS*. (Recién acá se crea el archivo `CNAME` del repo: **no agregarlo antes** de que el DNS responda, o la dirección vieja redirige a una que todavía no existe.)
5. **Supabase → Authentication → URL Configuration:** *Site URL* = dirección nueva y agregar ambas a *Redirect URLs*; cargar el secret `PANEL_URL`.
6. **Avisar al equipo:** todos vuelven a iniciar sesión (la sesión es por dirección), quien tenga el panel instalado como app lo reinstala desde la nueva, y se reinician las preferencias del navegador (modo claro/oscuro). Elegir un momento tranquilo.
7. Cuando todos migraron, opcional: sacar la dirección vieja de `ORIGENES_PERMITIDOS` (cambiando el secret, sin redeploy).

**Beneficio extra:** `manifest.json` (`start_url: "/"`) y `sw.js` (`ASSETS: '/', '/index.html'`) están pensados para un sitio en la raíz; con dominio propio la instalación como app anda mejor que hoy.

**Esfuerzo estimado:** código 30 min (Claude) · redeploy de funciones entre 20 min (CLI) y 1–2 h (a mano) · DNS + GitHub 15 min + espera del certificado · Supabase Auth 2 min.

### ⚠️ Pendiente aparte: publicación de GitHub Pages trabada (5 Oct 2026)
Los commits `6314e63` (botón ✉️ Reenviar comprobante de pago + aviso claro si falla la función) y `dd7150e` (commit vacío para relanzar) **no se publicaron**: las ejecuciones de "pages build and deployment" se cancelaron por un **incidente de GitHub Actions** (activo ese día). El sitio sigue en `sw.js` v62. Cuando GitHub se normalice: abrir la ejecución fallida → **Re-run all jobs** (o subir otro commit), esperar a ver `metanoia-v63` en `https://tomaslarran.github.io/METANOIASMX/sw.js`, recargar el panel con Ctrl+Shift+R y probar ✉️ Reenviar con la factura de Auren (00001-00001017, OP-202610-9220). La función `enviar-pago-proveedor`, la columna `comprobante_pago_path` y el bucket `comprobantes-pago` ya están en Supabase (verificado).


### ✅ Mail de pago de OP — RESUELTO Y VERIFICADO (7 Oct 2026)
- `enviar-pago-proveedor` quedó **desplegada con el código nuevo** del repo (la primera copia pegada era una versión vieja que solo adjuntaba la OP). Probado por Tomás con ✉️ Reenviar sobre la OP de Auren (OP-202610-9220): **llegan los 3 adjuntos** (comprobante de pago, orden de pago y certificado de retención).
- Panel publicado en **v64**: botón ✉️ Reenviar (Comprobantes, facturas pagadas con OP) y aviso rojo automático si la función desplegada es una versión vieja (la nueva responde `{enviado, comprobante_path}`, la vieja solo `{ok:true}`).
- Las publicaciones de GitHub Pages del 5 Oct fallaron por un incidente de Actions; se resolvió relanzando con un commit vacío una vez normalizado GitHub. Si vuelve a pasar: *Re-run failed jobs* o commit vacío, y comprobar la versión en `sw.js` del sitio.
- Ya no queda pendiente de este tema: solo cargar el email de los proveedores que falten (Farah no tiene) y probar "Pagar OP" con una orden real (exige comprobante y lo guarda en el bucket `comprobantes-pago`).


### 🧾 Ingresos Brutos (IAE Salta): categorías de proveedores y calendario DGR 2026 (7 Oct 2026)

**Categorías en Proveedores → Situación IIBB** (8, lista única `IIBB_SITUACIONES` en `index.html`; decididas con Tomás el 7/10/2026 al unificar duplicadas): local de Salta inscripto (`contribuyente_directo`) · Convenio Multilateral con alta en Salta, régimen general (`convenio_multilateral`) · CM régimen especial arts. 6–13 (`cm_regimen_especial`) · sin alta en Salta, de otra provincia o CM sin Salta (`sin_alta_salta`) · Régimen Simplificado del IAE (`regimen_simplificado`) · exento / no gravado / promoción 100% (`exento`) · no inscripto (`no_inscripto`) · no contribuyente (`no_contribuyente`). **Certificado de no retención/percepción** = campo aparte con fecha de vigencia (`proveedores.iibb_cert_no_retencion_hasta`), no una categoría. Inicio de actividades reciente se anota en observaciones.
**Fuentes:** RG DGR Salta **08/2018** (retención: CM régimen general — retiene sobre el 50% de la base —, CM regímenes especiales, locales no inscriptos y sujetos de otra jurisdicción que venden en Salta; regla general 3,6% salvo alícuota diferencial menor; **no inscriptos: triple alícuota y sin mínimo**) y RG DGR Salta **10/2025** (percepción vía SIRCIP: padrón con alícuota por sujeto; sin alta en Salta 1%; fuera del padrón 2%; **excluidos:** exentos/no gravados, promoción 100%, inicio de actividades reciente, certificado de no percepción y Régimen Simplificado). La alícuota exacta de cada proveedor sale del padrón de la DGR, no de la categoría.
⚠️ **SQL a correr (la base rechaza valores nuevos):** `sql_proveedores_iibb.sql` amplía `proveedores_situacion_iibb_check`, crea la columna `iibb_cert_no_retencion_hasta` y además agrega `regimen_simplificado` a `proveedores_condicion_iva_check` (la opción "Régimen Simplificado" de condición de IVA ya estaba en el panel y la base la rechazaba). Hasta correrlo, guardar un proveedor con una categoría nueva falla.
**Confirmado por Estela (contadora), 7/10/2026:** SUDES y POINTERS son **contribuyentes locales de Salta** y **NO son agentes de retención de la DGR**. Consecuencias: (1) **no hay que retener IIBB a proveedores** en la orden de pago (la categoría de cada proveedor sirve solo como dato fiscal); (2) las DDJJ informativas/determinativas de agente de retención de la agenda DGR **no aplican**; solo corren los anticipos mensuales del IAE (ya cargados en `calendario_impositivo`). **Pendiente:** cargar la categoría de los 46 proveedores que siguen "sin definir" (los 42 creados por CUIT están sin revisar). El panel no calcula retención de IIBB en la orden de pago (solo Ganancias) y, según lo anterior, no hace falta.

**Vencimientos del Impuesto a las Actividades Económicas 2026 — anticipos mensuales** (RG DGR Salta 23/2025; "Contribuyentes comunes — jurisdiccionales y de Convenio Multilateral"; se define por el **último dígito del CUIT**; en la agenda de la DGR la presentación de la DDJJ del anticipo y el pago figuran en la **misma fecha**):
- **SUDES** (30-71699117-9, dígito 9 → grupo 8-9): Anticipo 09/2026 **mar 20/10/2026** · 10/2026 **mié 18/11/2026** · 11/2026 **lun 21/12/2026** · 12/2026 **mié 20/01/2027**. Ya vencidos 2026: 20/01 (12/2025), 23/02, 18/03, 20/04, 20/05, 19/06, 20/07, 20/08, 18/09.
- **POINTERS** (30-71696585-2, dígito 2 → grupo 0-1-2): Anticipo 09/2026 **jue 15/10/2026** · 10/2026 **vie 13/11/2026** · 11/2026 **mar 15/12/2026** · 12/2026 **vie 15/01/2027**. Ya vencidos 2026: 15/01 (12/2025), 13/02, 13/03, 15/04, 15/05, 16/06, 15/07, 14/08, 16/09.
- Si fueran **agentes designados**: DDJJ informativa mensual de retenciones/percepciones — SUDES 13/10, 10/11, 11/12/2026, 12/01/2027; POINTERS 08/10, 06/11, 09/12/2026, 08/01/2027; y "Agente de Retención (DDJJ determinativa, informativa y pago)" 15/10 (período sept.), 16/11 (oct.), 15/12/2026 (nov.).
- ✅ **Cargados el 7/10/2026 en `calendario_impositivo`** (tipo "IAE Salta — VENCE en DGR (presentación y pago)", anticipos 09–12/2026 de ambas sociedades; los botones dicen "Presentado y pagado"; aparecen en Impuestos → Calendario Auren, dashboard y calendario). Las fechas tope de Auren (anteriores) siguen aparte.
- ⚠️ **El panel asume mal estos vencimientos:** la alerta de Impuestos usa "IVA e IIBB vencen el 20 del mes siguiente" (hardcodeado) y no la fecha por terminación de CUIT. Propuesta pendiente: cargar estas fechas en `calendario_impositivo` (el calendario de Auren) o leerlas de la agenda de la DGR.
- **Cómo volver a consultarlo:** la agenda de la DGR (https://www.dgrsalta.gov.ar/Inicio/Agenda) lee un servicio público: `GET https://api-test2.dgrsalta.gov.ar/agenda-impositiva-items?filter={"offset":0,"limit":3000,"skip":0}` devuelve todos los ítems (campos `fecha`, `titulo`, `resumen`, la fecha viene en UTC = 00:00 hora Salta + 3 h); se filtra por `resumen` que contenga "Contribuyentes y/o responsables Comunes y SARES 2000" y "terminado en … <dígito>". Verificado el 7/10/2026 contra la agenda en pantalla.

### 🧾 VEP → deuda en libros y cancelación con el pago / el banco (7 Oct 2026)

**Pedido de Tomás:** al cargar un VEP debe nacer la deuda del impuesto en contabilidad y cancelarse con el pago, conciliando el movimiento bancario.

- **Al cargar el VEP** (Impuestos → VEPs): asiento `devengado_impuesto` fechado al **último día del período** (no el día de carga): Debe gasto del impuesto / Haber deuda del impuesto. **La sociedad pasó a ser obligatoria.**
- **Al pagar** (botón "Pagado", o automático al conciliar el extracto): asiento `pago_impuesto` Debe deuda / Haber Banco Macro de la sociedad, con la fecha del banco. Un VEP que se paga sin asiento previo (cargado antes de este cambio) crea primero la deuda.
- **Cruce con el extracto** (`_concCruzarModulos`): débito por el **mismo importe** (exacto, luego ±$1) y fecha entre 15 días antes y 10 después del vencimiento (si ya estaba pagado a mano, ±6 días de su fecha de pago). Al cruzar: marca el VEP pagado, lo enlaza (`banco_movimiento_id`) y no duplica el asiento si ya existía.
- **Eliminar un VEP** anula sus asientos y libera el movimiento del banco.
- **Tipos nuevos:** Cargas sociales (F.931) y SICORE (retenciones practicadas). SICORE no devenga: su deuda ya está en 2.1.03.002 y el pago la cancela directo.
- **Tabla de cuentas por impuesto** (`VEP_CUENTAS` en `index.html`, único lugar a tocar): IIBB → 5.4.01.001 / 2.1.03.005 · Ganancias → 5.4.01.002 / 2.1.03.006 · Autónomos → 5.4.01.003 / 2.1.03.007 · Cargas sociales → 5.1.01.001 / 2.1.04.002 · Otro → 5.4.01.004 / 2.1.03.008 · IVA → 2.1.03.001 / 2.1.03.004.
- ⚠️ **Criterio PROVISORIO — confirmar con la contadora:** (1) **IVA**: se asienta contra IVA Débito Fiscal sin netear el crédito fiscal (la liquidación completa necesita el lado de ventas, Fase 3); (2) **Ganancias**: un anticipo es técnicamente un activo, hoy va a gasto; (3) **IIBB**: el VEP viene neto de SIRCREB a favor, el gasto bruto quedaría subestimado.
- **SQL corrido el 8/10/2026:** `sql_vep_contabilidad.sql` (3 columnas en `impuestos_vep`, tipos `devengado_impuesto`/`pago_impuesto` en el constraint, 12 cuentas nuevas del plan: 5.4, 5.4.01, 5.4.01.001–004, 2.1.03.004–008, 2.1.04.002). Sin correrlo, el VEP se guarda igual pero avisa que no pudo generar el asiento.
- Probado con 36 controles sobre un entorno simulado (devengado, pago, no duplicar, SICORE, cuentas faltantes, eliminar, cruce con el banco). Pendiente: probar con un VEP real.
- **Ideas anotadas el 7/10 (vuelo)**, en este orden: (1) VEP ✅ · (2) pago de facturas con **cheques** y (3) **Echeq** (medio con ciclo propio: emitido → pendiente → debitado) · (4) **solicitar a ARCA la facturación electrónica de la plataforma** (hoy factura el plugin de Finnegans; Tomás quiere habilitar la propia) · (5) **curso offline**: exportar a Word con opciones para que el médico edite sin conexión y volver a subirlo, con comparación de cambios.

### 🧾 Echeq propios como medio de pago (8 Oct 2026)

**Pedido de Tomás:** pagar facturas con Echeq propios (cheque de pago diferido), cargando los datos a mano **o subiendo el PDF del Echeq para que se autocomplete, sin IA, como el extracto del Macro**. Pensado para varias cuentas: hoy Macro y, cuando se abran, ICBC en las dos sociedades.

- **Medio de pago nuevo `echeq`** (Cuentas & Caja → Agregar → "Echeq propio"): cada Echeq-medio se liga a la **cuenta bancaria que lo debita** (`medios_pago.cuenta_bancaria_id`). Para ICBC alcanza con crear la cuenta bancaria y, después, su medio Echeq. El SQL crea `ECHEQ MACRO SUDES` y `ECHEQ MACRO POINTERS`.
- **Al pagar** (💳 Pagar o 💸 Pagar OP) con ese medio aparece el bloque "🧾 Datos del Echeq": se sube el **PDF "Cheques electrónicos – detalle" del home banking** y se completan número, id, fechas de emisión y de pago, beneficiario y CUIT. Se lee en el navegador con pdf.js **por posición** (etiquetas a la izquierda, valores a la derecha; los textos largos que el banco parte en dos renglones se unen). Probado con 2 PDFs reales del Macro. También se puede cargar a mano.
- **Controles** (avisos, no bloqueos: Tomás solo revisa): el emisor es la sociedad que paga (compara el CUIT) · el importe es lo que se paga · el beneficiario es el proveedor de la factura · el estado en el banco · el banco coincide con el medio · el número no está ya registrado · fecha de pago ≥ emisión. Si hay avisos, pide confirmar.
- **Contabilidad:** al emitir, el asiento de pago de siempre pero el Haber va a **2.1.01.002 "Echeq emitidos pendientes de débito"** (no al banco). Al debitarse en el banco: asiento `debito_echeq` Debe 2.1.01.002 / Haber Banco de la cuenta ligada. En tesorería **no** se mueve la caja ni el banco al emitir.
- **Conciliación:** al importar el extracto, un débito del **mismo importe** entre 2 días antes y 7 después de la fecha de pago se cruza con el Echeq, lo marca debitado y genera el asiento (si ya estaba marcado a mano, solo lo enlaza).
- **Listado:** Cash Flow → Cuentas & Caja → **🧾 Echeq propios**: total pendiente de débito por sociedad (útil para el flujo de caja), tabla con estado, botón "✓ Debitado" manual y PDF original (guardado en el bucket `extractos-bancarios`, carpeta `echeqs/`).
- Los Echeq no se ofrecen en caja, cuotas de préstamos, devolución a socios ni pagos sueltos de Cash Flow (no recogen sus datos).
- **SQL corrido el 8/10/2026:** `sql_echeq_propios.sql` (tipo `echeq` en `medios_pago`, columna `cuenta_bancaria_id`, cuenta 2.1.01.002, tipo de asiento `debito_echeq`, tabla `echeqs_propios`, los 2 medios Macro). Sin Edge Functions nuevas ni redeploy.
- **Pendiente:** (1) **Echeq de terceros / endoso** (fase 2): el mismo lector sirve; datos a guardar al recibirlos: banco, fecha de pago/depósito, importe, librador (razón social y CUIT), número e id del cheque, CMC7, último endoso; (2) anular un Echeq emitido (reabre la factura y reversa asientos); (3) **ICBC**: crear las cuentas y medios cuando se abran; el **importador de extractos hoy solo lee el PDF del Macro**, ICBC necesitará su propio lector; (4) el PDF de los Echeq que ya se pagaron antes de este cambio no está cargado.

---

## 📌 Cierre de jornada — 7/8 Oct 2026 (retomar mañana)

**Hecho en esta sesión (todo publicado, panel en v68):**
- IIBB de proveedores simplificado a **8 categorías** + certificado de no retención con vigencia (`sql_proveedores_iibb.sql` corrido). Estela confirmó: **SUDES y POINTERS son contribuyentes locales de Salta y NO agentes de retención de la DGR** → no hay que retener IIBB a proveedores.
- **Vencimientos reales de los anticipos de IIBB (DGR)** cargados en Impuestos → Calendario Auren (POINTERS 15/10, 13/11, 15/12, 15/01/27 · SUDES 20/10, 18/11, 21/12, 20/01/27). Botón "Presentado y pagado".
- **VEP → deuda en libros y cancelación con el pago / el extracto** (sección "VEP → deuda en libros…", SQL corrido).
- **Echeq propios como medio de pago**, con lectura del PDF del banco sin IA (sección "Echeq propios…", SQL corrido).

**Pendientes para mañana, en orden:**
1. **Probar con datos reales:** cargar un VEP real (debe aparecer el asiento `devengado_impuesto` en el Libro Diario), y pagar una factura con un Echeq propio real (subir su PDF "Cheques electrónicos – detalle").
2. **Cargar en Impuestos los anticipos de IIBB de julio, agosto y septiembre** (Tomás dijo que ya están pagados; en el panel solo figura IIBB hasta junio) con la fecha real de presentación y pago.
3. **Echeq de terceros / endoso** (fase 2): el lector de PDF ya sirve. Datos a guardar al recibirlos: banco, fecha de pago/depósito, importe, librador (razón social y CUIT), número e id del cheque, CMC7 y último endoso. Reutilizar `cf_cobranzas` (hoy guarda los ECheque recibidos con estados Pendiente/Cobrado/Vencido).
4. **Confirmar con la contadora (Estela)** el criterio provisorio de los asientos de VEP: IVA (se asienta contra IVA Débito sin netear el crédito), anticipos de Ganancias (hoy a gasto) e IIBB (el VEP viene neto de SIRCREB).
5. **ARCA — facturación electrónica propia** (para ir dejando Finnegans): trámite por sociedad (punto de venta de web services, certificado digital de prueba y de producción, autorizar el servicio de Facturación Electrónica) y después yo armo la función de emisión. Se arranca con el trámite; en paralelo definir con Agustín el flujo (la plataforma avisa el pago → el panel emite → devuelve la factura) y con la contadora qué comprobantes emitir (A/B, y Factura de Crédito MiPyME para empresas grandes). Desde RG 5616 cada factura debe informar la condición de IVA del receptor (ARCA rechaza las que no, desde 1/12/2026).
6. **ICBC** (cuando se abran las cuentas en las dos sociedades): crear cuenta bancaria + medio Echeq + tarjetas desde Cuentas & Caja; el importador de extractos hoy solo lee el PDF del Macro, ICBC necesitará su propio lector.
7. Siguen pendientes de antes: cargar la categoría de IIBB de los 46 proveedores (Tomás), 🔄 Generar históricos, importar extractos jul/ago/sep, renovar certificado MiPyME de SUDES (vence 31/10), el cambio de dominio del panel (analizado, esperando la reunión de equipo).

**Ideas anotadas por Tomás (vuelo del 7/10), aún sin hacer:** curso offline (exportar a Word con opciones para que el médico edite sin conexión y volver a subirlo, comparando cambios) · "ver para facturar desde la plataforma" (= punto 5, ARCA).

