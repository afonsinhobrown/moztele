-- =====================================================================
-- MOZTELE - Sistema de Requisições (PostgreSQL)
-- Mestres de obras e telecomunicações: orçamento -> aprovação ->
-- envio de dinheiro -> compra -> acerto, com comprovativos.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- TIPOS (ENUMS)
-- ---------------------------------------------------------------------
CREATE TYPE urgencia_tipo        AS ENUM ('baixa', 'normal', 'alta', 'urgente');
CREATE TYPE estado_requisicao    AS ENUM (
    'rascunho', 'submetido', 'correccao_pedida', 'aprovado', 'reprovado',
    'dinheiro_enviado', 'compra_comprovada', 'fechado', 'cancelado'
);
CREATE TYPE decisao_tipo         AS ENUM ('aprovado', 'reprovado', 'correccao');
CREATE TYPE anexo_tipo           AS ENUM ('cotacao', 'proforma', 'foto', 'outro');
CREATE TYPE metodo_pagamento     AS ENUM ('mpesa', 'emola', 'mkesh', 'banco', 'numerario');
CREATE TYPE comprovativo_compra_tipo AS ENUM ('factura', 'recibo', 'foto_material', 'outro');
CREATE TYPE estado_acerto        AS ENUM ('pendente', 'saldo_devolvido', 'saldo_abatido', 'sem_saldo', 'excesso_a_reembolsar');
CREATE TYPE canal_notificacao    AS ENUM ('whatsapp', 'sms', 'app', 'email');

-- ---------------------------------------------------------------------
-- UTILIZADORES E ESTRUTURA
-- ---------------------------------------------------------------------
CREATE TABLE perfis (
    id     SMALLSERIAL PRIMARY KEY,
    nome   VARCHAR(50) NOT NULL UNIQUE      -- mestre, aprovador, financeiro, admin
);

CREATE TABLE areas (
    id     SMALLSERIAL PRIMARY KEY,
    nome   VARCHAR(80) NOT NULL UNIQUE      -- Obras, Telecomunicações
);

