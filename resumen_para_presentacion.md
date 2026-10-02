# Metanoia SMX — Panel de Gestión: resumen para armar una presentación

> **Instrucción para Claude Chat:** con este documento armá una presentación (sugerido: 14 a 18 diapositivas, tono profesional y claro, sin jerga técnica innecesaria) que explique cómo funciona hoy el panel de gestión de Metanoia SMX, con foco en el módulo contable y financiero. Usá los números del ejemplo real (agosto 2026 de SUDES) para ilustrar. Al final incluí una diapositiva honesta de "qué falta" y otra de "próximos pasos". Al final de este documento hay una propuesta de estructura de diapositivas que podés ajustar.

---

## 1. Qué es y para qué sirve

**Metanoia SMX** es una empresa de capacitación médica en simulación de Salta, Argentina. Opera con dos sociedades:

- **SUDES S.A.S.** — cursos de simulación médica, convenio con el Ministerio de Salud Pública (MSP), Colmedsa.
- **POINTERS S.A.S.** — logística y servicios.

El **panel de gestión** es una aplicación web interna, hecha a medida, que concentra en un solo lugar la operación del equipo: cursos, alumnos, tareas, comunicaciones, finanzas y contabilidad. Reemplaza planillas sueltas y mails, y automatiza tareas repetitivas con inteligencia artificial donde aporta valor.

**Objetivo de fondo:** tener la gestión de punta a punta ordenada y, de a poco, construir un módulo contable propio (partida doble, plan de cuentas, asientos automáticos) que permita cerrar cada mes y el balance anual del 30 de junio con toda la información a mano.

**Tecnología (resumen):** aplicación web (un solo archivo, sin frameworks), base de datos y autenticación en Supabase (PostgreSQL), funciones en la nube para IA y automatizaciones, publicada en GitHub Pages. Funciona como app instalable (PWA) y en celular.

**Seguridad:** acceso con usuario y contraseña (con verificación en dos pasos opcional), permisos por rol, seguridad a nivel de base de datos en todas las tablas, validación de sesión en todas las funciones, protección contra inyección de contenido, y backup mensual automatizado.

**Roles:** `admin` (todo), `comunicaciones`, `instructor`, `logística` y `proveedor` (portal externo). Cada rol ve solo lo que le corresponde. Está planificado un rol `contable` de solo lectura para el estudio contable externo (Auren), a definir con ellos.

---

## 2. Qué hace el panel hoy (por área)

### Formación
- **Cursos:** alta y gestión con estados (borrador, convocatoria, inscripciones, en curso, educación médica continua, completado), línea de negocio (MSP, Colmedsa, Comercial, EMC), checklist, presupuesto, cotizaciones, materiales e instructores. Un curso creado por un no-administrador queda en borrador hasta que un administrador lo aprueba para publicar.
- **Alumnos e inscripciones:** base de alumnos con CUIT como identificador maestro, inscripciones con montos y cuotas, importación desde Excel, emisión de **diplomas** (con firma digital de los instructores titulares y del CEO) y envío automático por email.
- **Instructores:** fichas, firma digital propia, asignación por rol (titular / asistente / invitado). El diploma lo firman solo los titulares y requiere aprobación previa del instructor.
- **Evaluación de competencias:** instrumentos estándar (OSATS, GOALS, Mini-CEX, DOPS) con puntaje, porcentaje y evolución por alumno.
- **Debriefing PEARLS** y **encuesta NPS** post-curso (también por WhatsApp).
- **Inventario:** stock de simuladores y equipos, con control de disponibilidad: suma la demanda simultánea de todos los cursos que se superponen en fechas y la compara con el stock físico.
- **Planes de la plataforma e-learning** y sincronización con la plataforma de cursos online (en desarrollo).

### Comunicaciones
- Calendario de redes sociales, métricas de Instagram y Facebook sincronizadas automáticamente.
- **Bot de mensajes 24/7** para Instagram, Facebook Messenger y WhatsApp: responde consultas con IA, usa los datos reales de cursos y precios, escala al equipo cuando hace falta, y aprende de las correcciones del equipo (reglas aprobadas manualmente).
- Mensajería interna del equipo y chats colaborativos con IA.

