"""
COFRADIA Collector — Lee fuentes RSS activas y popula cofradia_capturas en Supabase.
Uso: python cofradia_collector.py
Requiere: pip install requests feedparser python-dotenv
Credenciales: crear .env en la carpeta Metanoia (copiar .env.template)
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import feedparser
import requests
from dotenv import load_dotenv

# Cargar .env desde la carpeta del script o la carpeta padre
_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_dir, ".env"))
load_dotenv(os.path.join(_dir, "..", ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://jppxmdvddvbsvymogvcp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY no configurada.")
    print("  Creá un archivo .env en C:\\Users\\admin\\OneDrive\\Metanoia\\ con:")
    print("  SUPABASE_SERVICE_ROLE_KEY=<tu service role key>")
    print("  (ver .env.template en esa misma carpeta)")
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def sb_post(path, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, json=data, timeout=15)
    if r.status_code == 409:
        return None  # duplicado (content_hash unique)
    r.raise_for_status()
    return r.json()


def sb_patch(path, data):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, json=data, timeout=15)
    r.raise_for_status()
    return r.json()


def parse_date(entry):
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass
    return None


def get_abstract(entry):
    summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
    summary = re.sub(r"<[^>]+>", " ", summary).strip()
    summary = re.sub(r"\s+", " ", summary)
    return summary[:2000] if summary else None


def content_hash(title, url):
    return hashlib.sha256(f"{title}|{url}".encode()).hexdigest()[:32]


def clasificar_con_ia(titulo, fuente_nombre, abstract, publicado_at):
    """Clasifica y puntúa una captura usando Claude directamente."""
    if not ANTHROPIC_KEY:
        return None

    prompt = f"""Eres asistente editorial de METANOIA SMX. Hacé DOS tareas en una sola respuesta JSON.

TAREA 1 — Clasificá en UNA de estas 8 categorías:
1. Evidencia científica, 2. Simulación médica, 3. Tecnología médica,
4. Tips y tutoriales, 5. Eventos, 6. Medicina general,
7. Técnicas quirúrgicas, 8. Producción propia

TAREA 2 — Puntuá 0-3 en cada dimensión:
- evidence_score: 3=RCT/metaanálisis/guía, 2=observacional, 1=opinión/caso, 0=sin respaldo
- regional_score: 3=aplicable Latinoamérica/Argentina, 2=adaptable, 1=interés general, 0=otro contexto
- recency_score: 3=últimos 6 meses, 2=6-12 meses, 1=12-24 meses, 0=más de 24 meses
- alignment_score: 3=simulación/formación directa, 2=área adyacente, 1=conexión débil, 0=fuera de scope

Regla total: >=7 con todas>=1 → accept | 5-6 → review | <5 o alguna=0 → discard

Devolvé SOLO JSON sin markdown:
{{"category":"<nombre exacto>","confidence":<0-1>,"evidence_score":<0-3>,"regional_score":<0-3>,"recency_score":<0-3>,"alignment_score":<0-3>,"total":<suma>,"recommendation":"<accept|review|discard>","reasoning":"<1-2 frases>"}}

TÍTULO: {titulo}
FUENTE: {fuente_nombre}
FECHA: {publicado_at or "desconocida"}
ABSTRACT: {abstract or "(sin abstract)"}"""

    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 300, "messages": [{"role": "user", "content": prompt}]},
            timeout=20,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"].strip()
        text = re.sub(r"^```[a-z]*\n?", "", text).rstrip("`").strip()
        return json.loads(text)
    except Exception as e:
        print(f"    IA error: {e}")
        return None


def fetch_rss(fuente):
    url = fuente.get("rss_url") or fuente.get("url")
    print(f"  Leyendo: {fuente['nombre']} — {url[:70]}")
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        print(f"    ERROR feed: {e}")
        return []

    entries = []
    for entry in feed.entries[:20]:
        titulo = (getattr(entry, "title", "") or "").strip()
        link = (getattr(entry, "link", "") or "").strip()
        if not titulo or not link:
            continue

        autores = ""
        if hasattr(entry, "authors"):
            autores = ", ".join(a.get("name", "") for a in entry.authors if a.get("name"))
        elif hasattr(entry, "author"):
            autores = entry.author or ""

        entries.append({
            "fuente_id": fuente["id"],
            "titulo_original": titulo[:500],
            "url_original": link[:1000],
            "autores": autores[:500] or None,
            "abstract": get_abstract(entry),
            "idioma_original": fuente.get("idioma", "EN"),
            "publicado_at": parse_date(entry),
            "content_hash": content_hash(titulo, link),
            "estado": "capturada",
        })
    return entries


def main():
    print(f"\n{'='*60}")
    print(f"COFRADIA Collector — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")
    print(f"Anthropic API: {'OK disponible' if ANTHROPIC_KEY else 'NO configurada (sin clasificacion IA)'}")

    fuentes = sb_get("cofradia_fuentes?activa=eq.true&rss_url=not.is.null&order=prioridad,nombre")
    if not fuentes:
        print("\nNo hay fuentes activas con RSS. Cargá fuentes en Supabase → cofradia_fuentes.")
        return

    print(f"\n{len(fuentes)} fuentes activas.\n")

    total_nuevas = 0
    total_clasificadas = 0

    for fuente in fuentes:
        print(f"\n[{fuente['nombre']}]")
        entries = fetch_rss(fuente)
        nuevas = 0

        for cap in entries:
            result = sb_post("cofradia_capturas", cap)
            if result is None:
                continue  # ya existe

            nuevas += 1
            total_nuevas += 1
            saved = result[0] if isinstance(result, list) else result
            cap_id = saved["id"]

            # Clasificar con IA si hay abstract
            if ANTHROPIC_KEY and cap.get("abstract"):
                ia = clasificar_con_ia(
                    cap["titulo_original"],
                    fuente["nombre"],
                    cap["abstract"],
                    cap.get("publicado_at"),
                )
                if ia:
                    total_clasificadas += 1
                    score = ia.get("total", 0)
                    sb_patch(f"cofradia_capturas?id=eq.{cap_id}", {
                        "categoria": ia.get("category"),
                        "score": score,
                        "score_breakdown": {
                            "evidence": ia.get("evidence_score"),
                            "regional": ia.get("regional_score"),
                            "recency": ia.get("recency_score"),
                            "alignment": ia.get("alignment_score"),
                        },
                        "confianza_ia": ia.get("confidence"),
                        "razonamiento_ia": ia.get("reasoning"),
                        "nivel_evidencia": "Alto" if ia.get("evidence_score", 0) >= 3 else "Medio" if ia.get("evidence_score", 0) >= 2 else "Bajo",
                        "estado": "triage",
                    })
                    rec = ia.get("recommendation", "")
                    rec_sym = "[ACCEPT]" if rec == "accept" else "[REVIEW]" if rec == "review" else "[DISCARD]"
                    print(f"    {rec_sym} {ia.get('category')} · Score {score}/12")

        sb_patch(f"cofradia_fuentes?id=eq.{fuente['id']}", {"ultimo_fetch": datetime.now(timezone.utc).isoformat()})
        print(f"    >> {nuevas} nuevas de {len(entries)} entradas")

    print(f"\n{'='*60}")
    print(f"Total: {total_nuevas} capturas nuevas · {total_clasificadas} clasificadas")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
