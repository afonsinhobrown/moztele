import { arred } from "./num.js";

// Distribui o saldo abatido disponível por uma requisição, pela ordem dada.
// Nunca aplica mais do que o necessário e nunca deixa valores negativos.
export function distribuirCredito(disponiveis = [], necessario = 0) {
  const alvo = Math.max(0, arred(Number(necessario) || 0));
  let restante = alvo;
  const aplicacoes = [];

  for (const credito of disponiveis) {
    if (restante <= 0) break;
    const disponivel = Math.max(0, arred(Number(credito.disponivel) || 0));
    if (disponivel <= 0) continue;
    const valor = arred(Math.min(disponivel, restante));
    if (valor <= 0) continue;
    aplicacoes.push({ id: credito.id, valor });
    restante = arred(restante - valor);
  }

  return { aplicacoes, aplicado: arred(alvo - restante), restante };
}