CREATE TABLE utilizadores (
    id          BIGSERIAL PRIMARY KEY,
    nome        VARCHAR(150) NOT NULL,
    telefone    VARCHAR(25)  NOT NULL UNIQUE,
    email       VARCHAR(150) UNIQUE,
    perfil_id   SMALLINT NOT NULL REFERENCES perfis(id),
    area_id     SMALLINT REFERENCES areas(id),   -- area principal (mestres)
    senha_hash  TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
    id         BIGSERIAL PRIMARY KEY,
    nome       VARCHAR(150) NOT NULL,
    provincia  VARCHAR(80),
    cidade     VARCHAR(80),
    area_id    SMALLINT NOT NULL REFERENCES areas(id),
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mestre_sites (
    mestre_id  BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    site_id    BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    PRIMARY KEY (mestre_id, site_id)
);

-- ---------------------------------------------------------------------
-- CATÁLOGO
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
    id     SERIAL PRIMARY KEY,
    nome   VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE fornecedores (
    id        BIGSERIAL PRIMARY KEY,
    nome      VARCHAR(150) NOT NULL,
    contacto  VARCHAR(80),
    nuit      VARCHAR(20),
    activo    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- REQUISIÇÕES
-- ---------------------------------------------------------------------
CREATE SEQUENCE requisicao_codigo_seq START 1;

CREATE TABLE requisicoes (
    id               BIGSERIAL PRIMARY KEY,
    codigo           VARCHAR(30) NOT NULL UNIQUE
                     DEFAULT ('REQ-' || to_char(now(), 'YYYY') || '-' ||
                              lpad(nextval('requisicao_codigo_seq')::text, 5, '0')),
    mestre_id        BIGINT NOT NULL REFERENCES utilizadores(id),
    site_id          BIGINT NOT NULL REFERENCES sites(id),
    justificacao     TEXT NOT NULL,
    urgencia         urgencia_tipo NOT NULL DEFAULT 'normal',
    valor_estimado   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_estimado >= 0),
    moeda            CHAR(3) NOT NULL DEFAULT 'MZN',
    estado           estado_requisicao NOT NULL DEFAULT 'rascunho',
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE requisicao_itens (
    id              BIGSERIAL PRIMARY KEY,
    requisicao_id   BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    categoria_id    INT REFERENCES categorias(id),
    descricao       VARCHAR(255) NOT NULL,
    quantidade      NUMERIC(12,2) NOT NULL CHECK (quantidade > 0),
    unidade         VARCHAR(20) NOT NULL DEFAULT 'un',
    preco_unitario  NUMERIC(14,2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal        NUMERIC(14,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    fornecedor_id   BIGINT REFERENCES fornecedores(id)
);

CREATE TABLE requisicao_anexos (
    id             BIGSERIAL PRIMARY KEY,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    tipo           anexo_tipo NOT NULL DEFAULT 'cotacao',
    ficheiro_url   TEXT NOT NULL,
    nome_original  VARCHAR(255),
    enviado_por    BIGINT NOT NULL REFERENCES utilizadores(id),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- APROVAÇÃO
-- ---------------------------------------------------------------------
CREATE TABLE aprovacoes (
    id             BIGSERIAL PRIMARY KEY,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    aprovador_id   BIGINT NOT NULL REFERENCES utilizadores(id),
    decisao        decisao_tipo NOT NULL,
    motivo         TEXT,
    decidido_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- reprovar ou pedir correcção exige motivo
    CONSTRAINT motivo_obrigatorio
        CHECK (decisao = 'aprovado' OR (motivo IS NOT NULL AND length(trim(motivo)) > 0))
);

CREATE TABLE regras_aprovacao (
    id                       SERIAL PRIMARY KEY,
    valor_min                NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_max                NUMERIC(14,2),            -- NULL = sem limite
    aprovadores_necessarios  SMALLINT NOT NULL DEFAULT 1 CHECK (aprovadores_necessarios >= 1),
    CHECK (valor_max IS NULL OR valor_max > valor_min)
);

-- ---------------------------------------------------------------------
-- DINHEIRO E COMPROVATIVOS
-- ---------------------------------------------------------------------
CREATE TABLE pagamentos (
    id             BIGSERIAL PRIMARY KEY,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id),
    financeiro_id  BIGINT NOT NULL REFERENCES utilizadores(id),
    valor          NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    metodo         metodo_pagamento NOT NULL,
    referencia     VARCHAR(100),                   -- ID da transacção
    enviado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comprovativos_pagamento (
    id            BIGSERIAL PRIMARY KEY,
    pagamento_id  BIGINT NOT NULL REFERENCES pagamentos(id) ON DELETE CASCADE,
    ficheiro_url  TEXT NOT NULL,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compras (
    id             BIGSERIAL PRIMARY KEY,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id),
    valor_gasto    NUMERIC(14,2) NOT NULL CHECK (valor_gasto >= 0),
    fornecedor_id  BIGINT REFERENCES fornecedores(id),
    data_compra    DATE NOT NULL DEFAULT CURRENT_DATE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comprovativos_compra (
    id            BIGSERIAL PRIMARY KEY,
    compra_id     BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    tipo          comprovativo_compra_tipo NOT NULL DEFAULT 'factura',
    ficheiro_url  TEXT NOT NULL,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acertos (
    id              BIGSERIAL PRIMARY KEY,
    requisicao_id   BIGINT NOT NULL UNIQUE REFERENCES requisicoes(id),
    valor_enviado   NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_gasto     NUMERIC(14,2) NOT NULL DEFAULT 0,
    saldo           NUMERIC(14,2) GENERATED ALWAYS AS (valor_enviado - valor_gasto) STORED,
    estado          estado_acerto NOT NULL DEFAULT 'pendente',
    fechado_por     BIGINT REFERENCES utilizadores(id),
    fechado_em      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- CONTROLO E COMUNICAÇÃO
-- ---------------------------------------------------------------------
CREATE TABLE historico_estados (
    id               BIGSERIAL PRIMARY KEY,
    requisicao_id    BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    estado_anterior  estado_requisicao,
    estado_novo      estado_requisicao NOT NULL,
    utilizador_id    BIGINT REFERENCES utilizadores(id),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notificacoes (
    id             BIGSERIAL PRIMARY KEY,
    utilizador_id  BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    requisicao_id  BIGINT REFERENCES requisicoes(id) ON DELETE CASCADE,
    canal          canal_notificacao NOT NULL DEFAULT 'app',
    mensagem       TEXT NOT NULL,
    lida           BOOLEAN NOT NULL DEFAULT FALSE,
    enviada_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comentarios (
    id             BIGSERIAL PRIMARY KEY,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    utilizador_id  BIGINT NOT NULL REFERENCES utilizadores(id),
    texto          TEXT NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------------------
CREATE INDEX idx_requisicoes_mestre   ON requisicoes(mestre_id);
CREATE INDEX idx_requisicoes_site     ON requisicoes(site_id);
CREATE INDEX idx_requisicoes_estado   ON requisicoes(estado);
CREATE INDEX idx_itens_requisicao     ON requisicao_itens(requisicao_id);
CREATE INDEX idx_anexos_requisicao    ON requisicao_anexos(requisicao_id);
CREATE INDEX idx_aprovacoes_req       ON aprovacoes(requisicao_id);
CREATE INDEX idx_pagamentos_req       ON pagamentos(requisicao_id);
CREATE INDEX idx_compras_req          ON compras(requisicao_id);
CREATE INDEX idx_historico_req        ON historico_estados(requisicao_id);
CREATE INDEX idx_notif_utilizador     ON notificacoes(utilizador_id, lida);
CREATE INDEX idx_comentarios_req      ON comentarios(requisicao_id);

-- ---------------------------------------------------------------------
-- REGRA: não fechar sem os dois comprovativos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validar_fecho_requisicao() RETURNS trigger AS $$
BEGIN
    IF NEW.estado = 'fechado' AND OLD.estado IS DISTINCT FROM 'fechado' THEN
        IF NOT EXISTS (
            SELECT 1 FROM pagamentos p
            JOIN comprovativos_pagamento cp ON cp.pagamento_id = p.id
            WHERE p.requisicao_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Falta o comprovativo de envio de dinheiro.';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM compras c
            JOIN comprovativos_compra cc ON cc.compra_id = c.id
            WHERE c.requisicao_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Falta o comprovativo de compra.';
        END IF;
    END IF;
    NEW.actualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_fecho
BEFORE UPDATE ON requisicoes
FOR EACH ROW EXECUTE FUNCTION validar_fecho_requisicao();

-- ---------------------------------------------------------------------
-- REGISTO AUTOMÁTICO DO HISTÓRICO DE ESTADOS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registar_historico_estado() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historico_estados (requisicao_id, estado_anterior, estado_novo, utilizador_id)
        VALUES (NEW.id, NULL, NEW.estado, NEW.mestre_id);
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historico_estados (requisicao_id, estado_anterior, estado_novo)
        VALUES (NEW.id, OLD.estado, NEW.estado);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historico_estado
AFTER INSERT OR UPDATE OF estado ON requisicoes
FOR EACH ROW EXECUTE FUNCTION registar_historico_estado();

-- ---------------------------------------------------------------------
-- DADOS INICIAIS
-- ---------------------------------------------------------------------
INSERT INTO perfis (nome) VALUES ('mestre'), ('aprovador'), ('financeiro'), ('admin');
INSERT INTO areas (nome)  VALUES ('Obras'), ('Telecomunicações');
INSERT INTO categorias (nome) VALUES
    ('Ferramentas'), ('Cabos e fibra óptica'), ('EPI e segurança'),
    ('Material eléctrico'), ('Material de construção'),
    ('Energia (baterias, geradores)'), ('Combustível'), ('Transporte'), ('Outros');
INSERT INTO regras_aprovacao (valor_min, valor_max, aprovadores_necessarios) VALUES
    (0, 50000, 1),
    (50000, NULL, 2);

COMMIT;
