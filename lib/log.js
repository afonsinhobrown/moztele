// Registo simples e estruturado (aparece nos logs da Vercel).
export function log(nivel, mensagem, dados = {}) {
  const linha = { hora: new Date().toISOString(), nivel, mensagem, ...dados };
  if (nivel === "erro") console.error(JSON.stringify(linha));
  else if (nivel === "aviso") console.warn(JSON.stringify(linha));
  else console.log(JSON.stringify(linha));
}

export const erroInesperado = (contexto, e, dados = {}) =>
  log("erro", contexto, {
    ...dados,
    erro: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
  });
