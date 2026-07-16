# Módulo Contable — Panel Metanoia SMX / Pointers
## Spec técnico para pasar a desarrollo (Claude Code)

**Fecha:** 16/07/2026
**Contexto:** Panel monolítico (`index.html`, vanilla JS + Supabase). Dos sociedades: SUDES S.A.S. y POINTERS. Objetivo estratégico (decisión jul-2026): construir de a poco un módulo contable propio para eventualmente reemplazar Finnegans.

**Nota de contexto regulatorio:** AFIP pasó a llamarse **ARCA** (Agencia de Recaudación y Control Aduanero). Los web services de facturación electrónica (CAE), Libro IVA Digital y SICORE ahora corren bajo el dominio `arca.gob.ar`. No cambia la lógica contable, pero hay que actualizar cualquier referencia/documentación interna y los endpoints cuando se implemente la integración de facturación electrónica (bloqueante de largo plazo).

---

## 1. Principio rector

Cada feature nueva debe dejar datos en formato de **partida doble** (debe/haber contra un plan de cuentas), aunque el usuario nunca vea un asiento contable en pantalla. Esto es lo que permite, más adelante, generar balance y estado de resultados sin reprocesar todo.

Dos momentos contables distintos que hoy el panel no distingue y que la contadora sí necesita:

- **Devengado**: cuando nace la obligación/derecho (se carga una factura de compra, se genera una factura Finnegans a un alumno).
- **Percibido/Pagado**: cuando se mueve la plata (se paga una OP, se cobra una cuota).

Hoy el panel solo registra el momento del pago/cobro. Para tener contabilidad real hacen falta los dos asientos.

---

## 2. Plan de cuentas (`plan_cuentas`)

### Estructura propuesta

Código jerárquico de 4 niveles (rubro.grupo.subgrupo.cuenta), estilo plan de cuentas argentino estándar:

```sql
create table plan_cuentas (
  id uuid primary key default gen_random_uuid(),
  codigo varchar not null unique,        -- ej '1.1.01.001'
  nombre varchar not null,
  tipo varchar not null check (tipo in ('activo','pasivo','patrimonio_neto','ingreso','egreso')),
  naturaleza varchar not null check (naturaleza in ('deudora','acreedora')), -- saldo normal
  cuenta_padre_id uuid references plan_cuentas(id),
  nivel int not null,                    -- 1=rubro 2=grupo 3=subgrupo 4=cuenta imputable
  imputable boolean not null default false, -- solo nivel 4 recibe movimientos
  sociedad varchar,                      -- null = cuenta común a ambas sociedades
  activa boolean not null default true,
  created_at timestamptz default now()
);
```

**Decisión a validar con la contadora:** plan de cuentas único (compartido) con `sociedad` como dimensión en cada movimiento, en vez de duplicar el plan por sociedad. Es más simple de mantener y sigue permitiendo separar balances por sociedad al momento de reportar. Si la contadora prefiere planes separados (más ortodoxo si en algún momento se presentan balances independientes ante organismos distintos), se duplica `sudes_` / `pointers_` en el código.

### Cuentas mínimas necesarias (nivel imputable) para cubrir lo que el panel ya maneja

| Código | Cuenta | Alimenta desde |
|---|---|---|
| 1.1.01.xxx | Caja / Banco por medio de pago | `medios_pago`, `caja_movimientos` |
| 1.1.02.001 | Deudores por cursos (Alumnos) | `cuenta_corriente_alumnos` (nueva) |
| 1.1.03.001 | IVA Crédito Fiscal | `comprobantes_compra.iva` |
| 1.1.04.001 | Inversiones / Plazos fijos | `cf_inversiones` |
| 2.1.01.001 | Proveedores | `comprobantes_compra` |
| 2.1.02.xxx | Préstamos a pagar | `cf_prestamos_cuotas` |
| 2.1.03.001 | IVA Débito Fiscal | ingresos con IVA (a definir si cursos están gravados o exentos) |
| 2.1.03.002 | Retenciones Ganancias a depositar (SICORE) | `ordenes_pago.monto_retencion` + `codigo_sicore` |
| 2.1.03.003 | Percepciones IIBB a depositar | `comprobantes_compra.percepcion_iibb` |
| 2.1.04.001 | Sueldos a pagar | `cf_pagos_empleados` |
| 4.1.01.001 | Ingresos por cursos (SUDES) | `inscripciones` / Finnegans |
| 4.1.02.001 | Ingresos por servicios (POINTERS) | a definir origen |
| 4.2.01.001 | Sueldos y cargas sociales | `cf_pagos_empleados` |
| 4.2.03.001 | Intereses pagados | `cf_prestamos_cuotas.intereses` |

