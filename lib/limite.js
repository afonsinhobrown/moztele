import { q, q1 } from "./db";

export const LIMITE_TENTATIVAS = 8;
export const JANELA_MINUTOS = 15;

// Bloqueia por telefone e por IP, para não haver enumeração de números.
export async function demasiadasTentativas(telefone, ip) {
  const r = await q1(
    `SELECT count(*)::int AS n
       FROM tentativas_login
      WHERE sucesso = FALSE
        AND criado_em > now() - ($3::text || ' minutes')::interval
        AND (($1::text IS NOT NULL AND telefone = $1) OR ($2::text IS NOT NULL AND ip = $2))`,
    [telefone || null, ip || null, String(JANELA_MINUTOS)]
  );
  return Number(r?.n || 0) >= LIMITE_TENTATIVAS;
}

export async function registarTentativa(telefone, ip, sucesso) {
  await q("INSERT INTO tentativas_login (telefone, ip, sucesso) VALUES ($1,$2,$3)", [
    telefone || null,
    ip || null,
    Boolean(sucesso),
  ]);
  // Limpeza oportunista (não precisa de cron).
  if (Math.random() < 0.05)
    await q("DELETE FROM tentativas_login WHERE criado_em < now() - interval '2 days'");
}
