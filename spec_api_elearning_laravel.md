# Spec API E-Learning ↔ Panel Metanoia

**Para:** Técnico Laravel  
**Proyecto:** plataforma.metanoiasmx.com  
**Objetivo:** Exponer una API REST que permita sincronización bidireccional con el panel de gestión interno.

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
PANEL_WEBHOOK_SECRET=metanoia_wh_elearning_2026   # acordar con Tomás
```

---

## 5. Notas adicionales

- Los campos `cuit` y `telefono` son críticos — el CUIT es el identificador maestro para cruzar con Finnegans y el panel de gestión.
- Formato de CUIT esperado: `20-12345678-9` (con guiones) o `20123456789` (numérico) — cualquiera sirve, el panel normaliza.
- Formato de teléfono esperado: internacional con prefijo Argentina `+549` + área + número (ej: `+5493876123456`).
- La paginación no es necesaria en una primera versión — con el volumen actual alcanza con devolver todo.
- Si algún campo no existe todavía en el modelo (ej: `cuit`), agregarlo como nullable — el panel lo maneja.
