# Spec API E-Learning ↔ Panel Metanoia

**Para:** Agustín (plataforma Laravel)  
**De:** Tomás Larrán  
**Proyecto:** plataforma.metanoiasmx.com  
**Versión:** 2 — 29/09/2026 (agrega sección 6: estado de cuenta de clientes, datos completos del registro y pagos pendientes)  
**Objetivo:** Exponer una API REST que permita sincronización bidireccional con el panel de gestión interno.

> **Lo nuevo de esta versión está en la sección 6.** El orden sugerido para implementar está en el punto 6.5. El valor de `PANEL_WEBHOOK_SECRET` te lo paso por WhatsApp, no va en este documento.

---

## 1. Autenticación

Usar **Laravel Sanctum** con un token de API estático (Personal Access Token).

```php
// En AppServiceProvider o un Seeder:
$token = User::find(1)->createToken('panel-metanoia')->plainTextToken;
// Guardar ese token como secreto ELEARNING_API_TOKEN en Supabase
```

Todas las rutas de API deben requerir `auth:sanctum` excepto el webhook (que usa su propio secreto).

```php
// routes/api.php
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/cursos', [ApiCursoController::class, 'index']);
    Route::post('/cursos', [ApiCursoController::class, 'store']);
    Route::get('/cursos/{id}', [ApiCursoController::class, 'show']);
    Route::get('/inscripciones', [ApiInscripcionController::class, 'index']);
    Route::get('/alumnos', [ApiAlumnoController::class, 'index']);
});

// Webhook — autenticado con header X-Webhook-Secret
Route::post('/webhook/inscripcion', [WebhookController::class, 'inscripcion']);
```

---

## 2. Endpoints requeridos

### GET /api/cursos
Lista todos los cursos.

**Response:**
```json
[
  {
    "id": 42,
    "nombre": "ACLS Avanzado",
    "descripcion": "Curso de soporte vital avanzado...",
    "estado": "activo",
    "fecha_inicio": "2026-09-15",
    "fecha_fin": "2026-09-20",
    "cupos_max": 20,
    "cupos_inscriptos": 14,
    "precio": 85000,
    "created_at": "2026-08-01T10:00:00Z",
    "updated_at": "2026-09-01T12:00:00Z"
  }
]
```

**Filtros opcionales (query params):**
- `?estado=activo` — filtrar por estado
- `?updated_after=2026-09-01` — solo cursos modificados después de esa fecha (para sync incremental)

**No duplicación:** el `id` de cada curso tiene que ser estable (no cambiar entre llamadas). El panel actualiza por ese `id`: si el curso ya existe lo pisa con los datos nuevos, si no existe lo crea. Se puede apretar "Actualizar" las veces que sea sin que se dupliquen. Los precios y fechas que devuelve este endpoint son los que usa el bot de mensajes para responder a los clientes.

---

### GET /api/cursos/{id}
Detalle de un curso con sus inscripciones.

**Response:**
```json
{
  "id": 42,
  "nombre": "ACLS Avanzado",
  "estado": "activo",
  "fecha_inicio": "2026-09-15",
  "fecha_fin": "2026-09-20",
  "cupos_max": 20,
  "precio": 85000,
  "inscripciones": [
    {
      "id": 101,
      "alumno_nombre": "Juan Pérez",
      "alumno_email": "jperez@hospital.com",
      "alumno_cuit": "20-12345678-9",
      "alumno_telefono": "+5493876123456",
      "fecha_inscripcion": "2026-08-20T14:30:00Z",
      "estado": "inscripto",
      "monto_pagado": 85000
    }
  ]
}
```

---

### POST /api/cursos
Crear un curso desde el panel de gestión.

**Request body:**
```json
{
  "nombre": "ACLS Avanzado",
  "descripcion": "Descripción del curso...",
  "fecha_inicio": "2026-09-15",
  "fecha_fin": "2026-09-20",
  "cupos_max": 20,
  "precio": 85000,
  "estado": "activo"
}
```

**Response:**
```json
{
  "id": 43,
  "nombre": "ACLS Avanzado",
  "created_at": "2026-09-07T10:00:00Z"
}
```

---

### GET /api/inscripciones
Lista todas las inscripciones.

