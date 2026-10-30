export const SENHA_MINIMA = 8;

// Regras simples e explicáveis. Devolve lista de problemas (vazia = válida).
export function errosSenha(senha) {
  const s = String(senha ?? "");
  const erros = [];
  if (s.length < SENHA_MINIMA) erros.push(`Pelo menos ${SENHA_MINIMA} caracteres.`);
  if (!/[A-Za-z]/.test(s)) erros.push("Pelo menos uma letra.");
  if (!/\d/.test(s)) erros.push("Pelo menos um número.");
  if (s.length > 72) erros.push("No máximo 72 caracteres.");
  if (/^\s|\s$/.test(s)) erros.push("Sem espaços no início ou no fim.");
  return erros;
}

export const senhaValida = (senha) => errosSenha(senha).length === 0;
