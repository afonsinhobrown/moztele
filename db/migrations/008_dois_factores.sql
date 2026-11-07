-- 008: segundo factor (TOTP)
-- Uso: npm run migrar
--
-- O segredo TOTP fica na base de dados mas nunca é devolvido ao browser
-- depois de activado. Quem perder o dispositivo pede ao administrador para
-- repor o segundo factor.

ALTER TABLE utilizadores
    ADD COLUMN IF NOT EXISTS totp_secret   TEXT,
    ADD COLUMN IF NOT EXISTS totp_ativo    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS totp_criado_em TIMESTAMPTZ;

-- A auditoria deixa de guardar o segredo de dois factores.
CREATE OR REPLACE FUNCTION registar_auditoria() RETURNS trigger AS $$
DECLARE
    v_user   BIGINT;
    v_antes  JSONB;
    v_depois JSONB;
    v_det    JSONB;
    v_id     BIGINT;
BEGIN
    BEGIN
        v_user := NULLIF(current_setting('app.utilizador_id', true), '')::BIGINT;
    EXCEPTION WHEN others THEN
        v_user := NULL;
    END;

    v_antes  := CASE WHEN TG_OP IN ('UPDATE','DELETE')
                     THEN to_jsonb(OLD) - 'senha_hash' - 'totp_secret' ELSE NULL END;
    v_depois := CASE WHEN TG_OP IN ('INSERT','UPDATE')
                     THEN to_jsonb(NEW) - 'senha_hash' - 'totp_secret' ELSE NULL END;

    IF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(d.key, d.value) INTO v_det
          FROM jsonb_each(v_depois) d
         WHERE v_antes -> d.key IS DISTINCT FROM d.value;
        IF v_det IS NULL THEN
            RETURN NULL;
        END IF;
    ELSE
        v_det := COALESCE(v_depois, v_antes);
    END IF;

    v_id := COALESCE((v_depois ->> 'id')::BIGINT, (v_antes ->> 'id')::BIGINT);

    INSERT INTO auditoria (tabela, operacao, registro_id, utilizador_id, detalhes)
    VALUES (TG_TABLE_NAME, lower(TG_OP), v_id, v_user, v_det);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
