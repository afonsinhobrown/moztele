// Prazos (SLA) por estado, em dias. Servem para avisar o que está parado.
export const LIMITES = {
  submetido: { atencao: 2, atraso: 4, acao: "aprovação" },
  correccao_pedida: { atencao: 2, atraso: 5, acao: "correcção do mestre" },
  aprovado: { atencao: 2, atraso: 5, acao: "envio do dinheiro" },
  dinheiro_enviado: { atencao: 5, atraso: 10, acao: "compra do mestre" },
  compra_comprovada: { atencao: 2, atraso: 5, acao: "acerto do financeiro" },
};

export function diasDesde(data, agora = new Date()) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}

export function prazo(estado, actualizadoEm, agora = new Date()) {
  const limite = LIMITES[estado];
  if (!limite) return null;
  const dias = diasDesde(actualizadoEm, agora);
  const nivel = dias >= limite.atraso ? "atraso" : dias >= limite.atencao ? "atencao" : "ok";
  const quando =
    dias === 0 ? "desde hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return { dias, nivel, acao: limite.acao, texto: quando };
}

export const rotuloPrazo = (nivel) =>
  nivel === "atraso" ? "Atrasado" : nivel === "atencao" ? "A acompanhar" : "Dentro do prazo";
