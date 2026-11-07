-- 005: códigos de recuperação de senha
-- Uso: npm run migrar
--
-- O utilizador que se esquece da senha pede um código ao administrador.
-- O código é de uso único, vale 24 h e só é guardado em hash.

CREATE TABLE IF NOT EXISTS codigos_recuperacao (
    id            BIGSERIAL PRIMARY KEY,
    utilizador_id BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    codigo_hash   CHAR(64) NOT NULL,
    expira_em     TIMESTAMPTZ NOT NULL,
    criado_por    BIGINT REFERENCES utilizadores(id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usado_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_codigos_utilizador
    ON codigos_recuperacao(utilizador_id, expira_em DESC);
CREATE INDEX IF NOT EXISTS idx_codigos_hash ON codigos_recuperacao(codigo_hash);
