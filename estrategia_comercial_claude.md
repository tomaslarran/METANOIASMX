# Metanoia SMX Panel — Estrategia de comercialización como SaaS

> Documento preparado el 11 Sep 2026 para llevar a una sesión aparte de Claude chat y trabajar en conjunto la estrategia de precios/go-to-market. No es una spec técnica — es contexto de negocio para decidir cómo vender esto.

## 1. Qué es el producto

Panel de gestión interna construido para **Metanoia SMX**, un centro de simulación médica en Salta, Argentina (sociedades SUDES + POINTERS). Es un sistema todo-en-uno para operar un centro de capacitación médica:

- Gestión de cursos (creación asistida por IA, checklist, costos, materiales/simuladores)
- Alumnos e inscripciones
- Instructores, con firma digital y aprobación de certificados
- Evaluación de competencias clínicas (OSATS, GOALS, Mini-CEX, DOPS) + debriefing PEARLS + NPS post-curso
- Diplomas automáticos (generación + envío por email)
- Finanzas completas: cash flow, préstamos, cobranzas, inversiones, conciliación bancaria, caja multi-moneda, sueldos, impuestos (IVA/IIBB/autónomos/ganancias), comprobantes de proveedores, cuentas corrientes
- Comunicaciones: RRSS (Instagram/Facebook/LinkedIn), métricas, agente IA que responde WhatsApp/Instagram DM/Messenger 24/7, videos con IA
- Calendario unificado, inventario, tareas/kanban, reuniones (transcripción + resumen IA), mensajería interna
- Múltiples agentes de IA (Claude) especializados: cursos, mensajes, financiero, comunicaciones, promociones de medios de pago, cierre mensual asistido

**Stack:** un solo archivo HTML/CSS/JS (sin framework) + Supabase (Postgres + Auth + Storage + Edge Functions) + GitHub Pages. Barato de operar, sin licencias de software de terceros más allá de Supabase y las APIs de IA que se consuman.

**Quién lo construyó:** Tomás Larran, admin/desarrollador único de Metanoia SMX, con Claude Code. No es un equipo de producto — es una herramienta interna que nació de una necesidad real y ahora se evalúa vender a terceros.

## 2. Por qué surge la idea de venderlo

Idea surgida en un congreso de simulación médica (10 Sep 2026): al mostrar el panel a colegas de otros centros, quedó claro que **no existe una plataforma de gestión especializada para centros de simulación médica** — el resto usa combinaciones de Excel, WhatsApp y sistemas genéricos no pensados para este nicho (competencias clínicas, debriefing PEARLS, diplomas con firma de instructor, evaluación por instrumentos estandarizados, etc.).

Mercado objetivo potencial: otros centros de simulación médica / instituciones de educación médica continua en Argentina y la región (posible expansión: FASGO, SASIM se mencionan como referencias del ecosistema).

## 3. Estado real de la arquitectura multi-tenant (importante ser honesto acá)

**Lo que ya existe:**
- Tabla `organizaciones` creada
- Columna `organizacion_id` en `usuarios` y en `agente_cursos_chats`
- Los chats de IA de cursos ya son privados por usuario/organización

**Lo que falta (no es cosmético, es estructural):**
- `organizacion_id` NO existe todavía en las tablas de negocio principales: `cursos`, `alumnos`, `instructores`, ni en ninguna tabla de finanzas (`cf_*`, `caja_movimientos`, `comprobantes_compra`, etc.)
- Las policies RLS de casi todas las tablas son `{authenticated} USING (true)` — es decir, **hoy cualquier usuario autenticado puede leer/escribir todas las filas de todas las tablas**, sin importar organización. Esto funciona porque hoy solo hay una organización real usando el sistema. Para multi-tenant real hay que reescribir las policies para filtrar por `organizacion_id`, lo cual es trabajo no trivial en una base con ~40 tablas.
- No hay flujo de alta de organización nueva (crear org + admin inicial + aislar sus datos)
- El campo de rol de usuario vive en la tabla `usuarios`, no en un claim del JWT — hay una limitación ya documentada en el proyecto (ver nota de RLS de instructores) de que el motor de RLS de Supabase no puede hoy diferenciar roles a nivel de política sin ese cambio

**Conclusión honesta:** el producto **no está listo para vender hoy**. Es una migración de arquitectura no menor antes de poder decir "multi-tenant real". Esto debería pesar en cualquier estrategia de timing (¿vender ahora en beta cerrada 1:1 con contrato manual y aislamiento por instancia separada, mientras se construye multi-tenant? ¿o esperar a tener multi-tenant real?).