### Gestión
- **Tareas** (kanban con asignación, prioridades, vencimientos), **rutinas** recurrentes, **reuniones** (grabación, transcripción y análisis con IA, con conversión de las tareas detectadas en tareas reales), **oportunidades** (metodología PEV), **calendario unificado**.
- **Centro de Control semanal:** una pantalla para el lunes con lo que quedó pendiente: reuniones sin convertir en tareas, tareas vencidas por persona, promociones por aprobar, NPS pendientes y próximas visitas.
- **Alertas / dashboard** con vencimientos de pagos, impuestos, tokens, certificados y rutinas.

### Finanzas y contabilidad (detallado en las secciones 3 a 6)
Cash flow, préstamos, cobranzas, inversiones, caja en pesos y dólares, comprobantes de compra, órdenes de pago con retenciones, cuentas corrientes, sueldos y honorarios, impuestos (IVA, IIBB, autónomos, ganancias, VEP), calendario de envíos a Auren, conciliación bancaria, extractos, cierre de mes y libro diario.

### Inteligencia artificial
Más de una docena de agentes especializados (cursos, finanzas, comunicaciones, reuniones, oportunidades, tareas, promociones de medios de pago, lectura de facturas con visión, etc.). Hay **control de consumo**: cada llamada registra tokens, y se pueden fijar límites mensuales por organización y por usuario con aviso y bloqueo. Principio de diseño: **lo que es un dato puro (cupos, precio, fechas, stock, cierres contables) se calcula con reglas exactas, sin IA**, para que sea rápido, consistente y no se pueda inventar un número.

---

## 3. El módulo contable: cómo está armado

### 3.1 Plan de cuentas
Jerarquía de 4 niveles (por ejemplo `1` Activo → `1.1` Activo corriente → `1.1.03` Créditos fiscales → `1.1.03.001` IVA crédito fiscal). Solo las cuentas de nivel 4 reciben asientos. Tipos: activo, pasivo, patrimonio neto, ingreso, egreso. Cuentas relevantes hoy:

| Código | Cuenta |
|---|---|
| 1.1.01.002 / .003 | Banco Macro SUDES / POINTERS |
| 1.1.03.001 | IVA crédito fiscal |
| 1.1.03.002 | Impuesto ley 25.413 a computar |
| 1.1.03.003 | Percepciones de IVA sufridas |
| 1.1.03.004 | IIBB Salta — retenciones SIRCREB a favor |
| 2.1.01.001 | Proveedores |
| 2.1.02.001 | Préstamos a pagar |
| 2.1.03.001 / .002 | IVA débito fiscal / Retenciones de Ganancias a depositar (SICORE) |
| 2.1.05.001 / .002 | Aportes de socios (SUDES / POINTERS) |
| 2.1.06.001 / .002 | Tarjeta Visa Macro (SUDES / POINTERS) |
| 5.1.01.001 | Sueldos y cargas sociales |
| 5.2.01.001 | Gastos generales de operación |
| 5.3.01.001 / .002 | Intereses pagados / Comisiones y gastos bancarios |
| 5.3.02.001 | Impuesto ley 25.413 (gasto) |

### 3.2 Asientos automáticos (partida doble)
Cada operación del panel genera sola su asiento; el motor **no deja registrar un asiento que no balancee** (debe = haber, con tolerancia de un centavo). Ninguna cuenta se asigna "a ojo": cada medio de pago (cuenta bancaria, tarjeta, caja, cuenta de socios) está **vinculado a su cuenta contable**.

| Operación | Debe | Haber |
|---|---|---|
| **Factura de compra revisada** (devengado) | Gasto (total − IVA) + IVA crédito fiscal | Proveedores (total) |
| **Pago de factura con orden de pago** | Proveedores (bruto) | Banco / medio (neto) + Retención SICORE a depositar |
| **Pago directo de factura** | Proveedores | Medio de pago (banco, caja, **tarjeta** o cuenta de socios) |
| **Sueldo / honorario pagado** | Sueldos y cargas sociales | Banco / medio |
| **Cuota de préstamo** | Préstamos a pagar (capital) + Intereses (= total − capital) | Banco |
| **Gastos bancarios del mes** (extracto) | ver 4.4 | Banco |
| **Pago de resumen de tarjeta** | Tarjeta (pasivo) + cargos financieros | Banco |

**Orden de pago:** neto a pagar = bruto − retención; retención = base de retención × porcentaje (tabla de parámetros impositivos, códigos SICORE).