**Response:**
```json
[
  {
    "id": 101,
    "curso_id": 42,
    "alumno_nombre": "Juan Pérez",
    "alumno_email": "jperez@hospital.com",
    "alumno_cuit": "20-12345678-9",
    "alumno_telefono": "+5493876123456",
    "fecha_inscripcion": "2026-08-20T14:30:00Z",
    "estado": "inscripto",
    "monto_pagado": 85000
  }
]
```

**Filtros opcionales:**
- `?curso_id=42`
- `?updated_after=2026-09-01`

---

### GET /api/alumnos
Lista todos los alumnos registrados en la plataforma.

> **Actualizado (29 Sep 2026):** cada alumno debe devolverse con el **mismo objeto completo de la sección 6.2** (nombre_completo, dni, matrícula, profesión, condición fiscal, provincia, documentos aceptados, etc.). El ejemplo de abajo es la versión mínima original.

**Response:**
```json
[
  {
    "id": 55,
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "jperez@hospital.com",
    "cuit": "20-12345678-9",
    "telefono": "+5493876123456",
    "institucion": "Hospital San Bernardo",
    "created_at": "2026-07-15T09:00:00Z"
  }
]
```

---

## 3. Webhook — nueva inscripción (e-learning → panel)

Cuando un alumno se inscribe en la plataforma, Laravel hace un POST a nuestra Edge Function.

**URL destino:**
```
POST https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/sync-elearning?source=webhook&action=webhook_inscripcion
```

**Header de autenticación:**
```
X-Webhook-Secret: [valor del secreto compartido — acordar con Tomás]
```

**Body:**
```json
{
  "action": "webhook_inscripcion",
  "inscripcion": {
    "id": 101,
    "curso_id": 42,
    "alumno_nombre": "Juan Pérez",
    "alumno_email": "jperez@hospital.com",
    "alumno_cuit": "20-12345678-9",
    "alumno_telefono": "+5493876123456",
    "fecha_inscripcion": "2026-09-07T10:00:00Z",
    "estado": "inscripto",
    "monto_pagado": 85000
  }
}
```

**Implementación en Laravel:**
```php
// Disparar en el Observer o después de crear la inscripción:
Http::withHeaders([
    'X-Webhook-Secret' => config('services.panel.webhook_secret'),
    'Content-Type' => 'application/json',
])->post(config('services.panel.webhook_url'), [
    'action' => 'webhook_inscripcion',
    'inscripcion' => [
        'id' => $inscripcion->id,
        'curso_id' => $inscripcion->curso_id,
        'alumno_nombre' => $inscripcion->alumno->nombre_completo,
        'alumno_email' => $inscripcion->alumno->email,
        'alumno_cuit' => $inscripcion->alumno->cuit,
        'alumno_telefono' => $inscripcion->alumno->telefono,
        'fecha_inscripcion' => $inscripcion->created_at,
        'estado' => $inscripcion->estado,
        'monto_pagado' => $inscripcion->monto,
    ]
]);
```

---

## 4. Variables de entorno en Laravel (.env)

```env
PANEL_WEBHOOK_URL=https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/sync-elearning?source=webhook
PANEL_WEBHOOK_SECRET=   # valor aleatorio largo, lo pasa Tomás por canal privado (no commitear)
```

---

## 5. Notas adicionales

- Los campos `cuit` y `telefono` son críticos — el CUIT es el identificador maestro para cruzar con Finnegans y el panel de gestión.
- Formato de CUIT esperado: `20-12345678-9` (con guiones) o `20123456789` (numérico) — cualquiera sirve, el panel normaliza.
- Formato de teléfono esperado: internacional con prefijo Argentina `+549` + área + número (ej: `+5493876123456`).
- La paginación no es necesaria en una primera versión — con el volumen actual alcanza con devolver todo.
- Si algún campo no existe todavía en el modelo (ej: `cuit`), agregarlo como nullable — el panel lo maneja.

---

## 6. Estado de cuenta de clientes (Finnegans) — eventos al panel

**Objetivo:** que el panel se entere en tiempo real de todo el ciclo de vida de un alumno como cliente: alta, pago, factura y vencimiento de suscripción. La plataforma ya habla con Finnegans; el panel **solo escucha**, no le escribe a Finnegans.

### 6.1 Formato común de eventos

Todos los eventos van al **mismo endpoint** que el webhook de inscripción, con el mismo header `X-Webhook-Secret`:

