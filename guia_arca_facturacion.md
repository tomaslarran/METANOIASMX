# Facturación electrónica ARCA — guía de puesta en marcha

Qué se hace una vez por sociedad (SUDES y POINTERS). Se empieza en **homologación** (ambiente de prueba, no genera facturas reales) y recién cuando todo anda se repite el trámite para **producción**.

> Lo técnico ya está hecho: función `arca-facturacion` (login WSAA + WSFEv1, validaciones, idempotencia, recuperación de respuestas cortadas) y las tablas `arca_config`, `arca_tokens`, `facturas_emitidas`. Lo que falta es lo que solo puede hacer quien tiene la clave fiscal.

## Parte 1 — Trámite en ARCA (lo hace Tomás / el representante de cada sociedad)

Necesitás la **clave fiscal nivel 3 o superior** del administrador de la sociedad.

### A. Certificado digital (se genera en tu PC)
Cada sociedad y cada ambiente lleva su propio par clave + certificado. Reemplazá `sudes` por `pointers` para la otra.

```bash
openssl genrsa -out sudes_homo.key 2048
openssl req -new -key sudes_homo.key -subj "/C=AR/O=SUDES S.A.S./CN=panelmetanoia/serialNumber=CUIT 30716991179" -out sudes_homo.csr
```

- **La `.key` es privada: no se manda por mail ni se sube a ningún lado salvo a los Secrets de Supabase.** Si se pierde hay que repetir el trámite.
- CUIT de SUDES `30716991179`; de POINTERS `30716965852` (el que usa el panel en `datos_fiscales_sociedad`; verificar contra la constancia de inscripción).

### B. Homologación (pruebas)
1. Entrar a ARCA con clave fiscal → servicio **WSASS – Autoservicio de acceso a WebServices – Homologación** (si no aparece, se adhiere desde *Administrador de Relaciones de Clave Fiscal*).
2. *Nuevo certificado* → alias `panelmetanoia` → pegar el contenido del `.csr` → descargar el `.crt`.
3. *Crear autorización a servicio* → el alias → servicio **wsfe (Facturación Electrónica)**.
4. Punto de venta de prueba: en homologación se puede usar el `1`; si ARCA lo rechaza, dar de alta uno desde WSASS / pedirle a ARCA el listado con `FEParamGetPtosVenta`.

### C. Producción
1. Servicio **Administración de Certificados Digitales** (con la clave fiscal del representante, actuando por la sociedad). Mismo flujo: alias, pegar CSR (generar uno **nuevo** `sudes_prod.key/.csr`), descargar el `.crt`.
2. **Administrador de Relaciones de Clave Fiscal → Nueva relación**: servicio *ARCA → WebServices → Facturación Electrónica*; representado = la sociedad; representante = el alias del certificado.
3. **Punto de venta**: servicio *Administración de puntos de venta y domicilios* → A/B/M → *Agregar*. Sistema: **«RECE para aplicativo y web services»**; domicilio: el de la sociedad (España 1440). Anotar el número que le asigna. *Debe ser un punto de venta nuevo, distinto del que usa hoy el plugin de Finnegans* (si no, se pisan los números).
4. Los certificados duran 2 años: anotar el vencimiento en `arca_config.cert_vencimiento`.

## Parte 2 — Cargar en el panel

1. **SQL** en Supabase: `sql_arca_facturacion.sql` (crea las 3 tablas y carga SUDES y POINTERS desactivadas, en homologación, punto de venta 1).
2. **Secrets** en Supabase → Edge Functions → Secrets (pegar el PEM completo, con las líneas `-----BEGIN…`):
   - `ARCA_CERT_SUDES` = contenido del `.crt` · `ARCA_KEY_SUDES` = contenido de la `.key`
   - `ARCA_CERT_POINTERS` / `ARCA_KEY_POINTERS`
   - (opcionales) `ARCA_WSAA_URL`, `ARCA_WSFE_URL` si ARCA cambia las direcciones (ya se está migrando de `afip.gov.ar` a `arca.gob.ar`).
