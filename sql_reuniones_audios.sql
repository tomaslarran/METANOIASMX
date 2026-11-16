-- Reuniones: varios audios por reunión, cada uno con su propio job de transcripción
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS audios jsonb DEFAULT '[]'::jsonb;
