#!/usr/bin/env python3
"""
Skill: Resumen semanal de Cash Flow — Metanoia SMX
Lee directamente desde Supabase y muestra un resumen ejecutivo en terminal.

Requiere:
  pip install httpx python-dateutil --break-system-packages

Variables de entorno:
  SUPABASE_URL = https://jppxmdvddvbsvymogvcp.supabase.co
  SUPABASE_KEY = tu service_role key
"""

import os
import argparse
from datetime import datetime, timedelta
import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://jppxmdvddvbsvymogvcp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
GRAY   = "\033[90m"


def sb(path):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, timeout=10)
    r.raise_for_status()
    return r.json()


def fmt_money(n):
    if n is None:
        return "$0"
    try:
        n = float(n)
        color = GREEN if n >= 0 else RED
        return f"{color}${n:,.0f}{RESET}"
    except:
        return str(n)


def separador(titulo=""):
    linea = "─" * 60
    if titulo:
        print(f"\n{BOLD}{CYAN}{titulo}{RESET}")
        print(GRAY + linea + RESET)
    else:
        print(GRAY + linea + RESET)


def resumen_caja(sociedad=None):
    separador("💰 SALDO DE CAJA")
    filtro = f"&sociedad=eq.{sociedad}" if sociedad else ""
    movs = sb(f"caja_movimientos?select=sociedad,tipo,monto&order=fecha.desc{filtro}")

    saldos = {}
    for m in movs:
        soc = m.get("sociedad", "?")
        monto = float(m.get("monto", 0) or 0)
        tipo = m.get("tipo", "")
        if soc not in saldos:
            saldos[soc] = 0
        saldos[soc] += monto if tipo == "ingreso" else -monto

    if not saldos:
        print("  Sin datos de caja")
        return

    for soc, saldo in saldos.items():
        print(f"  {BOLD}{soc}{RESET}: {fmt_money(saldo)}")


def ultimos_movimientos(sociedad=None):
    separador("🏦 ÚLTIMOS MOVIMIENTOS BANCARIOS")
    filtro = f"&sociedad=eq.{sociedad}" if sociedad else ""
    movs = sb(f"banco_movimientos?select=fecha,concepto,importe,sociedad,conciliado&order=fecha.desc&limit=10{filtro}")

    if not movs:
        print("  Sin movimientos recientes")
        return

    for m in movs:
        fecha   = m.get("fecha", "")[:10]
        concepto = (m.get("concepto") or "")[:45]
        importe = float(m.get("importe", 0) or 0)
        conciliado = "✓" if m.get("conciliado") else f"{YELLOW}⚠{RESET}"
        color = GREEN if importe >= 0 else RED
        print(f"  {GRAY}{fecha}{RESET}  {concepto:<46} {color}${importe:>10,.0f}{RESET}  {conciliado}")


def cobranzas_pendientes():
    separador("📋 COBRANZAS PENDIENTES")
    hoy = datetime.now().date()
    cobranzas = sb("cf_cobranzas?select=concepto,monto,fecha_vencimiento,estado&order=fecha_vencimiento.asc")

    pendientes = [c for c in cobranzas if c.get("estado") not in ("cobrado", "acreditado")]
    if not pendientes:
        print(f"  {GREEN}Sin cobranzas pendientes{RESET}")
        return

    for c in pendientes[:10]:
        concepto = (c.get("concepto") or "")[:40]
        monto    = float(c.get("monto", 0) or 0)
        vto      = c.get("fecha_vencimiento", "")[:10]
        try:
            dias = (datetime.strptime(vto, "%Y-%m-%d").date() - hoy).days
            alerta = f"{RED}VENCIDO{RESET}" if dias < 0 else (f"{YELLOW}{dias}d{RESET}" if dias <= 7 else f"{GREEN}{dias}d{RESET}")
        except:
            alerta = vto
        print(f"  {concepto:<41} {fmt_money(monto):>15}  vto: {alerta}")


def prestamos_activos():
    separador("💳 PRÉSTAMOS ACTIVOS")
    prestamos = sb("cf_prestamos?select=nombre,saldo_actual,cuota,fecha_vencimiento&order=fecha_vencimiento.asc")

    activos = [p for p in prestamos if float(p.get("saldo_actual", 0) or 0) > 0]
    if not activos:
        print(f"  {GREEN}Sin préstamos activos{RESET}")
        return

    total = 0
    for p in activos:
        nombre = (p.get("nombre") or "")[:40]
        saldo  = float(p.get("saldo_actual", 0) or 0)
        cuota  = float(p.get("cuota", 0) or 0)
        vto    = (p.get("fecha_vencimiento") or "")[:10]
        total += saldo
        print(f"  {nombre:<41} saldo: {fmt_money(saldo):>12}  cuota: {fmt_money(cuota):>10}  vto: {GRAY}{vto}{RESET}")

    print(f"\n  {BOLD}Total deuda:{RESET} {fmt_money(total)}")


def inversiones_activas():
    separador("📈 INVERSIONES ACTIVAS")
    inversiones = sb("cf_inversiones?select=nombre,monto_actual,rendimiento_total&order=monto_actual.desc")

    activas = [i for i in inversiones if float(i.get("monto_actual", 0) or 0) > 0]
    if not activas:
        print("  Sin inversiones activas")
        return

    total = 0
    for i in activas[:8]:
        nombre  = (i.get("nombre") or "")[:40]
        monto   = float(i.get("monto_actual", 0) or 0)
        rend    = float(i.get("rendimiento_total", 0) or 0)
        total  += monto
        print(f"  {nombre:<41} {fmt_money(monto):>15}  rend: {fmt_money(rend):>12}")

    print(f"\n  {BOLD}Total invertido:{RESET} {fmt_money(total)}")


def main():
    parser = argparse.ArgumentParser(description="Resumen Cash Flow Metanoia SMX")
    parser.add_argument("--sociedad", choices=["SUDES", "POINTERS"], help="Filtrar por sociedad")
    args = parser.parse_args()

    if not SUPABASE_KEY:
        print(f"{RED}Error: falta SUPABASE_KEY en variables de entorno{RESET}")
        print("Ejecutá: export SUPABASE_KEY='tu_service_role_key'")
        return

    ahora = datetime.now().strftime("%d/%m/%Y %H:%M")
    filtro_txt = f" — {args.sociedad}" if args.sociedad else " — Todas las sociedades"

    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  RESUMEN CASH FLOW — METANOIA SMX{filtro_txt}{RESET}")
    print(f"{GRAY}  Generado: {ahora}{RESET}")
    print(f"{BOLD}{'═'*60}{RESET}")

    resumen_caja(args.sociedad)
    ultimos_movimientos(args.sociedad)
    cobranzas_pendientes()
    prestamos_activos()
    inversiones_activas()

    separador()
    print(f"{GRAY}  Panel completo: https://tomaslarran.github.io/METANOIASMX/{RESET}\n")


if __name__ == "__main__":
    main()