```
POST https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/sync-elearning?source=webhook
X-Webhook-Secret: <PANEL_WEBHOOK_SECRET>
Content-Type: application/json
```

```json
{
  "action": "webhook_evento",
  "evento": {
    "id": "evt_000123",
    "tipo": "pago.aprobado",
    "ocurrido_en": "2026-10-01T14:30:00-03:00",
    "alumno": { ... },
    "datos": { ... }
  }
}
```

- `evento.id` — **único e inmutable** por evento. Si Laravel reintenta el mismo evento, debe mandar el mismo `id`; el panel lo ignora si ya lo procesó (idempotencia).
- `evento.alumno` — siempre presente, mismo objeto en todos los eventos (ver 6.2).
- `evento.datos` — cambia según el `tipo` (ver 6.3).
- **Reintentos:** si el panel no responde `2xx`, reintentar con backoff (ej: 1 min, 5 min, 30 min, 2 h, 12 h). Recomendado usar una Job en cola de Laravel.
- Responder rápido: el panel contesta en < 2 s; no hace falta esperar nada más.

### 6.2 Objeto `alumno` (en todos los eventos)

Mandar **todos los datos que pide el formulario "Registro al campus"**, así el panel queda con la misma ficha que la plataforma:

```json
{
  "id": 55,
  "nombre_completo": "Juan Pérez",
  "email": "jperez@hospital.com",
  "dni": "12345678",
  "cuit": "20-12345678-9",
  "telefono": "+5493876123456",
  "matricula": "MP 1234",
  "profesion": "Médico",
  "condicion_fiscal": "responsable_inscripto",
  "tipo_persona": "fisica",
  "razon_social": null,
  "provincia": "Salta",
  "documentos_aceptados": [
    { "documento": "Política de privacidad y tratamiento de datos", "version": "1.0", "aceptado_en": "2026-09-29T10:00:00-03:00" },
    { "documento": "Términos y condiciones de contratación", "version": "1.0", "aceptado_en": "2026-09-29T10:00:00-03:00" }
  ],
  "registrado_en": "2026-09-29T10:00:00-03:00",
  "finnegans_cliente_codigo": "CLI-000123"
}
```

| Campo | Estado en el registro actual | Nota |
|---|---|---|
| `nombre_completo`, `email`, `dni`, `cuit`, `matricula`, `profesion` | ✅ ya se piden | `dni` acepta cédula extranjera, mandarlo tal cual |
| `documentos_aceptados` | ✅ ya se piden (checkboxes) | Mandar documento + versión + fecha de aceptación: es la evidencia legal del consentimiento |
| `condicion_fiscal` | ➕ **agregar** (acordado en la reunión) | Uno de `responsable_inscripto`, `monotributista`, `exento`, `consumidor_final`. **Factura A solo a `responsable_inscripto`, B al resto.** "Autónomo" no es una condición frente al IVA: un autónomo es responsable inscripto o exento |
| `tipo_persona` | ➕ **agregar** | `fisica` o `juridica` — para empresas/laboratorios que se registran por CUIT. Si es `juridica`, pedir también `razon_social` |
| `provincia` | ➕ **agregar** | Provincia del cliente. Sirve para completar "Provincia de destino" de la factura en Finnegans sin carga manual |
| `telefono` | ➕ **agregar** (si no está más abajo en el formulario) | Formato `+549` + área + número. Es lo que usamos para el seguimiento por WhatsApp (renovaciones, pagos pendientes) |
| `finnegans_cliente_codigo` | automático | Código del cliente en Finnegans. `null` si todavía no se creó |

### 6.3 Tipos de evento

| `tipo` | Cuándo dispararlo | `datos` |
|---|---|---|
| `cliente.creado` | Al crear el cliente en Finnegans (alta del alumno) | `{}` |
| `cliente.actualizado` | Si cambian CUIT, condición fiscal, email o teléfono | `{}` |
| `pago.pendiente` | Cuando se crea la orden de pago (el usuario se registró / eligió curso o plan pero todavía no pagó) | mismo formato que `pago.aprobado` |
| `pago.aprobado` | Cuando MercadoPago / Viumi confirma el pago | ver abajo |
| `pago.rechazado` | Pago rechazado o devuelto | mismo formato que `pago.aprobado` |
| `factura.emitida` | Cuando Finnegans devuelve la factura (con o sin CAE) | ver abajo |
| `factura.error` | Si Finnegans rechaza la factura | `{ "pago_id", "error" }` |
| `suscripcion.por_vencer` | **7 días antes** del vencimiento (un solo aviso por período) | ver abajo |
| `suscripcion.vencida` | El día que vence sin renovar | ver abajo |
| `suscripcion.renovada` | Cuando se renueva (pago de un nuevo período) | ver abajo |

