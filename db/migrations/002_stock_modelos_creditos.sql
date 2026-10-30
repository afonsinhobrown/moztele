-- 002: inventário, modelos/favoritos e ligação do saldo abatido
-- Aplicar com: npm run migrar

CREATE TABLE IF NOT EXISTS inventario (
    id                 BIGSERIAL PRIMARY KEY,
    site_id            BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    categoria_id       INT REFERENCES categorias(id),
    descricao          VARCHAR(255) NOT NULL,
    unidade            VARCHAR(20) NOT NULL DEFAULT 'un',
    quantidade         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
    quantidade_minima  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantidade_minima >= 0),
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um item por site, sem distinguir maiúsculas/minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_site_descricao
    ON inventario (site_id, lower(descricao));
CREATE INDEX IF NOT EXISTS idx_inventario_site ON inventario(site_id);

CREATE TABLE IF NOT EXISTS movimentos_stock (
    id              BIGSERIAL PRIMARY KEY,
    inventario_id   BIGINT NOT NULL REFERENCES inventario(id) ON DELETE CASCADE,
    tipo            VARCHAR(10) NOT NULL,
    quantidade      NUMERIC(12,2) NOT NULL,
    saldo_anterior  NUMERIC(12,2) NOT NULL CHECK (saldo_anterior >= 0),
    saldo_apos      NUMERIC(12,2) NOT NULL CHECK (saldo_apos >= 0),
    motivo          TEXT,
    requisicao_id   BIGINT REFERENCES requisicoes(id),
    utilizador_id   BIGINT REFERENCES utilizadores(id),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT movimento_tipo_valido CHECK (tipo IN ('entrada','saida','ajuste')),
    CONSTRAINT movimento_quantidade_valida CHECK (
        (tipo = 'ajuste' AND quantidade >= 0) OR (tipo IN ('entrada','saida') AND quantidade > 0)
    )
);

-- Cada requisição só pode dar entrada no stock uma vez por item.
CREATE UNIQUE INDEX IF NOT EXISTS ux_movimento_entrada_req
    ON movimentos_stock(requisicao_id, inventario_id)
    WHERE requisicao_id IS NOT NULL AND tipo = 'entrada';

CREATE INDEX IF NOT EXISTS idx_movimentos_inventario ON movimentos_stock(inventario_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_movimentos_req ON movimentos_stock(requisicao_id);

CREATE TABLE IF NOT EXISTS modelos_requisicao (
    id             BIGSERIAL PRIMARY KEY,
    mestre_id      BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    nome           VARCHAR(120) NOT NULL,
    justificacao   TEXT,
    itens          JSONB NOT NULL CHECK (jsonb_typeof(itens) = 'array'),
    partilhado     BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modelos_mestre ON modelos_requisicao(mestre_id);

CREATE TABLE IF NOT EXISTS itens_favoritos (
    id              BIGSERIAL PRIMARY KEY,
    mestre_id       BIGINT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
    descricao       VARCHAR(255) NOT NULL,
    unidade         VARCHAR(20) NOT NULL DEFAULT 'un',
    preco_unitario  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
    categoria_id    INT REFERENCES categorias(id),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_favoritos_mestre_descricao
    ON itens_favoritos (mestre_id, lower(descricao));

-- Saldo abatido: fica como crédito do mestre para aquele site e é aplicado
-- automaticamente às requisições seguintes.
CREATE TABLE IF NOT EXISTS creditos_abatimento (
    id                   BIGSERIAL PRIMARY KEY,
    requisicao_origem_id BIGINT NOT NULL UNIQUE REFERENCES requisicoes(id),
    mestre_id            BIGINT NOT NULL REFERENCES utilizadores(id),
    site_id              BIGINT NOT NULL REFERENCES sites(id),
    valor                NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    valor_usado          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_usado >= 0 AND valor_usado <= valor),
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creditos_mestre_site ON creditos_abatimento(mestre_id, site_id);

CREATE TABLE IF NOT EXISTS creditos_aplicacoes (
    id             BIGSERIAL PRIMARY KEY,
    credito_id     BIGINT NOT NULL REFERENCES creditos_abatimento(id) ON DELETE CASCADE,
    requisicao_id  BIGINT NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    valor          NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    aplicado_por   BIGINT REFERENCES utilizadores(id),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (credito_id, requisicao_id)
);

CREATE INDEX IF NOT EXISTS idx_creditos_aplicacoes_req ON creditos_aplicacoes(requisicao_id);

-- Fechar uma requisição passa a aceitar crédito (saldo abatido) como
-- financiamento, além do comprovativo de pagamento.
CREATE OR REPLACE FUNCTION validar_fecho_requisicao() RETURNS trigger AS $$
BEGIN
    IF NEW.estado = 'fechado' AND OLD.estado IS DISTINCT FROM 'fechado' THEN
        IF NOT EXISTS (
            SELECT 1 FROM pagamentos p
            JOIN comprovativos_pagamento cp ON cp.pagamento_id = p.id
            WHERE p.requisicao_id = NEW.id
        ) AND NOT EXISTS (
            SELECT 1 FROM creditos_aplicacoes ca
            WHERE ca.requisicao_id = NEW.id
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
