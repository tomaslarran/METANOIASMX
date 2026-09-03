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

**Secrets de Supabase:**
- `ANTHROPIC_API_KEY` — Claude API
- `META_ACCESS_TOKEN` — Instagram (@metanoiasmx, ID: 17841470857318268)
- `META_FB_PAGE_TOKEN` — Facebook Page (Metanoiasme.ok, ID: 478694861999786) — **token permanente via Usuario del Sistema** (ver nota técnica #1)
- `META_APP_SECRET` — para verificación firma webhook `X-Hub-Signature-256`
- `META_WH_VERIFY_TOKEN` — token verificación webhook Meta (agente-mensajes)
- `META_WA_TOKEN` — WhatsApp Business API token
- `WA_PHONE_NUMBER_ID` — ID del número de WhatsApp Business
- `WA_AMPARO`, `WA_VALENTINA`, `WA_DANI`, `WA_FLOR` — números WA del equipo para escalación
- `TAVILY_API_KEY` — búsqueda web para agente comunicaciones
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
3. [ ] **Fase 1** — `plan_cuentas` + `parametros_impositivos` (reemplaza `IVA_TASA=0.21` hardcodeada en línea ~15057 y `SICORE_CAT`) + `proveedor_id` en comprobantes + CUIT y condición fiscal en tabla `proveedores`. 3 preguntas pendientes para la contadora (ver spec sección 6). **IVA confirmado:** cursos y prácticas exentos/no alcanzados; suscripciones COFRADIA sí gravadas.
4. [ ] **Fase 2** — Asientos automáticos doble entrada: tablas `asientos_contables` + `asientos_movimientos`. Se disparan al pasar comprobante a "revisado" (devengado) y al pagar OP (pago). Gap más barato: 100% interno, no depende de Finnegans.
5. [ ] **Fase 3** — `cuenta_corriente_alumnos` + importador Finnegans (cruce por CUIT). Conecta inscripciones con facturación real.
6. [ ] **Fase 4** — Libro IVA ARCA, balance/estado de resultados desde asientos, reemplazo Finnegans (bloqueado por facturación electrónica CAE).

**Bloqueantes antes de reemplazar Finnegans:**
- Facturación electrónica ARCA (CAE) — requiere integración web services
- Libro IVA digital en formato legal
- Validación con contador externo (al menos un cierre mensual completo con el sistema nuevo)

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
- ✅ Edge Function `eliminar-usuario` — elimina usuario de Supabase Auth + tabla `usuarios`, solo admins, con guard de auto-eliminación (pendiente deploy en Supabase dashboard)
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
- ⏳ Template Meta `nps_post_curso` — enviado para aprobación (categoría Utilidad, cuerpo: "Hola {{1}}, gracias por participar en *{{2}}*. ¿Cómo calificarías la experiencia del *1 al 10*? Solo respondé con el número."). Aprobación: 24-72h hábiles.

**SQL corrido (Supabase):** `instrumentos_evaluacion`, `evaluaciones_alumno`, `debriefings`, `nps_respuestas`, `nps_envios` + 4 INSERT instrumentos estándar

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
- ✅ sw.js v42 → v43

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

**Deploy necesario (3 Sep 2026):** Solo frontend (index.html + sw.js) — `git push`.

---

## Implementado (23 Jun 2026) — Agente mensajes y mejoras continuas
- ✅ agente-mensajes: bot 24/7 para IG DM / FB Messenger / WhatsApp — Claude Haiku, escalación al equipo vía WA, transcripción de audio con Groq/Whisper, visión para imágenes
- ✅ agente-mensajes: detecta y descarta respuestas automáticas (`{"ignorar":true}`), manejo de etiquetas/shares, tono mejorado
- ✅ Feedback con comentario en mensajes — campo `feedback_comentario` en `mensajes_publico`, textarea inline
- ✅ Sistema de mejoras del agente — Edge Function `analizar-feedback` analiza feedback semanal con Claude, propone reglas, equipo aprueba/rechaza en tab Agente IA, reglas aprobadas se inyectan en el system prompt
- ✅ 2FA TOTP en Notificaciones — enroll/verify/unenroll via Supabase Auth MFA API, QR con qrcode-generator

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
