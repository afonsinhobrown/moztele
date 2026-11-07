import { prazo } from "./prazos.js";

// Regras puras: dado o que está na base, o que precisa de cada perfil agora.
// Sem acesso a dados, para poderem ser testadas sem servidor.

const PRIORIDADE = {
  correccao_pedida: 0,
  dinheiro_enviado: 1,
  rascunho: 2,
  compra_comprovada: 3,
  fechado: 4,
};

const ordenar = (acoes) =>
  acoes.sort(
    (a, b) => a.prioridade - b.prioridade || (a.dias === b.dias ? 0 : b.dias - a.dias)
  );

export function acoesDoMestre(linhas = []) {
  const acoes = [];
  for (const r of linhas) {
    const dias = prazo(r.estado, r.actualizado_em)?.dias ?? 0;
    const base = {
      id: r.id,
      codigo: r.codigo,
      site: r.site,
      estado: r.estado,
      valor: r.valor_estimado,
      dias,
      actualizadoEm: r.actualizado_em,
      href: `/requisicoes/${r.id}`,
    };

    if (r.estado === "correccao_pedida") {
      acoes.push({
        ...base,
        prioridade: PRIORIDADE.correccao_pedida,
        titulo: "Corrigir e voltar a submeter",
        detalhe: "O aprovador pediu uma correcção. Ajuste os itens ou os documentos e re-submeta.",
        acao: "Corrigir",
        cor: "atencao",
      });
    } else if (r.estado === "dinheiro_enviado") {
      acoes.push({
        ...base,
        prioridade: PRIORIDADE.dinheiro_enviado,
        titulo: "Registar a compra",
        detalhe: "O dinheiro já foi enviado. Compre o material e anexe o comprovativo.",
        acao: "Registar compra",
        cor: "info",
      });
    } else if (r.estado === "rascunho") {
      acoes.push({
        ...base,
        prioridade: PRIORIDADE.rascunho,
        titulo: "Submeter o rascunho",
        detalhe: "A requisição está em rascunho. Anexe o orçamento e submeta para aprovação.",
        acao: "Abrir rascunho",
        cor: "neutro",
      });
    } else if ((r.estado === "compra_comprovada" || r.estado === "fechado") && !r.no_stock) {
      acoes.push({
        ...base,
        prioridade: PRIORIDADE.compra_comprovada,
        titulo: "Dar entrada no stock",
        detalhe: "O material comprado ainda não entrou no inventário do site.",
        acao: "Dar entrada",
        cor: "sucesso",
      });
    }
  }
  return ordenar(acoes);
}

export function acoesDoFinanceiro(linhas = []) {
  const acoes = [];
  for (const r of linhas) {
    const dias = prazo(r.estado, r.actualizado_em)?.dias ?? 0;
    const base = {
      id: r.id,
      codigo: r.codigo,
      mestre: r.mestre,
      site: r.site,
      estado: r.estado,
      valor: r.valor_estimado,
      dias,
      actualizadoEm: r.actualizado_em,
      href: `/requisicoes/${r.id}`,
    };

    if (r.acerto_estado === "excesso_a_reembolsar") {
      acoes.push({
        ...base,
        prioridade: -1,
        titulo: "Reembolsar o excesso",
        detalhe: "O mestre gastou mais do que recebeu. Registe a devolução com comprovativo.",
        acao: "Reembolsar",
        cor: "atencao",
      });
    } else if (r.estado === "aprovado") {
      const credito = Number(r.credito || 0);
      const coberto = credito > 0 && credito >= Number(r.valor_estimado || 0);
      acoes.push({
        ...base,
        prioridade: 0,
        titulo: coberto ? "Confirmar cobertura pelo saldo" : "Enviar o dinheiro",
        detalhe: coberto
          ? "O saldo abatido cobre o valor estimado; basta confirmar."
          : "Requisição aprovada. Envie o valor e anexe o comprovativo.",
        acao: coberto ? "Confirmar" : "Enviar dinheiro",
        cor: coberto ? "sucesso" : "info",
      });
    } else if (r.estado === "compra_comprovada") {
      acoes.push({
        ...base,
        prioridade: 1,
        titulo: "Fazer o acerto e fechar",
        detalhe: "A compra está comprovada. Calcule o saldo e feche com prova.",
        acao: "Fazer acerto",
        cor: "sucesso",
      });
    }
  }
  return ordenar(acoes);
}

export function acoesDoAprovador(linhas = []) {
  return ordenar(
    linhas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      mestre: r.mestre,
      site: r.site,
      estado: r.estado,
      valor: r.valor_estimado,
      dias: prazo("submetido", r.actualizado_em)?.dias ?? 0,
      actualizadoEm: r.actualizado_em,
      prioridade: 0,
      href: `/requisicoes/${r.id}`,
      titulo: "Aprovar ou pedir correcção",
      detalhe: "Requisição submetida à espera da sua decisão.",
      acao: "Decidir",
      cor: "info",
    }))
  );
}
