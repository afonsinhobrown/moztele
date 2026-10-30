-- 001: segurança, auditoria, ficheiros e acerto do saldo
-- Aplicar com: npm run migrar
-- (o runner abre e fecha a transacção)

ALTER TYPE estado_acerto ADD VALUE IF NOT EXISTS 'excesso_reembolsado';

ALTER TABLE utilizadores
    ADD COLUMN IF NOT EXISTS deve_mudar_senha BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sessao_versao INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS falhas_login INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;

-- Os utilizadores que já existem mantêm a senha; os novos passam a ser
-- obrigados a mudá-la no primeiro acesso.
ALTER TABLE utilizadores ALTER COLUMN deve_mudar_senha SET DEFAULT TRUE;

-- Administradores activos: obrigar a mudar a senha no próximo acesso
-- (a senha inicial antiga era mostrada na página de login).
UPDATE utilizadores u
   SET deve_mudar_senha = TRUE
 WHERE u.activo
   AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = u.perfil_id AND p.nome = 'admin');

CREATE TABLE IF NOT EXISTS ficheiros (
    id            BIGSERIAL PRIMARY KEY,
    chave         TEXT NOT NULL UNIQUE,
    hash_sha256   CHAR(64) NOT NULL,
    tipo_mime     VARCHAR(100) NOT NULL,
    tamanho       INT NOT NULL CHECK (tamanho > 0),
    nome_original VARCHAR(255),
    requisicao_id BIGINT REFERENCES requisicoes(id) ON DELETE CASCADE,
    finalidade    VARCHAR(20) NOT NULL
                  CHECK (finalidade IN ('orcamento','pagamento','compra','acerto','reembolso')),
    enviado_por   BIGINT REFERENCES utilizadores(id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ficheiros_comprovativo_hash
    ON ficheiros(hash_sha256)
    WHERE finalidade IN ('pagamento','compra','acerto','reembolso');

CREATE INDEX IF NOT EXISTS idx_ficheiros_req  ON ficheiros(requisicao_id);
CREATE INDEX IF NOT EXISTS idx_ficheiros_hash ON ficheiros(hash_sha256);

ALTER TABLE acertos ADD COLUMN IF NOT EXISTS comprovativo_url TEXT;
ALTER TABLE acertos ADD COLUMN IF NOT EXISTS comprovativo_hash CHAR(64);

CREATE TABLE IF NOT EXISTS reembolsos (
    id                BIGSERIAL PRIMARY KEY,
    requisicao_id     BIGINT NOT NULL REFERENCES requisicoes(id),
    valor             NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    comprovativo_url  TEXT NOT NULL,
    comprovativo_hash CHAR(64),
    registado_por     BIGINT NOT NULL REFERENCES utilizadores(id),
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_req ON reembolsos(requisicao_id);

CREATE TABLE IF NOT EXISTS tentativas_login (
    id        BIGSERIAL PRIMARY KEY,
    telefone  TEXT,
    ip        TEXT,
    sucesso   BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tentativas_login    ON tentativas_login(criado_em);
CREATE INDEX IF NOT EXISTS idx_tentativas_telefone ON tentativas_login(telefone, criado_em);

-- Histórico passa a registar quem fez a mudança (app.utilizador_id).
CREATE OR REPLACE FUNCTION registar_historico_estado() RETURNS trigger AS $$
DECLARE
    v_utilizador BIGINT;
BEGIN
    BEGIN
        v_utilizador := NULLIF(current_setting('app.utilizador_id', true), '')::BIGINT;
    EXCEPTION WHEN others THEN
        v_utilizador := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO historico_estados (requisicao_id, estado_anterior, estado_novo, utilizador_id)
        VALUES (NEW.id, NULL, NEW.estado, COALESCE(v_utilizador, NEW.mestre_id));
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historico_estados (requisicao_id, estado_anterior, estado_novo, utilizador_id)
        VALUES (NEW.id, OLD.estado, NEW.estado, v_utilizador);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
