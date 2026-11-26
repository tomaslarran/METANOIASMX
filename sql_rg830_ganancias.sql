-- Retenciones de Ganancias (RG 830): tabla oficial del simulador de ARCA https://servicioscf.afip.gob.ar/calc-rg830/ (consultada el 2/10/2026).
-- pct_inscripto = 0 significa "sin escala": se aplica la escala de rg830_escala sobre (pagos del mes - monto no sujeto).
CREATE TABLE IF NOT EXISTS rg830_conceptos (
  cod_regimen int PRIMARY KEY,
  concepto text NOT NULL,
  anexo text,
  monto_no_sujeto numeric NOT NULL DEFAULT 0,
  monto_minimo numeric NOT NULL DEFAULT 240,
  pct_inscripto numeric NOT NULL,
  pct_no_insc_humana numeric NOT NULL,
  pct_no_insc_juridica numeric NOT NULL,
  actualizado_en timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rg830_escala (
  desde numeric PRIMARY KEY,
  hasta numeric,
  porcentaje numeric NOT NULL
);
ALTER TABLE rg830_conceptos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg830_escala ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON rg830_conceptos;
DROP POLICY IF EXISTS "Solo autenticados" ON rg830_escala;
CREATE POLICY "Solo autenticados" ON rg830_conceptos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Solo autenticados" ON rg830_escala FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO rg830_conceptos (cod_regimen, concepto, anexo, monto_no_sujeto, monto_minimo, pct_inscripto, pct_no_insc_humana, pct_no_insc_juridica) VALUES
  (19, 'Intereses por operaciones realizadas en entidades financieras. Ley 21526 y sus modificaciones o agentes de bolsa o mercado abierto.', 'Anexo II, inc. a) pto. 1)', 0, 240, 3, 10, 10),
  (21, 'Intereses originados en operaciones no comprendidas en el punto 1.', 'Anexo II, inc. a) pto. 2)', 7870, 240, 6, 28, 25),
  (25, 'Comisiones u otras retribuciones derivadas de la actividad de comisionista, rematador, consignatario y demás auxiliares de comercio (art. 49 inc. c).', 'Anexo II, inc. j)', 16830, 240, 0, 28, 28),
  (30, 'Alquileres o arrendamientos de bienes muebles.', 'Anexo II, inc. b) pto. 1)', 11200, 240, 6, 28, 25),
  (31, 'Bienes inmuebles urbanos, incluidos los efectuados bajo la modalidad de leasing -incluye suburbanos-.', 'Anexo II, inc. b) pto. 2)', 11200, 1020, 6, 28, 25),
  (32, 'Bienes inmuebles rurales, incluidos los efectuados bajo la modalidad de leasing -incluye subrurales-.', 'Anexo II, inc. b) pto. 3)', 11200, 240, 6, 28, 25),
  (35, 'Regalías.', 'Anexo II, inc. c)', 7870, 240, 6, 28, 25),
  (43, 'Interés accionario, excedentes y retornos distribuidos entre asociados, cooperativas -excepto consumo-.', 'Anexo II, inc. d)', 7870, 240, 6, 28, 25),
  (51, 'Obligaciones de no hacer, o por abandono o no ejercicio de una actividad.', 'Anexo II, inc. e)', 7870, 240, 6, 28, 25),
  (53, 'Operaciones realizadas por intermedio de mercados de cereales a término (arbitrajes) y de mercados de futuros y opciones.', 'Anexo II, inc. m)', 0, 240, 0.5, 2, 2),
  (55, 'Distribución de películas. Transmisión de programación. Televisión vía satelital.', 'Anexo II, inc. n)', 0, 240, 0.5, 2, 2),
  (78, 'Enajenación de bienes muebles y bienes de cambio.', 'Anexo II, inc. f)', 224000, 240, 2, 10, 10),
  (86, 'Transferencia temporaria o definitiva de derechos de llave, marcas, patentes de invención, regalías, concesiones y similares.', 'Anexo II, inc. g)', 224000, 240, 2, 10, 10),
  (94, 'Locaciones de obra y/o servicios no ejecutados en relación de dependencia no mencionados expresamente en otros incisos.', 'Anexo II, inc. i)', 67170, 240, 2, 28, 25),
  (95, 'Operaciones de transporte de carga nacional e internacional.', 'Anexo II, inc. l)', 67170, 240, 0.25, 28, 25),
  (110, 'Explotación de derechos de autor (L. 11723).', 'Anexo II, inc. h)', 10000, 240, 0, 28, 28),
  (111, 'Cualquier otra cesión o locación de derechos, excepto las de mercados de cereales a término y de futuros y opciones.', 'Anexo II, inc. ñ)', 0, 240, 0.5, 2, 2),
  (112, 'Beneficios de planes de seguro de retiro privados (art. 45 inc. d y art. 79 inc. d LIG).', 'Anexo II, inc. o)', 16830, 240, 3, 3, 3),
  (113, 'Rescates -totales o parciales- por desistimiento de los planes de seguro de retiro.', 'Anexo II, inc. p)', 16830, 240, 3, 3, 3),
  (116, 'Albacea, mandatario, gestor de negocio. Honorarios de director de S.A., síndico, fiduciario, consejero y socios administradores de SRL/comandita.', 'Anexo II, inc. k)', 16830, 240, 0, 28, 28),
  (119, 'Profesiones liberales, oficios.', 'Anexo II, inc. k)', 160000, 240, 0, 28, 28),
  (124, 'Corredor, viajante de comercio y despachante de aduana.', 'Anexo II, inc. k)', 16830, 240, 0, 28, 28),
  (779, 'Subsidios estatales por enajenación de bienes muebles y bienes de cambio.', 'Anexo II, inc. q)', 76140, 240, 2, 10, 10),
  (780, 'Subsidios estatales por locaciones de obra y/o servicios no ejecutados en relación de dependencia.', 'Anexo II, inc. r)', 31460, 240, 2, 28, 25)
ON CONFLICT (cod_regimen) DO UPDATE SET concepto = EXCLUDED.concepto, anexo = EXCLUDED.anexo, monto_no_sujeto = EXCLUDED.monto_no_sujeto, monto_minimo = EXCLUDED.monto_minimo, pct_inscripto = EXCLUDED.pct_inscripto, pct_no_insc_humana = EXCLUDED.pct_no_insc_humana, pct_no_insc_juridica = EXCLUDED.pct_no_insc_juridica, actualizado_en = now();

INSERT INTO rg830_escala (desde, hasta, porcentaje) VALUES
  (0, 71000, 5),
  (71000, 142000, 9),
  (142000, 213000, 12),
  (213000, 284000, 15),
  (284000, 426000, 19),
  (426000, 568000, 23),
  (568000, 852000, 27),
  (852000, NULL, 31)
ON CONFLICT (desde) DO UPDATE SET hasta = EXCLUDED.hasta, porcentaje = EXCLUDED.porcentaje;