**Cierre de balance anual:** el balance se cierra el 30 de junio. Las facturas con fecha hasta el 30/06 de cada ejercicio pasan a estado "cerrado": quedan archivadas, sin movimiento de caja ni deuda pendiente.

### 3.3 Cuenta puente de socios
Cuando una factura se paga con plata personal de un socio, se elige "Aporte de socios" como medio de pago y **qué socio puso la plata**. No sale dinero de la empresa en ese momento: se genera una deuda con ese socio (pasivo), con detalle individual por persona y botón de devolución. Así se mantiene la independencia patrimonial y queda trazabilidad de quién adelantó qué.

### 3.4 Otros cálculos del circuito de compras
- **Cuenta corriente de proveedor externo:** al revisar una factura con IVA se registra el 40% del IVA (`IVA × 0,40`) en la cuenta corriente.
- **Auto-conciliación clásica:** busca un cobro o pago con el mismo importe (tolerancia: el mayor entre $100 o 1%) en una ventana de 5 a 7 días.
- **Email automático** al proveedor con el comprobante de pago y el certificado de retención; **circularización anual** de saldos a proveedores; aviso al responsable de pagos cuando se contrata un servicio nuevo; alerta de gastos pagados con tarjeta o cuenta personal; checklist semanal del circuito de pagos (jueves).

---

## 4. Extractos bancarios: lectura, clasificación y asiento

### 4.1 Lectura del PDF del Banco Macro
Se sube el PDF del resumen mensual y el panel lo lee **en el navegador, sin IA**:
- Detecta la sociedad por el **CUIT** del extracto.
- Lee cada movimiento con fecha, concepto, referencia, importe y saldo.
- **El signo (débito/crédito) se calcula con la variación del saldo**, no con la columna donde cae el número: `importe = saldo actual − saldo anterior`. Es inmune a desplazamientos del formato.

### 4.2 Controles contra el propio banco
El panel **no deja importar** si algo no cierra:
1. `saldo inicial + Σ movimientos = saldo final` (por cada cuenta).
2. `Σ de los débitos "DBCR 25413" = total del impuesto que informa el banco`.
3. `Σ de los débitos SIRCREB = total recaudado que informa el banco`.

En el extracto real de agosto 2026 de SUDES: 81 movimientos en pesos, 0 errores, y los tres controles coinciden.

### 4.3 Clasificación automática
Cada movimiento se clasifica por su descripción en: impuesto ley 25.413, IIBB SIRCREB, IVA sobre gastos bancarios, percepción de IVA, comisiones y mantenimiento, comisión de transferencia, intereses por adelanto, pago de tarjeta, cuota de préstamo, seguro, pagos de impuestos (AFIP/Rentas), sueldos, transferencia entre cuentas propias, otros cobros y otros pagos. La pantalla de revisión permite **reclasificar cualquier movimiento a mano** antes de confirmar.

### 4.4 Fórmulas del asiento de gastos bancarios
Criterios **confirmados por la contadora**:

- **Impuesto ley 25.413 (débitos y créditos):**
  - Sin certificado MiPyME: `crédito a computar = 33 % que informa el banco` y `gasto = total − crédito`.
  - Con certificado MiPyME vigente: `crédito a computar = 100 %` y gasto = 0.
- **IIBB Salta SIRCREB:** no es gasto; va como **activo a favor** (retención sufrida).
- **Percepciones de IVA:** activo a favor.
- **IVA de comisiones e intereses:** a IVA crédito fiscal.
- **Comisión de transferencia de $121:** el banco no muestra IVA aparte, así que `neto = 121 ÷ 1,21 = 100` e `IVA = 121 − 100 = 21`.
- **Cálculo en centavos enteros** para que el asiento cierre exacto contra el débito real del banco.

**Ejemplo real — agosto 2026, SUDES (asiento único del mes):**

| Cuenta | Debe | Haber |
|---|---:|---:|
| 1.1.03.002 Ley 25.413 a computar (33 %) | 174.950,00 | |
| 5.3.02.001 Ley 25.413 (gasto) | 355.201,52 | |
| 1.1.03.004 IIBB SIRCREB a favor | 725.459,86 | |
| 1.1.03.001 IVA crédito fiscal | 17.608,65 | |
| 1.1.03.003 Percepciones de IVA | 2.455,22 | |
| 5.3.01.002 Comisiones y mantenimiento | 74.310,00 | |
| 5.3.01.001 Intereses | 19.081,41 | |
| 1.1.01.002 Banco Macro SUDES | | 1.369.066,66 |
| **Totales** | **1.369.066,66** | **1.369.066,66** |