La cuenta 2.1.03.002 conviene subdividirse por código SICORE (029/031/079/011/028/093) si la contadora necesita el desglose por régimen para la presentación — se puede resolver con un nivel 5 opcional o con un campo `codigo_sicore` en el asiento sin abrir subcuenta nueva. Recomiendo lo segundo: menos cuentas, mismo dato.

**Confirmado (16/07/2026):** los cursos y prácticas de SUDES están **exentos/no alcanzados por IVA** → no genera IVA Débito Fiscal. Las suscripciones (COFRADIA, Línea D) **sí están gravadas con IVA** → sí genera IVA Débito Fiscal cuando se active esa línea. Implicancias para el plan de cuentas:
- La cuenta `2.1.03.001 IVA Débito Fiscal` **no se activa** por ingresos de cursos.
- Sí se activa cuando COFRADIA empiece a facturar suscripciones.
- Los comprobantes de compra de SUDES siguen generando `1.1.03.001 IVA Crédito Fiscal` normalmente (crédito fiscal de compras, independiente de si hay débito fiscal de ventas — el saldo técnico lo define la contadora según el régimen).

---

## 3. Asiento automático (doble entrada mínima viable)

### Tablas

```sql
create table asientos_contables (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  sociedad varchar not null,
  tipo varchar not null check (tipo in ('devengado_compra','pago_compra','devengado_venta','cobro_venta','sueldo','ajuste','apertura')),
  origen varchar not null,              -- 'comprobante' | 'orden_pago' | 'caja_movimiento' | 'inscripcion' | 'manual'
  origen_id uuid not null,              -- FK lógica al registro que disparó el asiento
  descripcion text,
  anulado boolean not null default false,
  creado_por varchar,
  created_at timestamptz default now()
);

create table asientos_movimientos (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references asientos_contables(id) on delete cascade,
  cuenta_id uuid not null references plan_cuentas(id),
  debe numeric not null default 0,
  haber numeric not null default 0,
  descripcion text
);
```

Regla de integridad a nivel aplicación (no hace falta constraint SQL, pero sí validación en el código que genera el asiento): `sum(debe) = sum(haber)` por `asiento_id`.

### Flujo al cargar/revisar un comprobante de compra (devengado)

Se dispara cuando `comprobantes_compra.estado` pasa a `revisado`.

| Cuenta | Debe | Haber |
|---|---|---|
| Gastos/Compras (según rubro) | `monto_neto` | |
| IVA Crédito Fiscal | `iva` | |
| Proveedores | | `total` |

### Flujo al pagar (OP generada, `ordenes_pago`)

Se dispara cuando se marca la OP como pagada.

| Cuenta | Debe | Haber |
|---|---|---|
| Proveedores | `total` | |
| Banco/Caja (según `medio_pago`) | | `neto_a_pagar` |
| Retenciones Ganancias a depositar (SICORE) | | `monto_retencion` |
| Percepciones IIBB a depositar (si aplica) | | `percepcion_iibb` |

Este segundo asiento es el que hoy falta por completo — cuando se paga una OP no se genera ningún movimiento en `caja_movimientos` ni nada equivalente. Es el gap más barato de cerrar porque no depende de nada externo (Finnegans, alumnos): es 100% interno al panel.

### Flujo simétrico del lado ingresos (cursos)

Devengado (cuando Finnegans factura al alumno, vía importador o webhook):

| Cuenta | Debe | Haber |
|---|---|---|
| Deudores por cursos (Alumnos) | `total` | |
| Ingresos por cursos | | `neto` |
| IVA Débito Fiscal (si corresponde) | | `iva` |

Cobro (cuando el alumno paga):

| Cuenta | Debe | Haber |
|---|---|---|
| Banco/Caja | `monto` | |
| Deudores por cursos (Alumnos) | | `monto` |

---

## 4. Cuenta corriente de alumnos

No existe hoy. Es la pieza que conecta `inscripciones` (panel) con la facturación real que hace Finnegans, usando CUIT como pivote (confirmado: es el ID maestro que usa Finnegans para crear el cliente).