**`pago.aprobado` / `pago.rechazado`:**
```json
{
  "pago_id": 9001,
  "concepto": "curso",
  "curso_id": 42,
  "suscripcion_id": null,
  "monto": 85000,
  "moneda": "ARS",
  "medio_pago": "mercadopago",
  "referencia_externa": "MP-1234567890",
  "fecha_pago": "2026-10-01T14:29:00-03:00"
}
```
- `concepto`: `curso` o `suscripcion` (uno de `curso_id` / `suscripcion_id` va en `null`).
- `medio_pago`: `mercadopago`, `viumi`, `transferencia`, `otro` (`null` en `pago.pendiente` si todavía no eligió).
- **`pago_id` es el mismo** en `pago.pendiente` y en el `pago.aprobado`/`pago.rechazado` que lo resuelve — así el panel sabe que ese pendiente ya se pagó. Con esto el panel arma la lista de "se registraron y no pagaron" para hacerles seguimiento.

**`factura.emitida`:**
```json
{
  "pago_id": 9001,
  "tipo_comprobante": "FB",
  "punto_venta": "0003",
  "numero": "00001234",
  "fecha": "2026-10-01",
  "neto": 70247.93,
  "iva": 14752.07,
  "total": 85000,
  "cae": "76123456789012",
  "cae_vencimiento": "2026-10-11",
  "finnegans_comprobante_id": "FAC-000987",
  "pdf_url": "https://plataforma.metanoiasmx.com/facturas/9001.pdf"
}
```
- `cae` y `cae_vencimiento` van en `null` si se emitió sin CAE automático (borrador).
- `pdf_url` opcional; si existe, debe ser accesible sin login o con URL firmada.

**`suscripcion.por_vencer` / `suscripcion.vencida` / `suscripcion.renovada`:**
```json
{
  "suscripcion_id": 300,
  "plan": "Médico Externo",
  "periodicidad": "mensual",
  "monto": 25000,
  "fecha_inicio": "2026-09-01",
  "fecha_vencimiento": "2026-10-01",
  "renovacion_automatica": false
}
```

### 6.4 Endpoint de consulta — estado de cuenta

Para reconciliar (por si se perdió algún evento) y para que el panel muestre el estado al abrir la ficha de un alumno.

```
GET /api/alumnos/{cuit}/estado-cuenta        (auth:sanctum)
```
`{cuit}` con o sin guiones.

```json
{
  "alumno": { ...mismo objeto que 6.2... },
  "saldo": 0,
  "pagos": [ { ...formato pago.aprobado + "estado": "aprobado" } ],
  "facturas": [ { ...formato factura.emitida } ],
  "suscripciones": [ { ...formato suscripcion + "estado": "activa|vencida|cancelada" } ]
}
```
- `saldo` — lo que el alumno debe (positivo) o tiene a favor (negativo). Si hoy no se lleva, devolver `0`.
- `404` si el CUIT no existe.

Opcional (útil para sync nocturno, no bloqueante):
```
GET /api/eventos?desde=2026-10-01T00:00:00Z   (auth:sanctum)
```
Devuelve la lista de eventos (mismo formato que 6.1) ocurridos desde esa fecha, para que el panel recupere los que se hayan perdido.

### 6.5 Orden de prioridad para implementar

1. Campos nuevos del registro: `condicion_fiscal` (define Factura A/B — ya acordado), `tipo_persona`/`razon_social`, `provincia`, `telefono`.
2. `pago.pendiente`, `pago.aprobado` y `factura.emitida` — lo más importante para el estado de cuenta y el seguimiento de pagos pendientes.
3. `suscripcion.por_vencer` / `suscripcion.vencida` — requiere un comando programado diario (`php artisan schedule`).
4. `cliente.creado` / `cliente.actualizado`.
5. `GET /api/alumnos/{cuit}/estado-cuenta`.
6. `GET /api/eventos` (opcional).
