// Avisa (app + WhatsApp, se configurado) das requisições paradas.
// Uso: npm run alertas   — pode ser chamado por um cron da Vercel.
import pg from "pg";
import { LIMITES } from "../lib/prazos.js";
import { enviarWhatsapp, whatsappConfigurado } from "../lib/whatsapp.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não está definido.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

const DESTINO = {
  submetido: { perfil: "aprovador", frase: "à espera de aprovação" },
  correccao_pedida: { perfil: "mestre", frase: "à espera de correcção do mestre" },
  aprovado: { perfil: "financeiro", frase: "aprovada, à espera do envio do dinheiro" },
  dinheiro_enviado: { perfil: "mestre", frase: "com dinheiro enviado, à espera da compra" },
  compra_comprovada: { perfil: "financeiro", frase: "à espera do acerto final" },
};

try {
  let total = 0;
  for (const [estado, cfg] of Object.entries(DESTINO)) {
    const dias = LIMITES[estado].atraso;
    const { rows } = await pool.query(
      `SELECT id, codigo, mestre_id FROM requisicoes
        WHERE estado = $1 AND actualizado_em < now() - ($2 || ' days')::interval`,
      [estado, String(dias)]
    );
    for (const r of rows) {
      const mensagem = `Requisição ${r.codigo} parada há mais de ${dias} dias (${cfg.frase}).`;
      const repetida = await pool.query(
        `SELECT 1 FROM notificacoes WHERE requisicao_id=$1 AND mensagem=$2 AND enviada_em > now() - interval '20 hours' LIMIT 1`,
        [r.id, mensagem]
      );
      if (repetida.rows.length) continue;

      const destinatarios =
        cfg.perfil === "mestre"
          ? [{ id: r.mestre_id }]
          : (
              await pool.query(
                `SELECT u.id, u.telefone FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id
                  WHERE p.nome=$1 AND u.activo`,
                [cfg.perfil]
              )
            ).rows;

      for (const d of destinatarios) {
        await pool.query(
          "INSERT INTO notificacoes (utilizador_id, requisicao_id, canal, mensagem) VALUES ($1,$2,'app',$3)",
          [d.id, r.id, mensagem]
        );
        const tel = await pool.query("SELECT telefone FROM utilizadores WHERE id=$1", [d.id]);
        if (whatsappConfigurado() && tel.rows[0]?.telefone) {
          await enviarWhatsapp(tel.rows[0].telefone, `Moz Teles: ${mensagem}`).catch((e) =>
            console.error("WhatsApp:", e.message)
          );
        }
      }
      total++;
    }
  }
  console.log(`Requisições paradas avisadas: ${total}`);
} finally {
  await pool.end();
}
