import { arred } from "./num.js";

export const TIPOS_MOVIMENTO = ["entrada", "saida", "ajuste"];

export const MOTIVOS_ERRO = {
  tipo: "Tipo de movimento inválido.",
  quantidade: "Indique uma quantidade válida.",
  insuficiente: "Não há stock suficiente para essa saída.",
  stock: "O stock actual é inválido.",
};

// Calcula o novo saldo de um movimento sem tocar na base de dados.
// - entrada: soma a quantidade
// - saida: subtrai (nunca abaixo de zero)
// - ajuste: define o saldo absoluto (contagem física)
export function calcularMovimento({ tipo, quantidade, saldoAtual }) {
  const q = Number(quantidade);
  const saldo = Number(saldoAtual);

  if (!Number.isFinite(saldo) || saldo < 0) return { erro: "stock" };
  if (!Number.isFinite(q) || q < 0) return { erro: "quantidade" };

  if (tipo === "entrada") {
    if (q <= 0) return { erro: "quantidade" };
    return { saldoAnterior: arred(saldo), saldoApos: arred(saldo + q), delta: arred(q) };
  }
  if (tipo === "saida") {
    if (q <= 0) return { erro: "quantidade" };
    if (q > saldo) return { erro: "insuficiente" };
    return { saldoAnterior: arred(saldo), saldoApos: arred(saldo - q), delta: arred(-q) };
  }
  if (tipo === "ajuste") {
    return { saldoAnterior: arred(saldo), saldoApos: arred(q), delta: arred(q - saldo) };
  }
  return { erro: "tipo" };
}

export function estadoStock(quantidade, minima = 0) {
  const q = Number(quantidade);
  const m = Number(minima);
  if (!Number.isFinite(q) || q <= 0) return "sem";
  if (Number.isFinite(m) && m > 0 && q <= m) return "baixo";
  return "ok";
}

export const rotuloStock = (estado) =>
  estado === "sem" ? "Sem stock" : estado === "baixo" ? "Abaixo do mínimo" : "Disponível";
