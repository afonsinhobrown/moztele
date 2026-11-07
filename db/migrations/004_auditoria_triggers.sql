-- 004: auditoria automática de todas as tabelas de negócio
-- Uso: npm run migrar
--
-- Em vez de chamar auditar() em cada acção, a base de dados regista a
-- alteração. O autor vem de app.utilizador_id, definido pela aplicação no
-- início de cada transacção (igual ao histórico de estados).

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

    -- Nunca guardar segredos no registo de auditoria.
    v_antes  := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) - 'senha_hash' ELSE NULL END;
    v_depois := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) - 'senha_hash' ELSE NULL END;

    IF TG_OP = 'UPDATE' THEN
        -- Só o que mudou: o registo fica legível e pequeno.
        SELECT jsonb_object_agg(d.key, d.value) INTO v_det
          FROM jsonb_each(v_depois) d
         WHERE v_antes -> d.key IS DISTINCT FROM d.value;
        IF v_det IS NULL THEN
            RETURN NULL; -- nada mudou de facto
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

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'requisicoes', 'requisicao_itens', 'requisicao_anexos', 'ficheiros',
        'aprovacoes', 'regras_aprovacao',
        'pagamentos', 'comprovativos_pagamento', 'compras', 'comprovativos_compra',
        'acertos', 'reembolsos',
        'utilizadores', 'sites', 'areas', 'categorias', 'fornecedores', 'projetos',
        'inventario', 'movimentos_stock',
        'modelos_requisicao', 'itens_favoritos',
        'creditos_abatimento', 'creditos_aplicacoes',
        'comentarios', 'mestre_sites'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION registar_auditoria()',
            t
        );
    END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_auditoria_criado ON auditoria(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela, criado_em DESC);
