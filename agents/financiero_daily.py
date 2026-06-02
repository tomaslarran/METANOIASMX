"""
Agente Financiero Diario — Metanoia SMX
Ejecutar cada mañana para obtener el reporte financiero del día.

Requiere en .env:
  ANTHROPIC_API_KEY=...
  SUPABASE_URL=https://jppxmdvddvbsvymogvcp.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=...
  METANOIA_ENV_ID=env_...
  METANOIA_FINANCIERO_AGENT_ID=agent_...
"""

import os
import json
import asyncio
import httpx
from datetime import datetime, date
from anthropic import AsyncAnthropic

# ── Configuración ──────────────────────────────────────────────────────────────
SB_URL  = os.environ["SUPABASE_URL"]
SB_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ENV_ID  = os.environ["METANOIA_ENV_ID"]
AGENT_ID = os.environ["METANOIA_FINANCIERO_AGENT_ID"]

client = AsyncAnthropic()

# ── Helpers Supabase ────────────────────────────────────────────────────────────
async def sb(path: str) -> list | dict:
    """Consulta la API REST de Supabase."""
    async with httpx.AsyncClient() as http:
        r = await http.get(
            f"{SB_URL}/rest/v1/{path}",
            headers={
                "apikey": SB_KEY,
                "Authorization": f"Bearer {SB_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )
        r.raise_for_status()
        return r.json()

# ── Implementación de custom tools ─────────────────────────────────────────────
async def tool_get_cashflow_resumen(sociedad: str, periodo: str = None) -> str:
    if not periodo:
        periodo = date.today().strftime("%Y-%m")

    conceptos = await sb("cf_conceptos?activo=eq.true&select=id,nombre,tipo,categoria")
    valores   = await sb(f"cf_valores?periodo=eq.{periodo}&select=concepto_id,monto,monto_real")

    val_map = {v["concepto_id"]: v for v in valores}
    rows = []
    for c in conceptos:
        v = val_map.get(c["id"], {})
        rows.append({
            "concepto": c["nombre"],
            "tipo":     c["tipo"],
            "categoria": c["categoria"],
            "proyectado": v.get("monto", 0),
            "real":       v.get("monto_real", 0),
        })

    total_proy  = sum(r["proyectado"] or 0 for r in rows if r["tipo"] == "ingreso") - \
                  sum(r["proyectado"] or 0 for r in rows if r["tipo"] == "egreso")
    total_real  = sum(r["real"] or 0 for r in rows if r["tipo"] == "ingreso") - \
                  sum(r["real"] or 0 for r in rows if r["tipo"] == "egreso")

    return json.dumps({
        "periodo": periodo,
        "sociedad": sociedad,
        "conceptos": rows[:30],  # limitar para el contexto
        "resumen": {
            "resultado_proyectado": total_proy,
            "resultado_real":       total_real,
            "diferencia":           total_real - total_proy,
        }
    }, ensure_ascii=False, default=str)


async def tool_get_cobranzas_pendientes(dias_vencimiento: int = 30, solo_vencidas: bool = False) -> str:
    hoy = date.today().isoformat()
    if solo_vencidas:
        query = f"cf_cobranzas?fecha_vencimiento=lt.{hoy}&estado=neq.cobrado&order=fecha_vencimiento"
    else:
        from datetime import timedelta
        limite = (date.today() + timedelta(days=dias_vencimiento)).isoformat()
        query = f"cf_cobranzas?fecha_vencimiento=lte.{limite}&estado=neq.cobrado&order=fecha_vencimiento"

    cobranzas = await sb(query)
    total = sum(float(c.get("monto", 0)) for c in cobranzas)
    return json.dumps({
        "cobranzas": cobranzas,
        "total_pendiente": total,
        "cantidad": len(cobranzas),
        "hoy": hoy,
    }, ensure_ascii=False, default=str)


async def tool_get_prestamos_activos() -> str:
    prestamos = await sb("cf_prestamos?activo=eq.true&select=*")
    # Cuotas próximas (no pagadas, próximos 30 días)
    from datetime import timedelta
    limite = (date.today() + timedelta(days=30)).isoformat()
    hoy = date.today().isoformat()
    cuotas = await sb(
        f"cf_prest_cuotas?pagada=eq.false&fecha_vencimiento=gte.{hoy}&fecha_vencimiento=lte.{limite}&order=fecha_vencimiento"
    ) if prestamos else []

    return json.dumps({
        "prestamos": prestamos,
        "cuotas_proximas_30d": cuotas,
        "total_cuotas": sum(float(c.get("monto_total", 0) or c.get("capital", 0)) for c in cuotas),
    }, ensure_ascii=False, default=str)


async def tool_get_inversiones() -> str:
    inversiones = await sb("cf_inversiones?estado=neq.rescatado&select=*")
    from datetime import timedelta
    hace7 = (date.today() - timedelta(days=7)).isoformat()
    rendimientos = await sb(f"rendimientos_diarios?fecha=gte.{hace7}&order=fecha.desc&limit=50")

    total_capital = sum(float(i.get("capital", 0)) for i in inversiones)
    total_actual  = sum(float(i.get("valor_actual", 0)) for i in inversiones)

    return json.dumps({
        "inversiones": inversiones,
        "rendimientos_7d": rendimientos,
        "resumen": {
            "total_capital":  total_capital,
            "total_actual":   total_actual,
            "ganancia_total": total_actual - total_capital,
        }
    }, ensure_ascii=False, default=str)


async def tool_get_caja_hoy(sociedad: str) -> str:
    hoy = date.today().isoformat()

    # Saldo banco (último movimiento)
    banco = await sb(
        f"banco_movimientos?sociedad=eq.{sociedad}&order=fecha.desc&limit=1"
    )
    saldo_banco = float(banco[0]["saldo"]) if banco else 0

    # Movimientos de caja del día
    caja_movs = await sb(
        f"caja_movimientos?sociedad=eq.{sociedad}&fecha=eq.{hoy}&order=created_at.desc"
    )
    efectivo = sum(
        float(m["monto"]) * (1 if m["tipo"] == "ingreso" else -1)
        for m in caja_movs
    )

    return json.dumps({
        "sociedad": sociedad,
        "fecha": hoy,
        "saldo_banco": saldo_banco,
        "movimientos_hoy": caja_movs,
        "efectivo_hoy": efectivo,
        "posicion_total": saldo_banco + efectivo,
    }, ensure_ascii=False, default=str)


async def tool_get_inscripciones_pendientes(solo_pendientes: bool = True) -> str:
    if solo_pendientes:
        insc = await sb(
            "inscripciones?estado=in.(pendiente,cuotas)&select=id,alumno_id,curso_id,monto,cuotas,cursos(nombre,arancel),alumnos(nombre,apellido)&order=created_at.desc&limit=50"
        )
    else:
        insc = await sb(
            "inscripciones?select=id,alumno_id,curso_id,estado,monto,cursos(nombre),alumnos(nombre,apellido)&order=created_at.desc&limit=50"
        )
    total = sum(float(i.get("monto", 0)) for i in insc)
    return json.dumps({"inscripciones": insc, "total_cobrado": total}, ensure_ascii=False, default=str)


# ── Dispatcher de tools ─────────────────────────────────────────────────────────
async def ejecutar_tool(name: str, input_data: dict) -> str:
    """Ejecuta el custom tool y retorna el resultado."""
    try:
        if name == "get_cashflow_resumen":
            return await tool_get_cashflow_resumen(**input_data)
        elif name == "get_cobranzas_pendientes":
            return await tool_get_cobranzas_pendientes(**input_data)
        elif name == "get_prestamos_activos":
            return await tool_get_prestamos_activos()
        elif name == "get_inversiones":
            return await tool_get_inversiones()
        elif name == "get_caja_hoy":
            return await tool_get_caja_hoy(**input_data)
        elif name == "get_inscripciones_pendientes":
            return await tool_get_inscripciones_pendientes(**input_data)
        else:
            return json.dumps({"error": f"Tool desconocida: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e), "tool": name})


# ── Loop principal de la sesión ──────────────────────────────────────────────────
async def run_daily_report() -> str:
    """Crea una sesión, solicita el reporte diario y retorna el texto."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando sesión del agente financiero...")

    session = await client.beta.sessions.create(
        agent=AGENT_ID,
        environment_id=ENV_ID,
        title=f"Reporte financiero {date.today().isoformat()}",
    )
    print(f"✓ Sesión: {session.id}")
    print(f"  Console: https://platform.claude.com/workspaces/default/sessions/{session.id}")

    # Enviar solicitud de reporte
    prompt = f"""Generá el reporte financiero diario de Metanoia SMX para hoy {date.today().strftime('%d/%m/%Y')}.

Incluí:
1. **Posición de caja** — saldo banco + efectivo de SUDES y POINTERS
2. **Cash flow del mes** — proyectado vs real, diferencia y % de ejecución
3. **Alertas de cobranzas** — vencidas y próximas a vencer (30 días)
4. **Cuotas de préstamos** — próximas a vencer este mes
5. **Inversiones** — valor actual y rendimiento de la semana
6. **Inscripciones con saldo pendiente** — resumen de lo por cobrar

Terminá con un resumen ejecutivo de 3 puntos de acción prioritarios para hoy."""

    stream = await client.beta.sessions.events.stream(session.id)

    await client.beta.sessions.events.send(
        session.id,
        events=[{"type": "user.message", "content": [{"type": "text", "text": prompt}]}],
    )

    reporte_final = []

    async for event in stream:
        if event.type == "agent.message":
            for block in event.content:
                if block.type == "text" and block.text:
                    print(block.text, end="", flush=True)
                    reporte_final.append(block.text)

        elif event.type == "agent.custom_tool_use":
            print(f"\n  [tool: {event.name}({json.dumps(event.input, ensure_ascii=False)[:60]}...)]")
            resultado = await ejecutar_tool(event.name, event.input or {})
            await client.beta.sessions.events.send(
                session.id,
                events=[{
                    "type": "user.custom_tool_result",
                    "custom_tool_use_id": event.id,
                    "content": [{"type": "text", "text": resultado}],
                }],
            )

        elif event.type == "session.status_terminated":
            break
        elif event.type == "session.status_idle":
            if event.stop_reason.type != "requires_action":
                break

    print("\n")
    await client.beta.sessions.archive(session.id)
    return "".join(reporte_final)


# ── Entry point ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    reporte = asyncio.run(run_daily_report())
    # Guardar reporte en archivo con fecha
    output_file = f"reporte_financiero_{date.today().isoformat()}.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(reporte)
    print(f"✅ Reporte guardado en {output_file}")
