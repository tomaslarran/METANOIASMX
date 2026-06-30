"""
COFRADIA Collector — Lee fuentes RSS activas y popula cofradia_capturas en Supabase.
Uso: python cofradia_collector.py
Requiere: pip install requests feedparser python-dotenv
"""
import hashlib
import os
import sys
from datetime import datetime, timezone

import feedparser
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://jppxmdvddvbsvymogvcp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY no configurada")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def sb_post(path, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=data)
    if r.status_code == 409:
        return None  # duplicate (content_hash unique constraint)
    r.raise_for_status()
    return r.json()


def sb_patch(path, data):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=data)
    r.raise_for_status()
    return r.json()


def parse_date(entry):
    """Extrae fecha de publicación del entry RSS."""
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass
    return None


def get_abstract(entry):
    """Extrae el abstract/summary del entry."""
    summary = getattr(entry, "summary", "") or ""
    # Limpiar HTML básico
    import re
    summary = re.sub(r"<[^>]+>", " ", summary).strip()
    return summary[:2000] if summary else None


def content_hash(title, url):
    return hashlib.sha256(f"{title}|{url}".encode()).hexdigest()[:32]


def fetch_rss(fuente):
    """Parsea un feed RSS y retorna lista de capturas nuevas."""
    url = fuente.get("rss_url") or fuente.get("url")
    print(f"  Leyendo: {fuente['nombre']} ({url[:60]}...)")
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        print(f"    ERROR parseando feed: {e}")
        return []

    capturas = []
    for entry in feed.entries[:20]:  # máx 20 por fuente por ejecución
        titulo = getattr(entry, "title", "").strip()
        link = getattr(entry, "link", "").strip()
        if not titulo or not link:
            continue

        hash_ = content_hash(titulo, link)
        autores = ""
        if hasattr(entry, "authors"):
            autores = ", ".join(a.get("name", "") for a in entry.authors if a.get("name"))
        elif hasattr(entry, "author"):
            autores = entry.author

        capturas.append({
            "fuente_id": fuente["id"],
            "titulo_original": titulo[:500],
            "url_original": link[:1000],
            "autores": autores[:500] or None,
            "abstract": get_abstract(entry),
            "idioma_original": fuente.get("idioma", "EN"),
            "publicado_at": parse_date(entry),
            "content_hash": hash_,
            "estado": "capturada",
        })
    return capturas


def clasificar_captura(captura_id, anon_key):
    """Llama a la edge function cofradia-clasificar para procesar una captura."""
    try:
        r = requests.post(
            f"{SUPABASE_URL}/functions/v1/cofradia-clasificar",
            headers={
                "Authorization": f"Bearer {anon_key}",
                "Content-Type": "application/json",
            },
            json={"captura_id": captura_id},
            timeout=30,
        )
        if r.ok:
            data = r.json()
            print(f"    Clasificado: {data.get('categoria')} · Score {data.get('score')}/12")
            return data
        else:
            print(f"    Error clasificando: {r.text[:200]}")
    except Exception as e:
        print(f"    Error llamando edge function: {e}")
    return None


def main():
    print(f"\n{'='*60}")
    print(f"COFRADIA Collector — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")

    # Cargar fuentes activas con RSS
    fuentes = sb_get("cofradia_fuentes?activa=eq.true&rss_url=not.is.null&order=prioridad,nombre")
    if not fuentes:
        print("No hay fuentes activas con RSS configurado.")
        return

    print(f"\n{len(fuentes)} fuentes activas encontradas.\n")

    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    total_nuevas = 0
    total_clasificadas = 0

    for fuente in fuentes:
        print(f"\n[{fuente['nombre']}]")
        capturas = fetch_rss(fuente)
        nuevas = 0

        for cap in capturas:
            result = sb_post("cofradia_capturas", cap)
            if result is None:
                continue  # ya existía (duplicate hash)
            nuevas += 1
            total_nuevas += 1
            cap_id = result[0]["id"] if isinstance(result, list) else result["id"]

            # Clasificar con IA si tenemos clave
            if anon_key and cap.get("abstract"):
                data = clasificar_captura(cap_id, anon_key)
                if data:
                    total_clasificadas += 1

        # Actualizar ultimo_fetch
        sb_patch(f"cofradia_fuentes?id=eq.{fuente['id']}", {"ultimo_fetch": datetime.now(timezone.utc).isoformat()})
        print(f"    {nuevas} capturas nuevas de {len(capturas)} entradas RSS")

    print(f"\n{'='*60}")
    print(f"Resumen: {total_nuevas} capturas nuevas · {total_clasificadas} clasificadas con IA")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
