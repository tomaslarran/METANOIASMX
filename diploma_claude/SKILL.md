# Skill: Generar diploma Metanoia SMX

## Cuándo usar esta skill
Cuando alguien del equipo pida generar un diploma, certificado o constancia de curso para un alumno de Metanoia SMX.

## Ubicación de archivos
```
~/.claude/skills/diploma/
├── SKILL.md              ← este archivo
├── fondo.png             ← fondo del diploma (NO modificar)
├── generar_diploma.py    ← script principal
└── output/               ← diplomas generados (se crea automáticamente)
```

## Uso básico

```bash
python ~/.claude/skills/diploma/generar_diploma.py \
  --nombre "María Belén Barros" \
  --dni "40.637.495" \
  --mp "12345" \
  --curso "Broncoscopía en Cuidados Críticos" \
  --instructores "Dr. Marcos Las Heras y Dr. Indalecio Carboni Bisso" \
  --fecha "3 de junio de 2026"
```

## Con envío por email

```bash
python ~/.claude/skills/diploma/generar_diploma.py \
  --nombre "María Belén Barros" \
  --dni "40.637.495" \
  --mp "12345" \
  --curso "Broncoscopía en Cuidados Críticos" \
  --instructores "Dr. Marcos Las Heras y Dr. Indalecio Carboni Bisso" \
  --fecha "3 de junio de 2026" \
  --email "alumno@email.com" \
  --gmail-user "tlarran@metanoiasmx.com" \
  --gmail-pass "TU_APP_PASSWORD"
```

## Datos que necesitás tener antes de correrlo
- Nombre completo del alumno
- DNI (formato: 40.637.495)
- Matrícula profesional (MP)
- Nombre exacto del curso
- Instructores del curso
- Fecha de finalización
- Email del alumno (opcional, para envío automático)

## Cómo obtener el App Password de Gmail
1. Ir a myaccount.google.com → Seguridad → Verificación en 2 pasos
2. Al final de esa página → Contraseñas de aplicaciones
3. Crear una para "Metanoia Diplomas"
4. Usar esa contraseña de 16 caracteres en --gmail-pass

## Notas importantes
- El diploma se guarda en output/ con timestamp para no sobrescribir
- El fondo.png es A4 landscape a 300dpi (3508x2480px) — no redimensionar
- Si el nombre del alumno es muy largo, reducir el tamaño de fuente en el script (f_nombre)
- El script usa fuentes DejaVu — si en algún momento se quiere cambiar la tipografía, reemplazar las rutas en cargar_fuentes()

## Consultar datos desde Supabase
Si el alumno ya está cargado en el panel, podés pedirle a Claude Code que lea los datos directo:

```python
import httpx, os

SUPABASE_URL = "https://jppxmdvddvbsvymogvcp.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

r = httpx.get(
    f"{SUPABASE_URL}/rest/v1/inscripciones?select=*,alumnos(*),cursos(*)&id=eq.{inscripcion_id}",
    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
)
data = r.json()[0]
nombre = f"{data['alumnos']['nombre']} {data['alumnos']['apellido']}"
dni    = data['alumnos']['dni']
curso  = data['cursos']['nombre']
```