```sql
create table cuenta_corriente_alumnos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  cuit varchar not null,                 -- redundante a propósito, para cruce directo con exports de Finnegans
  fecha date not null,
  tipo_movimiento varchar not null check (tipo_movimiento in ('factura','pago','nota_credito','nota_debito','ajuste')),
  comprobante_finnegans_nro varchar,
  inscripcion_id uuid references inscripciones(id),
  monto numeric not null,                -- positivo = aumenta deuda del alumno, negativo = pago
  saldo_posterior numeric not null,
  origen varchar not null check (origen in ('finnegans_import','panel_pago','ajuste_manual')),
  created_at timestamptz default now()
);
create index on cuenta_corriente_alumnos (cuit);
create index on cuenta_corriente_alumnos (alumno_id);
```

### Estrategia de sincronización (coincide con el roadmap que ya tenés)

- **Corto plazo — importador:** script que lee el export semanal/mensual de Finnegans (Excel/CSV), matchea por `cuit` + número de comprobante, e inserta los movimientos que falten (evitar duplicados con un `unique(cuit, comprobante_finnegans_nro, tipo_movimiento)`). Actualiza `saldo_posterior` de forma incremental.
- **Mediano plazo — webhook/polling:** cuando Finnegans emite el evento de factura o recibo, el panel lo captura en tiempo real y genera el movimiento + el asiento devengado/cobro correspondiente (sección 3) automáticamente.

Con esta tabla, el saldo total de "Deudores por cursos" en `plan_cuentas` debería poder reconciliarse en cualquier momento contra `sum(cuenta_corriente_alumnos.monto)` por alumno — es el control cruzado que le vas a poder mostrar a la contadora.

---

## 5. Priorización — qué atacar primero

Con la contadora ya metida en el tema (cerraste 198 facturas al 30/06), el criterio no es solo "qué es más importante contablemente" sino **qué genera confianza rápido sin arriesgar el cierre que ya hiciste**.

**Fase 0 — Reporte exportable consolidado (1-2 días de trabajo, cero riesgo).**
Es un reporte de solo lectura sobre tablas que ya existen (`comprobantes_compra`, `ordenes_pago`, `caja_movimientos`, `cf_pagos_empleados`). No requiere `plan_cuentas` ni asientos. Le das a la contadora, por período y sociedad: ingresos, egresos, retenciones practicadas (con código SICORE), sueldos pagados. Esto además sirve como puente manual hacia Finnegans mientras no hay integración automática. **Es lo que yo atacaría primero** — no toca nada existente y le da a la contadora una herramienta real esta semana.

**Fase 1 — `plan_cuentas` (fundación).**
Se crea y se puebla, se valida la lista de cuentas *con la contadora* (especialmente el tratamiento IVA de los cursos, que no podés asumir vos). No afecta nada en producción todavía: es una tabla nueva, aditiva.

**Fase 2 — Asiento automático en flujos de compra (comprobantes + OP).**
Es el gap más autocontenido: no depende de Finnegans ni de alumnos, solo de datos que ya están en el panel. Al implementarlo, cada pago de comprobante deja rastro contable real. Bajo riesgo, alto valor.

**Fase 3 — Cruce inscripciones → ingresos reales + cuenta corriente de alumnos.**
Es el gap más grande y el que depende de un tercero (Finnegans/export). Arranca con el importador manual (sección 4), no con el webhook. Recién acá el Cash Flow empieza a recibir ingresos reales de forma automática en lugar de carga manual en `cf_valores`.

**Fase 4 — Libro IVA digital, balance/resultado desde asientos, reemplazo de Finnegans.**
Largo plazo, bloqueado por facturación electrónica ARCA (CAE) y validación legal con la contadora. No arranca hasta que las fases 1-3 estén maduras y probadas en, al menos, un cierre mensual completo.

---

## 6. Preguntas para la contadora (llevarlas antes de programar las fases 1-3)

1. ~~¿Los cursos de SUDES están gravados, exentos o no alcanzados por IVA?~~ **✅ Confirmado 16/07/2026:** cursos y prácticas exentos/no alcanzados. Suscripciones COFRADIA sí gravadas. Ver nota en sección 2.
2. ¿Plan de cuentas único con dimensión "sociedad" por movimiento, o plan duplicado por sociedad? (sección 2)
3. ¿Qué nivel de desglose necesita para SICORE — le sirve el campo `codigo_sicore` en el asiento, o necesita subcuentas separadas por régimen?
4. ¿Con qué periodicidad puede validar el reporte de la Fase 0 para que sirva de control cruzado real contra Finnegans?

---

## 7. Auditoría de tasas impositivas en el código actual (verificado 16/07/2026 sobre `index.html`)

Se revisó el código real para confirmar qué tan hardcodeadas están las tasas. Esto es lo que hay hoy, con líneas exactas para que quien lo implemente sepa dónde tocar:

| Hallazgo | Ubicación | Riesgo |
|---|---|---|
| `const IVA_TASA=0.21;` — constante global única | línea 15057, usada en 6 lugares (4262, 4378, 9719, 15219, 15236, 15261) | Si ARCA cambia la alícuota general de IVA (pasó históricamente con reducciones temporarias), hay que tocar código y redeployar. No hay tabla ni fecha de vigencia. |
| Cálculo de crédito fiscal con 21%/10.5%/27% hardcodeados como fallback | función `getCreditoFiscal`, línea ~15113-15116 | Solo se usa si `c.iva` no está cargado en el comprobante — riesgo acotado, pero mismo problema de fondo (números fijos en el código). |
| `SICORE_CAT` — objeto JS con los 6 códigos (029/031/079/011/028/093) y su % | línea 16030-16037 | Completo (los 6 códigos están, y el dropdown del modal de OP también los tiene todos — línea 3678-3686). Pero sin fecha de vigencia: si ARCA actualiza un % por RG, hay que editar el objeto y redeployar. |
| Cálculo de retención Ganancias: `base * pct / 100`, sin piso | función `mopRecalcular`, línea 16085-16097 | No hay lógica de "monto mínimo no sujeto a retención" (cada régimen SICORE tiene un piso por debajo del cual no corresponde retener). El % es editable a mano en el modal, así que un usuario atento lo puede corregir — pero el sistema no lo hace solo ni avisa. |
| Percepción IIBB (`percepcion_iibb`) | campo numérico 100% manual en el modal de comprobante, línea 16302-16303, 16802 | No hay cálculo ni tabla de alícuotas por jurisdicción/padrón — depende enteramente de que la persona que carga la factura tipee el monto correcto. Cero automatización, cero validación. |
| Tabla `proveedores` existente | línea 3728-3733, campos: nombre, tipo (Empresa/Freelance/Institución/Otro), especialidad, email, teléfono, notas | **Corrección a lo que dije antes:** sí existe una tabla `proveedores`, pero es para el módulo de instructores/proveedores de servicios (`pg-proveedores`), no tiene CUIT ni condición fiscal, y **no está conectada** con `comprobantes_compra` — ahí el proveedor y CUIT son texto libre tipeado en cada factura (línea 2833). No hay proveedor maestro fiscal en ningún lado del sistema. |
| Condición fiscal del proveedor | Se infiere por factura, no por proveedor: el usuario elige "Tipo de factura" (A/B/C/NC) manualmente en cada carga (línea 3663-3667) | Si un proveedor cambia de categoría (ej. un monotributista que pasa a responsable inscripto), no hay ningún lugar donde eso quede registrado — depende de que quien carga la próxima factura se acuerde. |

**Conclusión de la auditoría:** el riesgo más real no es que las tasas estén mal calculadas — el motor de cálculo es correcto. El riesgo es que **todo depende de números fijos en el código o de que una persona tipee bien a mano**, sin ningún lugar centralizado para actualizar una tasa cuando ARCA la cambia, y sin proveedor maestro que recuerde la condición fiscal de cada uno. Es exactamente el tipo de cosa que una contadora detecta en la primera auditoría seria.

### Diseño propuesto — parametrización impositiva

```sql
create table parametros_impositivos (
  id uuid primary key default gen_random_uuid(),
  tipo varchar not null check (tipo in ('iva','sicore_ganancias','iibb')),
  codigo varchar not null,              -- ej '21', '10.5', '27' (IVA) | '029','031',... (SICORE) | jurisdicción (IIBB)
  descripcion varchar,
  porcentaje numeric not null,
  monto_no_sujeto numeric default 0,    -- piso antes de aplicar retención/percepción (hoy no existe en ningún lado)
  vigente_desde date not null,
  vigente_hasta date,                   -- null = vigente
  created_at timestamptz default now()
);
```

Reemplaza `IVA_TASA` y `SICORE_CAT` por una consulta a esta tabla (filtrando por `vigente_hasta is null` o por fecha del comprobante), y agrega el piso de retención que hoy no existe. Un cambio de alícuota pasa a ser un INSERT en Supabase, no un deploy.

```sql
alter table proveedores add column if not exists cuit varchar;
alter table proveedores add column if not exists condicion_iva varchar
  check (condicion_iva in ('responsable_inscripto','monotributo','exento','no_categorizado'));
```