3. **Deploy** de la función `arca-facturacion` (Edge Functions → *Deploy a new function* → pegar `supabase/functions/arca-facturacion/index.ts`). Dejar «Verify JWT» **activado** por ahora (la función además exige rol admin). Cuando se enganche la plataforma (llamada de servidor con `x-cron-secret`) habrá que desactivarlo; la función valida sola.
4. Actualizar `arca_config` de cada sociedad: `pto_vta` real y `activo = true`:
   ```sql
   UPDATE arca_config SET pto_vta = 1, activo = true WHERE sociedad = 'SUDES';
   ```
5. **Prueba de conexión** (consola del navegador con el panel abierto, como admin):
   ```js
   (await fetch(`${SB}/functions/v1/arca-facturacion`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},body:JSON.stringify({action:"estado",sociedad:"SUDES"})})).json()
   ```
   Tiene que devolver `login:"ok"` y los últimos comprobantes por tipo. Errores típicos: `El CEE no está autorizado` (falta la relación con el servicio wsfe), `certificado expirado/no válido` (alias o ambiente cruzado), `Faltan los secrets` (nombre mal escrito).
6. **Factura de prueba en homologación** (`action:"emitir"`): ver ejemplo abajo. El CAE de homologación no tiene validez fiscal.

```js
fetch(`${SB}/functions/v1/arca-facturacion`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},body:JSON.stringify({
  action:"emitir", sociedad:"SUDES", cbte_tipo:1, referencia:"PRUEBA-1",
  receptor:{doc_tipo:80, doc_nro:"30-70823254-4", nombre:"Cliente de prueba", cond_iva_id:1},
  items:[{descripcion:"Curso de prueba", neto:1000, alicuota:21}]
})}).then(r=>r.json())
```

## Parte 3 — Reglas que la función ya controla
- **Condición del receptor obligatoria** (RG 5616; ARCA rechaza sin ella desde el 1/12/2026): 1 Resp. Inscripto · 4 Exento · 5 Consumidor final · 6 Monotributo · 7 No categorizado · 13 Monotributista social · 15 IVA no alcanzado.
- **Factura A** solo a receptores 1, 6, 13, 16 y con CUIT válido (dígito verificador); **B** al resto. **Clase C no**: SUDES y POINTERS son Responsables Inscriptos.
- Alícuotas 0 / 2,5 / 5 / 10,5 / 21 / 27 %; ítems exentos con `alicuota:-1`.
- **Notas de crédito** (tipos 3, 8, 13) exigen el comprobante que anulan (`comprobante_asociado`).
- **Idempotencia** por `referencia` (ej. el id del pago de la plataforma): nunca se emiten dos facturas por el mismo pago. Si se corta la respuesta cuando ARCA ya autorizó, el reintento **recupera el CAE** consultando a ARCA.
- En **producción** exige `confirmar_produccion:true` (salvo la llamada de servidor con `x-cron-secret`, que usará la plataforma).
- Todo comprobante queda en `facturas_emitidas` con CAE, vencimiento, observaciones de ARCA y URL del QR.

## Parte 4 — Decisiones a tomar antes de producción
1. **Con Estela:** qué comprobantes se emiten (A y B; notas de crédito) y si hace falta **Factura de Crédito Electrónica MiPyME** (tipos 201/206/211, obligatoria para ventas a grandes empresas por montos mayores al umbral que fija ARCA; el certificado MiPyME de SUDES vence el 31/10).
2. **Con Agustín:** hoy factura el plugin de Finnegans al aprobarse el pago. Para pasar a facturar desde el panel: la plataforma avisa el pago (`pago.aprobado`, ya llega por el webhook) → el panel emite con `referencia = pago_id` → devuelve el PDF/CAE a la plataforma. **Nunca los dos a la vez** (doble facturación): definir la fecha de corte y apagar el plugin.
3. **Cuál sociedad factura qué:** cursos → SUDES; servicios/logística → POINTERS (confirmar).

## Lo que falta construir (después de probar en homologación)
- Pantalla **Facturas emitidas** en el panel + botón «Emitir factura» + PDF con QR (jsPDF).
- Enganche con `sync-elearning`: emitir al llegar `pago.aprobado` y devolver el resultado a la plataforma.
- Asiento `devengado_venta` / `cobro_venta` por CUIT (Fase 3 contable) y control «ingresos» en el cierre de mes.
- Libro IVA Ventas desde `facturas_emitidas`.
