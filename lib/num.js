// Conversão de números escrita por humanos (Moçambique): aceita "1.234,56",
// "1 234,56", "1234.56" e "1234,56". Devolve NaN quando não é um número.
export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim();
  if (!s) return NaN;
  s = s.replace(/[\s\u00a0\u202f]/g, "").replace(/MZN/gi, "");
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
  if (s.includes(",")) {
    // vírgula é o separador decimal; pontos são milhares
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // só pontos, em grupos de milhares: 1.234.567
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const arred = (n) => Math.round(n * 100) / 100;

// Quantidade positiva (permite decimais).
export const quantidadeValida = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Preço/valor não negativo.
export const valorValido = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Valor estritamente positivo (envio de dinheiro).
export const valorPositivo = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
