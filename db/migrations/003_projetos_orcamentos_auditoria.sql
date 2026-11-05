-- 003: projetos com orçamento, ligação da requisição ao projeto, chefia/responsável e auditoria
-- Uso: npm run migrar   (após db/schema.sql e migrações 001/002)

CREATE SEQUENCE IF NOT EXISTS projeto_codigo_seq START 1;

CREATE TABLE IF NOT EXISTS projetos (
    id             BIGSERIAL PRIMARY KEY,
    codigo         VARCHAR(30) NOT NULL UNIQUE
                 DEFAULT ('PROJ-' || to_char(now(), 'YYYY') || '-' ||
                          lpad(nextval('projeto_codigo_seq')::text, 5, '0')),
    nome           VARCHAR(150) NOT NULL,
    area_id        SMALLINT REFERENCES areas(id),
    orcamento_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (orcamento_total >= 0),
    moeda          CHAR(3) NOT NULL DEFAULT 'MZN',
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE requisicoes
    ADD COLUMN IF NOT EXISTS projeto_id BIGINT REFERENCES projetos(id);

ALTER TABLE utilizadores
    ADD COLUMN IF NOT EXISTS chefia_id BIGINT REFERENCES utilizadores(id);

CREATE TABLE IF NOT EXISTS auditoria (
    id             BIGSERIAL PRIMARY KEY,
    tabela         VARCHAR(60) NOT NULL,
    operacao       VARCHAR(10) NOT NULL CHECK (operacao IN ('insert','update','delete')),
    registro_id    BIGINT,
    utilizador_id  BIGINT REFERENCES utilizadores(id),
    detalhes       JSONB,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisicoes_projeto ON requisicoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_reg ON auditoria(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_utilizador ON auditoria(utilizador_id, criado_em);