## 4. Costo real de operación — análisis de tokens de IA (recién arrancado)

Se acaba de instrumentar logging real de consumo de tokens (tabla `ia_uso`, ver CLAUDE.md del repo) en las 9 funciones de IA de mayor volumen: creación de cursos con IA, agente de mensajes (WhatsApp/IG/FB 24/7), agente financiero, lectura de facturas por visión, agente de comunicaciones, análisis de reuniones, agente de promociones, cierre mensual asistido.

**Todavía no hay datos reales acumulados** — el logging recién se deployó. Estimación previa (antes del logging real, a validar): del orden de **~$10-15 USD/mes por organización** en consumo de API de Claude, usando mayormente el modelo `claude-sonnet-4-6` ($3 input / $15 output por millón de tokens). Hay margen de optimización claro y ya identificado pero no ejecutado:
- Migrar a `claude-sonnet-5` ($2/$10 por MTok) — mismo modelo de familia, más barato
- Implementar prompt caching en los agentes con contexto grande y repetido entre llamadas (agente-cursos, agente-mensajes) — puede reducir el costo de input tokens a ~10% en cache hits
- Con ambas optimizaciones, la estimación baja a un rango de **~$5-8 USD/mes por organización**

**Punto crítico para la conversación de pricing:** el costo de IA es variable por uso (más cursos activos, más consultas al agente de mensajes = más costo), no fijo. Un pricing por asiento fijo mensual funciona si el uso está acotado (un centro chico), pero un centro grande con agente de mensajes muy activo en WhatsApp podría consumir bastante más. Vale la pena decidir si el plan de precios necesita un tope de uso de IA por plan, o si se absorbe como costo de servicio.

## 5. Precedente interno de modelo de precios

Ya existe un precedente de estructura de planes dentro del mismo proyecto: **COFRADIA**, una comunidad de suscripción médica con 5 planes (Free → Expert) que Metanoia ya diseñó para sus propios usuarios finales (médicos/residentes), con precios cargados en una tabla `plataforma_planes`. No es directamente el modelo para vender el panel B2B a otros centros, pero es una referencia de cómo el negocio ya piensa la segmentación por planes.

## 6. Preguntas abiertas para trabajar con Claude chat

1. **Modelo de precios:** ¿por organización/mes con tope de usuarios? ¿por usuario activo? ¿por curso gestionado? ¿freemium con upsell de módulos (ej. IA de comunicaciones aparte)?
2. **Segmentación de features:** ¿todos los módulos en todos los planes, o un plan básico (cursos + alumnos + diplomas) vs. uno completo (+ finanzas + IA + comunicaciones)? Las finanzas y los agentes de IA son probablemente el mayor diferenciador pero también el más caro de operar y el más específico de la operación actual de Metanoia (¿otros centros necesitan gestión de IVA/IIBB argentino igual, o eso es demasiado específico?).
3. **Costo de servicio vs. precio:** con el rango estimado de $5-15 USD/mes/organización en IA (antes de sumar Supabase, que hoy está en el plan de un solo proyecto y habría que ver el costo de escalar a multi-tenant), ¿qué margen se busca? ¿pricing en USD o en pesos argentinos, dado que el mercado inicial es Argentina?
4. **Timing:** ¿vender ya en formato "instancia dedicada" (una copia del panel por cliente, sin multi-tenant real, más simple de aislar pero más caro de mantener por cliente) mientras se construye multi-tenant, o esperar a tener multi-tenant real antes de la primera venta?
5. **Onboarding y soporte:** Tomás es el único desarrollador — ¿cuánto soporte/customización por cliente es sostenible sin volverse un cuello de botella? (Esto ya está identificado como riesgo interno del negocio, no es exclusivo de la venta del panel).
6. **Competencia/alternativas:** ¿qué usan hoy otros centros de simulación médica (LMS genéricos, Excel, sistemas de gestión educativa no especializados)? ¿cuál sería el ángulo de venta frente a esas alternativas?

## 7. Lo que NO está incluido en este documento

Este documento no incluye código, credenciales, ni detalles de implementación técnica más allá de lo necesario para entender costos y limitaciones. Para el detalle técnico completo del panel (tablas, edge functions, roadmap contable, etc.) el archivo de referencia interno es `CLAUDE.md` en la raíz del repositorio del proyecto.
