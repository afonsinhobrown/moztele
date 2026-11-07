import Link from "next/link";
import { exigir } from "@/lib/auth";
import { painel } from "@/lib/painel";
import { Badge, MT, dt } from "@/lib/ui";
import { prazo } from "@/lib/prazos";

export const metadata = { title: "Painel · Moz Teles" };

const PERFIL = {
  mestre: "Mestre",
  aprovador: "Aprovador",
  financeiro: "Financeiro",
  admin: "Administração",
};

const PRAZO_CLASSE = { ok: "", atencao: "atencao", atraso: "atraso" };

function Cartao({ a }) {
  const p = prazo(a.estado, a.actualizadoEm);
  const classe = PRAZO_CLASSE[p?.nivel] || "";
  return (
    <article className="acao-card">
      <div className="acao-topo">
        <Link href={a.href} className="acao-codigo">{a.codigo}</Link>
        <Badge estado={a.estado} />
        {a.dias > 0 && <span className={`prazo ${classe}`} title="Dias neste estado">{a.dias}d</span>}
      </div>
      <h3>{a.titulo}</h3>
      <p>{a.detalhe}</p>
      <div className="acao-rodape">
        <span className="mut pequeno">
          {a.site}
          {a.mestre ? ` · ${a.mestre}` : ""} · {MT(a.valor)}
        </span>
        <Link href={a.href} className="btn pri">{a.acao}</Link>
      </div>
    </article>
  );
}

export default async function Inicio({ searchParams }) {
  const s = await exigir();
  const dados = await painel(s);
  const acoes = dados.acoes || [];

  return (
    <>
      <div className="linha">
        <h1>Olá, {s.nome.split(" ")[0]}</h1>
        <span className="mut pequeno">{PERFIL[s.perfil]}</span>
      </div>

      {s.perfil === "mestre" && (
        <div className="painel-cta">
          <div>
            <h2>Precisa de material para a obra?</h2>
            <p className="mut">Descreva o material, anexe o orçamento e submeta — o resto segue sozinho.</p>
          </div>
          <Link href="/requisicoes/nova" className="btn pri grande">+ Nova requisição</Link>
        </div>
      )}

      {s.perfil === "financeiro" && (
        <div className="painel-cta">
          <div>
            <h2>Prestação de contas</h2>
            <p className="mut">Requisições com dinheiro enviado ou compra comprovada, ainda sem acerto.</p>
          </div>
          <Link href="/prestacao-contas" className="btn pri grande">Abrir prestação de contas</Link>
        </div>
      )}

      {s.perfil === "aprovador" && (
        <div className="painel-cta">
          <div>
            <h2>Fila de aprovação</h2>
            <p className="mut">
              {dados.resumo.fila} requisição(ões) submetida(s) na sua área.
            </p>
          </div>
          <Link href="/requisicoes" className="btn pri grande">Ver fila</Link>
        </div>
      )}

      {s.perfil === "admin" && (
        <div className="painel-cta">
          <div>
            <h2>Administração</h2>
            <p className="mut">Utilizadores, catálogos, regras, projetos e auditoria.</p>
          </div>
          <div className="acoes">
            <Link href="/admin" className="btn pri">Administração</Link>
            <Link href="/admin/auditoria" className="btn sec">Auditoria</Link>
          </div>
        </div>
      )}

      <div className="chips resumo">
        {s.perfil === "mestre" && (
          <>
            <span className="chip-resumo"><b>{dados.resumo.emCurso}</b> em curso</span>
            <Link href="/creditos" className="chip-resumo">
              <b>{MT(dados.resumo.credito)}</b> de saldo abatido
            </Link>
          </>
        )}
        {s.perfil === "financeiro" && (
          <>
            <span className="chip-resumo"><b>{dados.resumo.porPagar}</b> por pagar</span>
            <span className="chip-resumo"><b>{dados.resumo.porAcertar}</b> por acertar</span>
            <span className="chip-resumo">{MT(dados.resumo.valorPorPagar)} aprovados por enviar</span>
          </>
        )}
        {s.perfil === "aprovador" && (
          <span className="chip-resumo"><b>{dados.resumo.fila}</b> na fila</span>
        )}
        {s.perfil === "admin" && (
          <>
            <span className="chip-resumo"><b>{dados.resumo.submetidas}</b> a aguardar aprovação</span>
            <span className="chip-resumo"><b>{dados.resumo.porAcertar}</b> por acertar</span>
            <span className="chip-resumo"><b>{dados.resumo.utilizadores}</b> utilizadores activos</span>
            {dados.resumo.contasTeste > 0 && (
              <span className="chip-resumo atencao"><b>{dados.resumo.contasTeste}</b> contas de teste activas</span>
            )}
          </>
        )}
      </div>

      {searchParams.ok === "senha" && <p className="aviso">Senha actualizada.</p>}

      <h2>Precisa da sua acção{acoes.length ? ` (${acoes.length})` : ""}</h2>
      {acoes.length === 0 ? (
        <div className="card vazio">
          <p><b>Nada pendente.</b> Não há requisições à sua espera.</p>
          {s.perfil === "mestre" ? (
            <Link href="/requisicoes/nova" className="btn pri">Criar nova requisição</Link>
          ) : (
            <Link href="/requisicoes" className="btn sec">Ver todas as requisições</Link>
          )}
        </div>
      ) : (
        <div className="acoes-lista">
          {acoes.map((a) => <Cartao key={`${a.estado}-${a.id}`} a={a} />)}
        </div>
      )}

      {dados.delegacoes?.length > 0 && (
        <p className="aviso">
          <b>Delegação activa:</b> está a decidir em nome de{" "}
          {dados.delegacoes.map((d) => d.de_nome).join(", ")}.{" "}
          <Link href="/delegacoes">Gerir delegações</Link>
        </p>
      )}

      {s.perfil === "mestre" && dados.acompanhar?.length > 0 && (
        <>
          <h2>A acompanhar (chefia)</h2>
          <div className="card tabela">
            <table>
              <thead><tr><th>Código</th><th>Mestre</th><th>Site</th><th>Estado</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {dados.acompanhar.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                    <td>{r.mestre}</td>
                    <td>{r.site}</td>
                    <td><Badge estado={r.estado} /></td>
                    <td>{MT(r.valor_estimado)}</td>
                    <td className="mut pequeno">{dt(r.actualizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {s.perfil === "admin" && (
        <>
          <h2>Em curso</h2>
          <div className="card tabela">
            <table>
              <thead><tr><th>Código</th><th>Mestre</th><th>Site</th><th>Estado</th><th>Valor</th><th>Actualizada</th></tr></thead>
              <tbody>
                {dados.atrasadas.length === 0 && (
                  <tr><td colSpan="6" className="mut">Nada em curso.</td></tr>
                )}
                {dados.atrasadas.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                    <td>{r.mestre}</td>
                    <td>{r.site}</td>
                    <td><Badge estado={r.estado} /></td>
                    <td>{MT(r.valor_estimado)}</td>
                    <td>{dt(r.actualizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Últimas alterações</h2>
          <div className="card">
            {dados.recentes.length === 0 && <p className="mut">Sem registos de auditoria.</p>}
            {dados.recentes.map((a) => (
              <p key={a.id} className="mut pequeno">
                {dt(a.criado_em)} · <b>{a.utilizador || "sistema"}</b> · {a.tabela} · {a.operacao}
              </p>
            ))}
          </div>
        </>
      )}
    </>
  );
}
