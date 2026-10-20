# Diseños de registro ARCA para los TXT de María (Auren) — referencia (20 Oct 2026)

Lo que pidieron: **TXT para importar en ARCA el Libro IVA Compras y el Libro IVA Ventas** (Libro IVA Digital, RG 4597) y **TXT de SICORE – retenciones del Impuesto a las Ganancias** (se presenta por el aplicativo SIAP/SICORE).

## Libro IVA Digital (fuente oficial)
- Diseños: https://www.afip.gob.ar/iva/documentos/libro-iva-digital-diseno-registros.pdf (Anexo I)
- Especificaciones (rev. 30/07/2025, con las tablas de códigos): https://www.afip.gob.ar/iva/documentos/Libro-IVA-Digital-Especificaciones.pdf — **leerlas antes de construir** (tablas de comprobantes, documentos, alícuotas, moneda y código de operación; modificatoria RG 5707/2025).
- Formato general: ancho fijo, numéricos con ceros a la izquierda y **sin punto decimal** (13 enteros + 2 decimales = 15), fechas AAAAMMDD, alfanuméricos alineados a la izquierda con espacios. **Dos archivos por libro** (cabecera + alícuotas): el IVA de cada alícuota va en el archivo de alícuotas.

| Archivo | Largo | Campos (posición desde–hasta) |
|---|---|---|
| VENTAS_CBTE | 266 | fecha 1-8 · tipo cbte 9-11 · pto vta 12-16 · nro 17-36 · nro hasta 37-56 · cód doc comprador 57-58 · nro doc 59-78 · denominación 79-108 · total 109-123 · no integra neto 124-138 · percep. no categorizados 139-153 · exentas 154-168 · percep. nacionales 169-183 · percep. IIBB 184-198 · percep. municipales 199-213 · internos 214-228 · moneda 229-231 · tipo cambio 232-241 (4+6) · cant. alícuotas 242 · cód operación 243 · otros tributos 244-258 · fecha vto/pago 259-266 |
| VENTAS_ALICUOTAS | 62 | tipo cbte 1-3 · pto vta 4-8 · nro 9-28 · neto gravado 29-43 · alícuota 44-47 · impuesto liquidado 48-62 |
| COMPRAS_CBTE | 325 | fecha 1-8 · tipo 9-11 · pto vta 12-16 · nro 17-36 · despacho importación 37-52 · cód doc vendedor 53-54 · nro doc 55-74 · denominación 75-104 · total 105-119 · no integra neto 120-134 · exentas 135-149 · percep./pagos a cuenta IVA 150-164 · otros nacionales 165-179 · IIBB 180-194 · municipales 195-209 · internos 210-224 · moneda 225-227 · tipo cambio 228-237 · cant. alícuotas 238 · cód operación 239 · crédito fiscal computable 240-254 · otros tributos 255-269 · CUIT emisor/corredor 270-280 · denominación emisor 281-310 · IVA comisión 311-325 |
| COMPRAS_ALICUOTAS | 84 | tipo 1-3 · pto vta 4-8 · nro 9-28 · cód doc vendedor 29-30 · nro doc 31-50 · neto gravado 51-65 · alícuota 66-69 · impuesto liquidado 70-84 |
| CBTES_VENTAS_ANULADOS | 44 | fecha 1-8 · tipo 9-11 · pto vta 12-16 · nro 17-36 · fecha anulación 37-44 |

(Existen también las variantes TurIVA y de importaciones de bienes/servicios; no aplican a Metanoia salvo que aparezcan importaciones.)

## SICORE – retenciones de Ganancias (fuente: instructivo SI.CO.RE. v54, §4.3.1.1)
- El aplicativo importa un TXT **de ancho fijo cuyo formato se define en el propio aplicativo** ("formato de importación"); no hay un layout único: hay que **pedirle a María el formato de importación que ya tiene configurado** (o el TXT que hoy sale de Finnegans) y calcarlo.
- Reglas: todos los registros del mismo largo; CUIT sin guiones; nro. de comprobante sin separadores (`000112334599`); fecha dd/mm/aaaa; numéricos a la derecha con ceros; alfanuméricos a la izquierda con espacios; nota de crédito exige el N° de certificado original; la importación requiere una **declaración jurada ya creada**.
- Campos importables: código de comprobante (01 factura, 02 recibo, 03 NC, 04 ND, 05 otro, **06 orden de pago**…), fecha del comprobante, nro. de comprobante, importe del comprobante, **código de impuesto (217 Ganancias; 210 = Ganancias régimen especial RG 830, usa los regímenes del 217)**, código de régimen, código de operación (1 retención), base de cálculo, fecha de emisión de la retención, código de condición (1 inscripto, 2 no inscripto…), importe de la retención, % de exclusión, fecha del boletín, tipo de documento del retenido (80 CUIT, 86 CUIL…) y su número.
- Ejemplo del manual (registro de una retención con factura): `0110/12/2002012300000456   30,002170561   50,0011/12/200200   50,00   0,00 8023111111111   00000000000000`.
- Manual: https://archivo.consejo.org.ar/aplicativos/sicore/files/dit.sicore.AP_INS_sicore-54.pdf (versión 2015; la vigente es SICORE v9 release 22 — confirmar cambios).
- Datos en el panel: las retenciones practicadas salen de `ordenes_pago` (régimen RG 830, base, % efectivo, importe, CUIT del proveedor) — ya están en el Paquete Auren (hoja Retenciones).

## Tablas de códigos — CONFIRMADAS contra ARCA (20 Oct 2026)
Fuente: https://www.arca.gob.ar/libro-iva-digital/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf (feb. 2025) y las Especificaciones rev. 30/07/2025.
- **Alícuotas (4 dígitos):** 0003 = 0% · 0004 = 10,5% · 0005 = 21% · 0006 = 27% · 0008 = 5% · 0009 = 2,5%.
- **Código de operación:** blanco o `0` (no corresponde; se usa cuando hay alícuota > 0) · `E` exentas · `N` no gravado · `A` no alcanzado · `C` canje · `X` importación/exportación del exterior · `Z` zona franca · `T` reintegro Dto. 1043/2016 · `D` devolución IVA turistas. Si la alícuota es 0 hay que informar E/N/A/etc.
- **Tipo de comprobante (3 dígitos):** 001 Fact. A · 002 ND A · 003 NC A · 004 Recibo A · 006 Fact. B · 007 ND B · 008 NC B · 009 Recibo B · 011 Fact. C · 012 ND C · 013 NC C · 015 Recibo C · 017/018 liq. servicios públicos A/B · 019 Fact. exportación · 033 liq. primaria de granos (el resto, incl. 051 en adelante, en la tabla completa).
- **Documento:** 80 CUIT · 86 CUIL · 87 CDI · 96 DNI · 94 pasaporte · 99 sin identificar / venta global diaria (importe < tope, consumidor final).
- **Moneda:** `PES` pesos argentinos (la importación pregunta si los importes están en pesos o en moneda original).
- **Reglas de generación:** archivos en **ANSI** (ISO 8859-1 / Windows-1252) · cabecera y alícuotas en **el mismo orden** · comprobantes **B y C: cantidad de alícuotas = 0** (y sin registro de alícuotas) · un registro de alícuotas por cada alícuota del comprobante · CUIT/CUIL/CDI existentes en ARCA · si el campo "tipo de cambio" no aplica, `0001000000` (4+6) para pesos.
