-- Preferencias de notificaciones: la columna del toggle "Escalaciones del bot (email)" nunca se había creado.
-- Sin ella, "Guardar preferencias" fallaba para TODOS los usuarios, y agente-mensajes no podía leer a quién avisar.
ALTER TABLE notificaciones_config ADD COLUMN IF NOT EXISTS escal_bot_email boolean DEFAULT false;