Y —decisión de producto, no solo de datos— definir si `comprobantes_compra` empieza a buscar el proveedor por CUIT contra esta tabla ampliada (autocompletando tipo de factura y condición fiscal) en vez de que la persona lo tipee a mano cada vez. Esto no es solo un tema contable: reduce el error humano que hoy es 100% del control.

**Dónde entra esto en el roadmap de la sección 5:** va en la **Fase 1**, junto con `plan_cuentas` — es la misma lógica de fundación (tablas de referencia, aditivas, sin tocar el comportamiento actual) y la contadora la va a querer revisar al mismo tiempo que el plan de cuentas.

---

## 8. Migración de datos existentes hacia el proveedor maestro

**Alcance confirmado con Tomás: solo comprobantes del ejercicio actual (`estado != 'cerrado'`).** Los 198 comprobantes con fecha ≤ 30/06/2026 marcados `cerrado` **no se tocan** — quedan archivados tal cual, como parte del balance anterior. Nada de lo que sigue les aplica: ni backfill de `proveedor_id`, ni recategorización, ni se los incluye en el conteo de "condición fiscal ambigua". El corte es el mismo que ya usa el sistema para todo lo demás (alertas, pendientes, calendario).

### Pasos

1. **Extraer proveedores únicos:** sobre `comprobantes_compra where estado != 'cerrado'`, agrupar por CUIT normalizado (sin guiones/espacios). Cada CUIT único es un candidato a fila en `proveedores`.
2. **Inferir condición fiscal por mayoría, no por el último comprobante:** para cada CUIT, mirar el campo `tipo` (A/B/C/NC) de todos sus comprobantes en el alcance. Si el 100% coincide → asignar `responsable_inscripto` (tipo A), `monotributo` (tipo B) o `exento` (tipo C) directo. **Si hay mezcla de tipos para el mismo CUIT, no autoasignar** — marcar `condicion_iva = 'no_categorizado'` y dejarlo en una lista para que alguien del equipo lo revise a mano. Una mezcla de tipos para el mismo proveedor casi siempre significa error de tipeo histórico o un cambio real de categoría (ej. un monotributista que superó el techo) — en ningún caso conviene que el sistema lo decida solo.
3. **Cruzar contra la tabla `proveedores` existente:** si ya hay una fila con nombre similar (el módulo de instructores/proveedores), no duplicar — completar `cuit` y `condicion_iva` en la fila existente si coincide claramente, o crear una fila nueva si no hay match razonable. Este cruce por nombre va a tener ambigüedad real (nombres tipeados distinto); conviene hacerlo con revisión manual antes de guardar, no automático.
4. **Backfill de `proveedor_id` en `comprobantes_compra`:** agregar la columna (`alter table comprobantes_compra add column if not exists proveedor_id uuid references proveedores(id)`) y completarla solo para los comprobantes en alcance, matcheando por CUIT ya resuelto en el paso 2-3.
5. **De acá en adelante:** el modal de carga de comprobante busca por CUIT contra `proveedores` primero; si existe, autocompleta tipo de factura sugerido y condición fiscal (el usuario puede sobreescribir); si no existe, se crea al vuelo y queda disponible para la próxima carga.

`parametros_impositivos` (sección 7) se puebla con los valores vigentes hoy (`vigente_desde` = fecha de rollout, `vigente_hasta = null`) — no hace falta reconstruir la vigencia histórica hacia atrás porque el ejercicio cerrado no se va a recalcular.

---

## 9. Notas para quien lo implemente (convención del repo)

- Seguir la convención de nombres existente: minúsculas, snake_case, prefijo por dominio (`cf_` para cash flow, sin prefijo para las tablas nuevas de contabilidad propiamente dicha: `plan_cuentas`, `asientos_contables`, `asientos_movimientos`, `cuenta_corriente_alumnos`).
- Todo lo nuevo es aditivo: no se modifica el comportamiento actual de `pg-cashflow`, `pg-comprobantes`, `pg-sueldos` hasta que el asiento automático esté validado — corren en paralelo un tiempo antes de que algo dependa exclusivamente de la contabilidad nueva.
- Los asientos se generan por trigger/función en el momento en que cambia el estado relevante (`comprobantes_compra.estado`, `ordenes_pago` insert, `cuenta_corriente_alumnos` insert), no por un job batch — así queda auditable qué evento generó cada asiento (`origen` + `origen_id`).
- Los 198 comprobantes marcados `cerrado` (pre-cierre 30/06) no deberían generar asientos retroactivos automáticos — si se necesita el asiento de apertura del ejercicio nuevo, se carga manual una sola vez con `origen = 'apertura'`.
