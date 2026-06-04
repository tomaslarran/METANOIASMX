#!/usr/bin/env python3
"""
Skill: Generar diploma Metanoia SMX
Uso: python generar_diploma.py --nombre "Juan Pérez" --dni "30.123.456" --mp "9876" --curso "Nombre del Curso" --instructores "Dr. X y Dr. Y" --fecha "3 de junio de 2026" --email "alumno@email.com"

Genera PNG del diploma y opcionalmente lo envía por Gmail.
El fondo debe estar en la misma carpeta: fondo.png
"""

import argparse
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONDO_PATH = os.path.join(SCRIPT_DIR, "fondo.png")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
COLOR = (52, 48, 90)
CAR = 50


def cargar_fuentes():
    rutas = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    try:
        f_nombre = ImageFont.truetype(rutas[0], 105)
        f_curso  = ImageFont.truetype(rutas[0], 82)
        f_normal = ImageFont.truetype(rutas[1], 80)
        f_fecha  = ImageFont.truetype(rutas[1], 72)
    except Exception:
        f_nombre = f_curso = f_normal = f_fecha = ImageFont.load_default()
    return f_nombre, f_curso, f_normal, f_fecha


def generar_diploma(nombre, dni, mp, curso, instructores, fecha):
    fondo = Image.open(FONDO_PATH).convert("RGB")
    draw = ImageDraw.Draw(fondo)
    f_nombre, f_curso, f_normal, f_fecha = cargar_fuentes()

    draw.text((1748, 760),        nombre,       font=f_nombre, fill=COLOR, anchor="mm")
    draw.text((954,  960+CAR),    dni,          font=f_normal, fill=COLOR, anchor="lm")
    draw.text((2004, 960+CAR),    mp,           font=f_normal, fill=COLOR, anchor="lm")
    draw.text((1748, 1250+CAR),   curso,        font=f_curso,  fill=COLOR, anchor="mm")
    draw.text((1748, 1590),       instructores, font=f_normal, fill=COLOR, anchor="mm")
    draw.text((2740, 1810),       fecha,        font=f_fecha,  fill=COLOR, anchor="lm")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    nombre_archivo = nombre.replace(" ", "_").lower()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = os.path.join(OUTPUT_DIR, f"diploma_{nombre_archivo}_{timestamp}.png")
    fondo.save(output_path, quality=95)
    print(f"Diploma generado: {output_path}")
    return output_path


def enviar_por_email(diploma_path, email_destino, nombre_alumno, curso, gmail_user, gmail_password):
    msg = MIMEMultipart()
    msg["From"]    = gmail_user
    msg["To"]      = email_destino
    msg["Subject"] = f"Tu diploma — {curso} | Metanoia SMX"

    cuerpo = f"""Estimado/a {nombre_alumno},

Es un placer hacerte llegar tu diploma de participación en el curso "{curso}".

Adjunto encontrás el diploma en formato imagen, listo para guardar e imprimir.

¡Felicitaciones por completar la formación!

Equipo Metanoia SMX
Salta, Argentina
"""
    msg.attach(MIMEText(cuerpo, "plain"))

    with open(diploma_path, "rb") as f:
        img_data = f.read()
    imagen = MIMEImage(img_data, name=os.path.basename(diploma_path))
    msg.attach(imagen)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_password)
        server.send_message(msg)

    print(f"Email enviado a {email_destino}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generar diploma Metanoia SMX")
    parser.add_argument("--nombre",       required=True)
    parser.add_argument("--dni",          required=True)
    parser.add_argument("--mp",           required=True)
    parser.add_argument("--curso",        required=True)
    parser.add_argument("--instructores", required=True)
    parser.add_argument("--fecha",        default=datetime.now().strftime("%-d de %B de %Y"))
    parser.add_argument("--email",        help="Email del alumno para enviar el diploma")
    parser.add_argument("--gmail-user",   help="Tu Gmail (tlarran@metanoiasmx.com)")
    parser.add_argument("--gmail-pass",   help="App password de Gmail")
    args = parser.parse_args()

    diploma_path = generar_diploma(
        args.nombre,
        args.dni,
        args.mp,
        args.curso,
        args.instructores,
        args.fecha,
    )

    if args.email and args.gmail_user and args.gmail_pass:
        enviar_por_email(
            diploma_path,
            args.email,
            args.nombre,
            args.curso,
            args.gmail_user,
            args.gmail_pass,
        )
