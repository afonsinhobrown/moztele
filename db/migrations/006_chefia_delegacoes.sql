-- 006: chefia do mestre e delegação de aprovação
-- Uso: npm run migrar
--
-- Chefia: utilizadores.chefia_id (já criado na 003) passa a ser usado — a
-- chefia vê e acompanha as requisições de quem chefia.
-- Delegação: um aprovador ausente nomeia outro aprovador para decidir por si
-- durante um período. A decisão fica registada em nome de quem delegou.

CREATE TABLE IF NOT EXISTS delegacoes_aprovacao (
    id            BIGSERIAL PRIMARY KEY,
    de_id         BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    para_id       BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    inicio        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim           TIMESTAMPTZ NOT NULL,
    cancelada_em  TIMESTAMPTZ,
    criado_por    BIGINT REFERENCES utilizadores(id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT delegacao_pessoas_diferentes CHECK (de_id <> para_id),
    CONSTRAINT delegacao_periodo_valido CHECK (fim > inicio)
);

CREATE INDEX IF NOT EXISTS idx_delegacoes_para ON delegacoes_aprovacao(para_id, fim DESC);
CREATE INDEX IF NOT EXISTS idx_delegacoes_de ON delegacoes_aprovacao(de_id, fim DESC);

-- Quem decidiu de facto, quando foi por delegação (aprovador_id = quem delegou).
ALTER TABLE aprovacoes ADD COLUMN IF NOT EXISTS delegado_id BIGINT REFERENCES utilizadores(id);

DROP TRIGGER IF EXISTS trg_auditoria ON delegacoes_aprovacao;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON delegacoes_aprovacao
FOR EACH ROW EXECUTE FUNCTION registar_auditoria();

CREATE INDEX IF NOT EXISTS idx_utilizadores_chefia ON utilizadores(chefia_id);
