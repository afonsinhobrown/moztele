-- 007: preferências de aviso por email e SMS
-- Uso: npm run migrar
--
-- A app avisa sempre; o email e o SMS são canais extra, ligados por omissão
-- quando o utilizador tem contacto e o serviço está configurado.

ALTER TABLE utilizadores
    ADD COLUMN IF NOT EXISTS notificar_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notificar_sms   BOOLEAN NOT NULL DEFAULT TRUE;
