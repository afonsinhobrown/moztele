import { notFound } from "next/navigation";
import { exigir } from "@/lib/auth";
import { obterRequisicao } from "@/lib/requisicoes";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";
import Btn from "@/components/Btn";
import {
  adicionarAnexo, submeter, cancelar, decidir, enviarDinheiro,
  registarCompra, fecharRequisicao, comentar,
} from "@/app/actions";

const ERROS = {
  motivo: "Indique o motivo.",
  comprovativo: "Indique o valor e anexe o comprovativo de transferência.",
  "sem-anexo": "Anexe pelo menos um documento do orçamento antes de submeter.",
  compra: "Indique o valor gasto e anexe pelo menos um comprovativo de compra.",
  upload: "Não foi possível carregar o ficheiro. Verifique o tamanho (máx. 4 MB) e tente novamente.",
};

const Hidden = ({ id }) => <input type="hidden" name="id" value={id} />;
const Links = ({ urls }) => (
  <>{urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="ficheiro">📎 ficheiro {i + 1}</a>)}</>
);

export default async function Detalhe({ params, searchParams }) {
  const s = await exigir();
  const id = Number(params.id);
  const dados = await obterRequisicao(id, s);
  if (!dados) notFound();
  const { r, itens, anexos, aprov, pags, compras, acerto, hist, coment, votou } = dados;

  const enviado = pags.reduce((a, p) => a + Number(p.valor), 0);
  const gasto = compras.reduce((a, c) => a + Number(c.valor_gasto), 0);
  const dono = s.perfil === "mestre";
  const e = r.estado;

  return (
    <>
      <div className="linha">
        <h1>{r.codigo} <Badge estado={e} /></h1>
        <a href={`/api/requisicoes/${id}/pdf`} className="btn pri" target="_blank" rel="noreferrer">Gerar PDF</a>
      </div>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível concluir."}</p>}

      <div className="card">
        <p><b>Mestre:</b> {r.mestre} ({r.telefone}) · <b>Site:</b> {r.site} · <b>Urgência:</b> {r.urgencia}</p>
        <p><b>Justificação:</b> {r.justificacao}</p>
        <p><b>Criada:</b> {dt(r.criado_em)}</p>
      </div>

      <h2>Orçamento</h2>
      <div className="card tabela">
        <table>
          <thead><tr><th>Item</th><th>Categoria</th><th>Qtd</th><th>Preço un.</th><th>Subtotal</th></tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}><td>{i.descricao}</td><td>{i.categoria}</td><td>{Number(i.quantidade)} {i.unidade}</td><td>{MT(i.preco_unitario)}</td><td>{MT(i.subtotal)}</td></tr>
            ))}
            <tr><td colSpan="4"><b>Total estimado</b></td><td><b>{MT(r.valor_estimado)}</b></td></tr>
          </tbody>
        </table>
        <p>
          <b>Documentos:</b>{" "}
          {anexos.length === 0 ? <span className="mut">nenhum</span> : anexos.map((a) => (
            <a key={a.id} href={a.ficheiro_url} target="_blank" rel="noreferrer" className="ficheiro">📎 {a.tipo}</a>
          ))}
        </p>
        {dono && ["rascunho", "correccao_pedida"].includes(e) && (
          <form action={adicionarAnexo} className="inline">
            <Hidden id={id} />
            <select name="tipo_anexo"><option value="cotacao">Cotação</option><option value="proforma">Proforma</option><option value="foto">Foto</option><option value="outro">Outro</option></select>
            <input type="file" name="anexos" multiple accept="image/*,application/pdf" required />
            <Btn className="sec">Anexar</Btn>
          </form>
        )}
      </div>

      {dono && ["rascunho", "correccao_pedida"].includes(e) && (
        <div className="acoes">
          <form action={submeter}><Hidden id={id} /><Btn className="pri">{e === "rascunho" ? "Submeter para aprovação" : "Re-submeter"}</Btn></form>
          <form action={cancelar}><Hidden id={id} /><Btn className="sec">Cancelar requisição</Btn></form>
        </div>
      )}
      {dono && e === "submetido" && (
        <form action={cancelar}><Hidden id={id} /><Btn className="sec">Cancelar requisição</Btn></form>
      )}

      {aprov.length > 0 && (
        <>
          <h2>Decisões</h2>
          <div className="card">
            {aprov.map((a) => (
              <p key={a.id}><b>{a.aprovador}</b>: {a.decisao}{a.motivo ? ` — ${a.motivo}` : ""} <span className="mut">({dt(a.decidido_em)})</span></p>
            ))}
          </div>
        </>
      )}

      {s.perfil === "aprovador" && e === "submetido" && votou.length === 0 && (
        <form action={decidir} className="card">
          <h2>A sua decisão</h2>
          <Hidden id={id} />
          <select name="decisao" required>
            <option value="aprovado">Aprovar</option>
            <option value="correccao">Pedir correcção</option>
            <option value="reprovado">Reprovar</option>
          </select>
          <textarea name="motivo" rows="2" placeholder="Motivo (obrigatório ao reprovar ou pedir correcção)" />
          <Btn className="pri">Confirmar decisão</Btn>
        </form>
      )}

      <h2>Dinheiro enviado</h2>
      <div className="card">
        {pags.length === 0 && <p className="mut">Ainda não foi enviado dinheiro.</p>}
        {pags.map((p) => (
          <p key={p.id}>
            <b>{MT(p.valor)}</b> via {p.metodo}{p.referencia ? ` (ref. ${p.referencia})` : ""} por {p.financeiro} · {dt(p.enviado_em)} <Links urls={p.urls} />
          </p>
        ))}
      </div>

      {s.perfil === "financeiro" && e === "aprovado" && (
        <form action={enviarDinheiro} className="card">
          <h2>Enviar dinheiro</h2>
          <Hidden id={id} />
          <label>Valor (MZN)</label>
          <input name="valor" inputMode="decimal" defaultValue={Number(r.valor_estimado)} required />
          <label>Método</label>
          <select name="metodo"><option value="mpesa">M-Pesa</option><option value="emola">e-Mola</option><option value="mkesh">mKesh</option><option value="banco">Banco</option><option value="numerario">Numerário</option></select>
          <label>Referência da transacção</label>
          <input name="referencia" />
          <label>Comprovativo de transferência (obrigatório)</label>
          <input type="file" name="comprovativo" accept="image/*,application/pdf" required />
          <Btn className="pri">Registar envio</Btn>
        </form>
      )}

      <h2>Compra</h2>
      <div className="card">
        {compras.length === 0 && <p className="mut">Ainda sem comprovativo de compra.</p>}
        {compras.map((c) => (
          <p key={c.id}><b>{MT(c.valor_gasto)}</b> em {new Date(c.data_compra).toLocaleDateString("pt-MZ")} <Links urls={c.urls} /></p>
        ))}
      </div>

      {dono && e === "dinheiro_enviado" && (
        <form action={registarCompra} className="card">
          <h2>Registar compra</h2>
          <Hidden id={id} />
          <label>Valor gasto (MZN)</label>
          <input name="valor_gasto" inputMode="decimal" required />
          <label>Data da compra</label>
          <input name="data_compra" type="date" />
          <label>Tipo de comprovativo</label>
          <select name="tipo"><option value="factura">Factura</option><option value="recibo">Recibo</option><option value="foto_material">Foto do material</option><option value="outro">Outro</option></select>
          <input type="file" name="comprovativos" multiple accept="image/*,application/pdf" required />
          <Btn className="pri">Enviar comprovativo de compra</Btn>
        </form>
      )}

      {(pags.length > 0 || compras.length > 0) && (
        <p className="card">
          <b>Enviado:</b> {MT(enviado)} · <b>Gasto:</b> {MT(gasto)} · <b>Saldo:</b> {MT(enviado - gasto)}
          {acerto && <> · <b>Acerto:</b> {acerto.estado.replaceAll("_", " ")}</>}
        </p>
      )}

      {s.perfil === "financeiro" && e === "compra_comprovada" && (
        <form action={fecharRequisicao} className="card">
          <h2>Acerto e fecho</h2>
          <Hidden id={id} />
          {enviado - gasto > 0 && (
            <>
              <label>O saldo de {MT(enviado - gasto)} foi…</label>
              <select name="destino"><option value="devolvido">Devolvido</option><option value="abatido">Abatido a próxima requisição</option></select>
            </>
          )}
          {enviado - gasto < 0 && <p className="mut">O mestre gastou mais do que recebeu: fica como excesso a reembolsar.</p>}
          <Btn className="pri">Fechar requisição</Btn>
        </form>
      )}

      <h2>Conversa</h2>
      <div className="card">
        {coment.map((c) => <p key={c.id}><b>{c.nome}</b> <span className="mut">{dt(c.criado_em)}</span><br />{c.texto}</p>)}
        <form action={comentar} className="inline"><Hidden id={id} /><input name="texto" placeholder="Escreva um comentário…" required /><Btn className="sec">Enviar</Btn></form>
      </div>

      <h2>Histórico</h2>
      <div className="card">
        {hist.map((h) => (
          <p key={h.id} className="mut">{dt(h.criado_em)} · {ESTADOS[h.estado_anterior] || "—"} → <b>{ESTADOS[h.estado_novo]}</b>{h.nome ? ` · ${h.nome}` : ""}</p>
        ))}
      </div>
    </>
  );
}
