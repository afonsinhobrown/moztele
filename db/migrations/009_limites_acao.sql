-- 009: limite de frequência de acções (para além do login)
-- Uso: npm run migrar
--
-- Cada acção relevante deixa uma marca; a aplicação conta as marcas
-- recentes por utilizador e recusa quando passa do limite.

CREATE TABLE IF NOT EXISTS limites_acao (
    id        BIGSERIAL PRIMARY KEY,
    chave     TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_limites_chave ON limites_acao(chave, criado_em);
