# Metanoia SMX — Panel de Gestión Interno

## Contexto del proyecto

Panel web interno para **Metanoia SMX**, empresa de capacitación médica en simulación de Salta, Argentina. Tiene dos sociedades: **SUDES** (cursos de simulación médica) y **POINTERS** (logística/servicios).

**Stack:** HTML/CSS/JS monolítico (sin framework) + Supabase (PostgreSQL + Auth + Edge Functions) + GitHub Pages (hosting).

**URL producción:** https://tomaslarran.github.io/METANOIASMX/  
**Repo:** https://github.com/tomaslarran/METANOIASMX  
**Supabase project:** jppxmdvddvbsvymogvcp.supabase.co

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
| Notificaciones | `pg-notif` | Preferencias de notificaciones |
| Usuarios | `pg-usuarios` | Gestión de roles |
| Rutinas | `pg-rutinas` | Tareas recurrentes |

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

---

## Edge Functions

| Función | Descripción |
|---|---|
| `agente-comunicaciones` | Agente IA para RRSS: analiza métricas, valida captions, genera prompts de video, busca tendencias (Tavily API) |
| `agente-financiero` | Agente IA financiero: lee todas las tablas de CF y responde preguntas |
| `agente-cursos` | Agente IA para gestión de cursos |
| `agente-tareas` | Agente IA para gestión de tareas |
| `agente-ejecutivo` | Agente ejecutivo general |
| `sync-instagram` | Sincroniza posts de Instagram (@metanoiasmx) y Facebook (Metanoiasme.ok, ID: 478694861999786) con Supabase |
| `sync-linkedin` | Sincroniza posts de LinkedIn (org ID: 105737703) — **pendiente aprobación Community Management API** |
| `iniciar-reunion` | Inicia reunión con agente IA |
| `verificar-reunion` | Verifica estado de reunión |
| `leer-factura` | Lee facturas con visión de Claude |
| `whatsapp-agente` | Integración WhatsApp |

**Secrets de Supabase:**
- `ANTHROPIC_API_KEY` — Claude API
- `META_ACCESS_TOKEN` — Instagram (@metanoiasmx, ID: 17841470857318268)
- `META_FB_PAGE_TOKEN` — Facebook Page (Metanoiasme.ok, ID: 478694861999786) — **vence periódicamente, renovar en Graph API Explorer**
- `TAVILY_API_KEY` — búsqueda web para agente comunicaciones
- `LINKEDIN_ACCESS_TOKEN` — LinkedIn OAuth token (app "Panel Metanoia", vence en 2 meses)

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

### Otros
- `proveedores` — proveedores externos
- `inventario` — control de stock
- `reuniones` — reuniones del equipo
- `rutinas` — tareas recurrentes

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

- [ ] LinkedIn sync — esperando aprobación Community Management API (app "Metanoia CMS", enviado 2 Jun 2026)
- [ ] Módulo COFRADIA — gestión de planes, suscriptores y contenido (Línea D)
- [ ] Intake de oportunidades en el panel — Mario carga ideas, Amparo las procesa
- [ ] Dashboard de autonomía — KPI dependencia MSP vs privado en tiempo real
- [ ] Darwin integration — hub de comunicaciones (WhatsApp/consultas), esperando APIs de Octavio
- [ ] Integración E-learning — transmisión automática de cursos a plataforma metanoiasme.com
- [ ] Agentes cloud autónomos para automatizaciones (gstack instalado)
- [ ] Conciliación bancaria POINTERS (actualmente solo SUDES)
- [ ] Mejoras Cash Flow — gráficos de evolución de caja

---

## Notas técnicas críticas

1. **Token Facebook:** `META_FB_PAGE_TOKEN` vence periódicamente (~60 días). Renovar en developers.facebook.com → Herramientas → Explorador API Graph → `me/accounts`.

2. **Token Instagram:** `META_ACCESS_TOKEN` generado desde developers.facebook.com → Casos de uso → API de Instagram → Generar token.

3. **CSS roles:** El sistema de permisos usa `body.rol-X` classes + CSS `!important`. NO usar JS `element.style.display` para controlar visibilidad de nav items de roles — el CSS lo overridea correctamente.

4. **index.html monolítico:** Todo el código está en un solo archivo. Buscar secciones con `<!-- ══ NOMBRE ══ -->` comentarios. Las funciones JS están al final del archivo.

5. **GitHub Actions:** No hay CI/CD automático — deploy manual via `git push`.

6. **LinkedIn apps:** Hay DOS apps en LinkedIn Developers:
   - "Panel Metanoia" (Client ID: 777fx285cpfz1s) — Share on LinkedIn, para posting futuro
   - "Metanoia CMS" (Client ID: 77fn5v3ziq376h) — Community Management API (pendiente aprobación)

7. **Darwin AI:** Integración futura con api.getdarwin.ai — contacto: Octavio Marquez. Objetivo: hub de comunicaciones (ver y responder consultas desde el panel).

8. **gstack:** Instalado en `~/.claude/skills/gstack/`. Comandos disponibles: `/gstack-review`, `/gstack-qa`, `/gstack-investigate`, `/gstack-health`.