Con certificado MiPyME, los $174.950 pasan a $530.151,52 de crédito a computar y desaparecen los $355.201,52 de gasto.

### 4.4.b Certificado MiPyME
Se sube el PDF del certificado; el panel **lee el CUIT** (verifica que sea de SUDES o POINTERS) y la **fecha de vencimiento**, y pide confirmarla. Desde 60 días antes del vencimiento aparece una alerta en el panel principal (crítica si ya venció). El importador usa el 100 % solo si el certificado sigue vigente al cierre del período; si venció, vuelve al 33 % y avisa.

### 4.5 Qué se guarda y dónde: la pestaña "Resúmenes"
Cada extracto queda archivado con: el **PDF original** (en un almacenamiento privado, con enlace temporal), saldos, totales por concepto, el asiento que generó y el estado. Hay una **cobertura de los 12 meses del ejercicio (1/07 al 30/06)** por sociedad para ver qué mes falta, y se exporta todo a Excel. Una importación se puede anular (borra sus movimientos y anula el asiento; el PDF queda archivado).

### 4.6 Lista de control para imprimir
Para cada extracto se genera una lista imprimible con casillero, fecha y monto de cada gasto bancario e impuesto, por sección, con subtotales y comparación contra los totales del banco. Sirve para imprimir el extracto original y **tildar con resaltador** lo que el panel tomó; lo que queda sin marcar es lo que no se tomó como gasto.

---

## 5. Conciliación: panel contra banco

El panel registra operaciones (pagos, cobros, retiros) antes de que lleguen al banco. Al importar el extracto se **cruza lo cargado en el panel contra lo que realmente pasó en el banco**.

**Regla de cruce** (una operación del panel con una del banco, uno a uno):
1. Mismo signo (entrada con entrada, salida con salida).
2. Primera pasada: **importe exacto** (diferencia ≤ $0,01) y fecha a **±5 días**.
3. Segunda pasada: importe **aproximado** (diferencia ≤ el mayor entre $1 o 0,5 %) y misma ventana; queda marcado "importe aproximado".
4. Se elige el candidato con la fecha más cercana.

**Resaltado de diferencias:**
- 🔴 **Rojo:** está en el panel y **no aparece en el banco** (se marca solo dentro de meses que tienen extracto importado).
- 🟠 **Ámbar:** está en el banco y **falta cargarlo en el panel**.
- Filtro "Solo diferencias" y anulación del cruce desde la misma pantalla.

**Cierre de tarjeta:** el débito "VISA" del extracto se cierra contra las facturas pagadas con esa tarjeta. Fórmulas:
- `Debe Tarjeta = pago al banco − cargos financieros`
- `Debe Gasto = cargos financieros (intereses, sellos, IVA)`
- `Haber Banco = pago al banco`
- `Saldo contable de la tarjeta = Σ haber − Σ debe` (si queda negativo, hay consumos pagados todavía sin factura cargada; se corrige solo al cargarlas).

---

## 6. Cierre de mes

Pestaña por sociedad: se elige sociedad y mes y el panel verifica **contra la base real** (sin IA):

| Control | Qué verifica |
|---|---|
| Extracto bancario | importado, contabilizado y que cubra el mes completo |
| Conciliación | lo del panel sin banco y lo del banco sin panel |
| Pagos de tarjeta | cerrados contra el banco |
| Facturas de compra | todas con asiento de devengado; `Σ comprobantes = Σ devengado` |
| Pagos de facturas | cada pago con su asiento (orden de pago o pago directo) |
| Sueldos | pagos con asiento y empleados activos sin pago registrado |
| Cuotas de préstamo | pagadas con asiento, vencidas sin pagar |
| Asientos | todos balanceados (`debe = haber`) |
| Impuestos | VEP vencidos sin pagar, envíos pendientes a Auren |
| Banco extracto vs libros | informativo: `variación del extracto − variación contable` |

