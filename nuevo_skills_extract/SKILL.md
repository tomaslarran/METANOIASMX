# Skill: Resumen semanal de Cash Flow — Metanoia SMX

## Cuándo usar esta skill
Cuando Tomás quiera un resumen rápido del estado financiero de Metanoia sin abrir el panel. Ideal para el lunes a la mañana o antes de una reunión.

## Uso
```bash
python ~/.claude/skills/cashflow/resumen_cashflow.py
# Con sociedad específica:
python ~/.claude/skills/cashflow/resumen_cashflow.py --sociedad SUDES
python ~/.claude/skills/cashflow/resumen_cashflow.py --sociedad POINTERS
```

## Qué muestra
- Saldo actual de caja por sociedad
- Últimos 10 movimientos bancarios
- Cobranzas pendientes
- Préstamos activos con saldo
- Inversiones activas con rendimiento acumulado
- Alertas: pagos vencidos, cheques próximos a vencer

## Archivos
```
~/.claude/skills/cashflow/
├── SKILL.md
└── resumen_cashflow.py
```

## Variables de entorno necesarias
```bash
export SUPABASE_URL="https://jppxmdvddvbsvymogvcp.supabase.co"
export SUPABASE_KEY="tu_service_role_key"
```