**Resumen del mes:** `Resultado = Ingresos − Egresos`; `IVA del mes = IVA débito − IVA crédito`; balance de sumas y saldos por cuenta (`saldo deudor = debe − haber`; `saldo acreedor = haber − debe`). Imprimible.

**Cerrar y reabrir:** queda registrado quién y cuándo, con una foto de los controles y los números. **Si hay pendientes, exige una nota** que explique por qué se cierra igual. Es un cierre **con aviso**, no bloqueante: si luego se contabiliza algo en un mes cerrado, el panel lo avisa y muestra "el mes cambió después del cierre". Reabrir también queda registrado.

**Vista del ejercicio (1/07 al 30/06):** 12 meses con extracto, cantidad de asientos, ingresos, egresos, resultado, IVA y estado de cierre, más exportación a Excel (cierres por mes y sumas y saldos del ejercicio) pensada para el **cierre de balance** y para el estudio contable.

---

## 7. Automatizaciones surgidas del diagnóstico del estudio contable (Auren)

Seis mejoras implementadas a partir del informe del estudio: calendario impositivo con fechas tope de envío; aviso de compra/servicio nuevo; marca de medios de pago personales con alerta; checklist semanal del circuito de pagos; email automático al proveedor con comprobante de pago; circularización de saldos. Además: órdenes de pago con logo y datos fiscales de cada sociedad.

---

## 8. Qué falta (honestidad ante la audiencia)

- **Lado de ventas / ingresos:** hoy se contabilizan compras, pagos, sueldos, préstamos y gastos bancarios, pero **no los cobros a alumnos ni las ventas**. Por eso el "resultado" del mes refleja solo egresos y la variación del banco difiere del extracto. Es la **Fase 3** del plan contable; el técnico de la plataforma de cursos ya tiene lista la API para integrarlo (cuenta corriente de alumnos, facturas y recibos por CUIT).
- **Cuenta en dólares:** el extracto la lee, pero todavía no la contabiliza (falta su cuenta contable en USD).
- **Facturación electrónica y Libro IVA digital** (requisitos para reemplazar al sistema contable externo): pendientes.
- **Validación externa:** antes de reemplazar al sistema actual, al menos un cierre mensual completo validado por el contador.
- **Rol contable de solo lectura** para el estudio: a definir en la próxima reunión.
- **Extractos de julio a septiembre de ambas sociedades:** en proceso de carga para probar el cierre completo.

## 9. Hoja de ruta contable

1. ✅ Medios de pago vinculados a cuentas contables.
2. ✅ Reporte exportable de pagos con retenciones.
3. ✅ Plan de cuentas y parámetros impositivos.
4. ✅ Asientos automáticos de compras, pagos, sueldos y cuotas.
5. ✅ Extractos bancarios, conciliación, cierre de tarjeta, cierre de mes y vista del ejercicio.
6. ⏳ Fase 3: cuenta corriente de alumnos e integración con la plataforma de cursos (ventas y cobros).
7. ⏳ Fase 4: Libro IVA, balance y estado de resultados desde los asientos, y reemplazo del sistema contable externo.

---

## 10. Estructura de presentación sugerida

1. Portada: "Metanoia SMX — Panel de Gestión: cómo quedó funcionando".
2. La empresa y por qué se construyó el panel.
3. Mapa general de módulos (formación, comunicaciones, gestión, finanzas).
4. Inteligencia artificial: dónde usa IA y dónde deliberadamente no.
5. Seguridad, roles y control de consumo de IA.
6. El módulo contable de un vistazo (plan de cuentas + asientos automáticos).
7. Tabla "qué operación genera qué asiento".
8. Cuenta puente de socios y medios de pago vinculados.
9. Extractos bancarios: lectura del PDF y controles contra el banco.
10. Clasificación y fórmulas del asiento de gastos bancarios (con el ejemplo de agosto).
11. Certificado MiPyME y la regla del 33 % / 100 %.
12. Conciliación panel contra banco: reglas de cruce y resaltado de diferencias.
13. Cierre de tarjeta.
14. Resúmenes guardados y lista de control para imprimir.
15. Cierre de mes: controles, nota obligatoria y aviso posterior.
16. Vista del ejercicio y preparación del balance del 30/06.
17. Qué falta y hoja de ruta (ventas, USD, facturación electrónica).
18. Cierre: beneficios (tiempo, control, trazabilidad) y próximos pasos.
