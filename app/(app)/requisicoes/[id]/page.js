import { notFound } from "next/navigation";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { obterRequisicao } from "@/lib/requisicoes";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";
import { prazo, rotuloPrazo } from "@/lib/prazos";
import Btn from "@/components/Btn";
import ItensForm from "@/components/ItensForm";
import FicheiroInput from "@/components/FicheiroInput";
import {
  adicionarAnexo,
  submeter,
  cancelar,
  decidir,
  enviarDinheiro,
  registarCompra,
  fecharRequisicao,
  comentar,
  editarItens,
  duplicarRequisicao,
  registarReembolso,
  entradaStockRequisicao,
  guardarModelo,
  guardarFavorito,
  confirmarCobertura,
} from "@/app/actions";

const ERROS = {
  motivo: "Indique o motivo.",
  comprovativo: "Indique o valor e anexe o comprovativo (PDF/JPG/PNG, até 4 MB).",
  "sem-anexo": "Anexe pelo menos um documento do orçamento antes de submeter.",
  compra: "Indique o valor gasto e anexe pelo menos um comprovativo de compra.",
  data: "A data da compra não pode estar no futuro.",
  dados: "Verifique os valores: quantidades e preços têm de ser números válidos.",
  upload: "Não foi possível carregar o ficheiro. Verifique o tamanho (máx. 4 MB) e tente novamente.",
  tamanho: "O ficheiro tem mais de 4 MB. Reduza a foto ou o PDF e tente outra vez.",
  tipo: "Só são aceites ficheiros PDF, JPG ou PNG. Converta o documento e tente outra vez.",
  duplicado: "Este comprovativo já foi usado noutra requisição. Cada factura só pode entrar uma vez.",
  estado: "A requisição já mudou de estado. Recarregue a página e tente de novo.",
  ja: "Já registou a sua decisão nesta submissão.",
  saldo: "O comprovativo da devolução do saldo é obrigatório.",
  credito: "O saldo abatido ainda não cobre o valor estimado.",
  stock: "Não foi possível dar entrada no stock (já foi feito ou não há itens).",
  modelo: "Indique um nome para o modelo.",
};

const Hidden = ({ id }) => <input type="hidden" name="id" value={id} />;

const Links = ({ urls }) => (
  <>
    {urls.map((u, i) => (
      <a key={i} href={u} target="_blank" rel="noreferrer" className="ficheiro">
        📎 ficheiro {i + 1}
      </a>
    ))}
  </>
);

export default async function Detalhe({ params, searchParams }) {
  const s = await exigir();
  const id = Number(params.id);
  const dados = await obterRequisicao(id, s);
  if (!dados) notFound();
  const { r, itens, anexos, aprov, pags, compras, acerto, hist, coment, votou, reembolsos, aprovacao, creditos, stockEntrada } = dados;

  const [categorias, fornecedores] = await Promise.all([
    q("SELECT id, nome FROM categorias ORDER BY nome"),
    q("SELECT id, nome FROM fornecedores WHERE activo ORDER BY nome"),
  ]);

  const enviado = pags.reduce((a, p) => a + Number(p.valor), 0);
  const credito = creditos.reduce((a, c) => a + Number(c.valor), 0);
  const financiado = enviado + credito;
  const gasto = compras.reduce((a, c) => a + Number(c.valor_gasto), 0);
  const saldo = financiado - gasto;
  const necessario = Math.max(0, Number(r.valor_estimado) - financiado);
  const dono = s.perfil === "mestre";
  const e = r.estado;
  const pz = prazo(e, r.actualizado_em);
  const podeEditar = dono && ["rascunho", "correccao_pedida"].includes(e);
  const podePagar = s.perfil === "financeiro" && ["aprovado", "dinheiro_enviado"].includes(e);
  const podeComprar = dono && ["dinheiro_enviado", "compra_comprovada"].includes(e);

  return (
    <>
      <div className="linha">
        <h1>
          {r.codigo} <Badge estado={e} />
          {pz && <span className={`prazo ${pz.nivel}`}>{rotuloPrazo(pz.nivel)} · {pz.texto}</span>}
        </h1>
        <div className="acoes">
          <a href={`/api/requisicoes/${id}/pdf`} className="btn pri" target="_blank" rel="noreferrer">
            Gerar PDF
          </a>
          {dono && (
            <form action={duplicarRequisicao}>
              <Hidden id={id} />
              <Btn className="sec">Duplicar</Btn>
            </form>
          )}
        </div>
      </div>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível concluir."}</p>}
      {searchParams.ok && (
        <p className="aviso">
          {{
            stock: "Material enviado para o inventário do site.",
            favorito: "Item guardado nos favoritos.",
            credito: "Requisição coberta pelo saldo abatido.",
          }[searchParams.ok] || "Guardado."}
        </p>
      )}

      <div className="card">
        <p>
          <b>Mestre:</b> {r.mestre} ({r.telefone}) · <b>Site:</b> {r.site} · <b>Urgência:</b> {r.urgencia}
        </p>
        <p>
          <b>Justificação:</b> {r.justificacao}
        </p>
        <p>
          <b>Criada:</b> {dt(r.criado_em)} · <b>Última alteração:</b> {dt(r.actualizado_em)}
        </p>
      </div>

      <h2>Orçamento</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Preço un.</th>
              <th>Subtotal</th>
              <th aria-label="Favorito"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td>{i.descricao}</td>
                <td>{i.categoria}</td>
                <td>{Number(i.quantidade)} {i.unidade}</td>
                <td>{MT(i.preco_unitario)}</td>
                <td>{MT(i.subtotal)}</td>
                <td>
                  {dono && (
                    <form action={guardarFavorito}>
                      <input type="hidden" name="item_id" value={i.id} />
                      <button className="estrela" title="Guardar nos favoritos">★</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan="4">
                <b>Total estimado</b>
              </td>
              <td>
                <b>{MT(r.valor_estimado)}</b>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p>
          <b>Documentos:</b>{" "}
          {anexos.length === 0 ? (
            <span className="mut">nenhum</span>
          ) : (
            anexos.map((a) => (
              <a key={a.id} href={a.ficheiro_url} target="_blank" rel="noreferrer" className="ficheiro">
                📎 {a.tipo}
                {a.nome_original ? ` · ${a.nome_original}` : ""}
              </a>
            ))
          )}
        </p>
        {podeEditar && (
          <form action={adicionarAnexo} className="inline">
            <Hidden id={id} />
            <select name="tipo_anexo">
              <option value="cotacao">Cotação</option>
              <option value="proforma">Proforma</option>
              <option value="foto">Foto</option>
              <option value="outro">Outro</option>
            </select>
            <FicheiroInput name="anexos" multiple required />
            <Btn className="sec">Anexar</Btn>
          </form>
        )}
      </div>

      {podeEditar && (
        <details className="card">
          <summary>
            <b>Editar itens do orçamento</b>
          </summary>
          <form action={editarItens} style={{ marginTop: 12 }}>
            <Hidden id={id} />
            <ItensForm categorias={categorias} iniciais={itens} />
            <Btn className="pri">Guardar itens</Btn>
          </form>
        </details>
      )}

      {podeEditar && (
        <div className="acoes">
          <form action={submeter}>
            <Hidden id={id} />
            <Btn className="pri">{e === "rascunho" ? "Submeter para aprovação" : "Re-submeter"}</Btn>
          </form>
          <form action={cancelar}>
            <Hidden id={id} />
            <Btn className="sec">Cancelar requisição</Btn>
          </form>
        </div>
      )}
      {dono && e === "submetido" && (
        <form action={cancelar}>
          <Hidden id={id} />
          <Btn className="sec">Cancelar requisição</Btn>
        </form>
      )}

      {aprovacao.necessarios > 1 && ["submetido", "aprovado"].includes(e) && (
        <p className="card aviso-inline">
          <b>Aprovações:</b> {aprovacao.obtidos} de {aprovacao.necessarios}
          {aprovacao.faltam > 0 ? ` — faltam ${aprovacao.faltam}.` : " — concluídas."}
        </p>
      )}

      {aprov.length > 0 && (
        <>
          <h2>Decisões</h2>
          <div className="card">
            {aprov.map((a) => (
              <p key={a.id}>
                <b>{a.aprovador}</b>: {a.decisao}
                {a.motivo ? ` — ${a.motivo}` : ""} <span className="mut">({dt(a.decidido_em)})</span>
              </p>
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
            <b>{MT(p.valor)}</b> via {p.metodo}
            {p.referencia ? ` (ref. ${p.referencia})` : ""} por {p.financeiro} · {dt(p.enviado_em)}{" "}
            <Links urls={p.urls} />
          </p>
        ))}
      </div>

      {podePagar && (necessario > 0 || e === "dinheiro_enviado") && (
        <form action={enviarDinheiro} className="card">
          <h2>{pags.length === 0 ? "Enviar dinheiro" : "Enviar mais dinheiro"}</h2>
          {credito > 0 && (
            <p className="mut">
              Saldo abatido já aplicado: <b>{MT(credito)}</b>. Falta financiar {MT(necessario)}.
            </p>
          )}
          <Hidden id={id} />
          <label>Valor (MZN)</label>
          <input
            name="valor"
            inputMode="decimal"
            defaultValue={necessario > 0 ? Number(necessario.toFixed(2)) : ""}
            required
          />
          <label>Método</label>
          <select name="metodo">
            <option value="mpesa">M-Pesa</option>
            <option value="emola">e-Mola</option>
            <option value="mkesh">mKesh</option>
            <option value="banco">Banco</option>
            <option value="numerario">Numerário</option>
          </select>
          <label>Referência da transacção</label>
          <input name="referencia" />
          <FicheiroInput name="comprovativo" label="Comprovativo de transferência (obrigatório)" required />
          <Btn className="pri">Registar envio</Btn>
        </form>
      )}

      {creditos.length > 0 && (
        <div className="card">
          <b>Saldo abatido aplicado:</b>
          {creditos.map((c) => (
            <p key={c.id}>
              {MT(c.valor)} · de uma requisição anterior · {dt(c.criado_em)}
            </p>
          ))}
        </div>
      )}

      {s.perfil === "financeiro" && e === "aprovado" && credito > 0 && necessario === 0 && (
        <form action={confirmarCobertura} className="card">
          <h2>Cobertura por saldo abatido</h2>
          <p>
            O saldo abatido de <b>{MT(credito)}</b> cobre o valor estimado. Não é necessário transferir dinheiro.
          </p>
          <Hidden id={id} />
          <Btn className="pri">Confirmar cobertura</Btn>
        </form>
      )}

      <h2>Compra</h2>
      <div className="card">
        {compras.length === 0 && <p className="mut">Ainda sem comprovativo de compra.</p>}
        {compras.map((c) => (
          <p key={c.id}>
            <b>{MT(c.valor_gasto)}</b> em {new Date(c.data_compra).toLocaleDateString("pt-MZ")}
            {c.fornecedor ? ` · ${c.fornecedor}` : ""} <Links urls={c.urls} />
          </p>
        ))}
      </div>

      {podeComprar && (
        <form action={registarCompra} className="card">
          <h2>{compras.length === 0 ? "Registar compra" : "Registar outra compra"}</h2>
          <Hidden id={id} />
          <label>Valor gasto (MZN)</label>
          <input name="valor_gasto" inputMode="decimal" required />
          <label>Data da compra</label>
          <input name="data_compra" type="date" max={new Date().toISOString().slice(0, 10)} />
          <label>Fornecedor (opcional)</label>
          <select name="fornecedor_id">
            <option value="">—</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <label>Tipo de comprovativo</label>
          <select name="tipo">
            <option value="factura">Factura</option>
            <option value="recibo">Recibo</option>
            <option value="foto_material">Foto do material</option>
            <option value="outro">Outro</option>
          </select>
          <FicheiroInput name="comprovativos" multiple required label="Comprovativos (obrigatório)" />
          <Btn className="pri">Enviar comprovativo de compra</Btn>
        </form>
      )}

      {dono && ["compra_comprovada", "fechado"].includes(e) && (
        stockEntrada ? (
          <p className="card aviso">O material desta requisição já entrou no inventário.</p>
        ) : (
          <form action={entradaStockRequisicao} className="card">
            <h2>Inventário do site</h2>
            <p className="mut">
              Dar entrada no stock dos itens comprados (quantidades pedidas). Fica registado no histórico do
              inventário e ligado a esta requisição.
            </p>
            <Hidden id={id} />
            <Btn className="sec">Dar entrada no stock</Btn>
          </form>
        )
      )}

      {(financiado > 0 || compras.length > 0) && (
        <p className="card">
          <b>Enviado:</b> {MT(enviado)}
          {credito > 0 ? <> · <b>Saldo abatido:</b> {MT(credito)}</> : null}
          {" · "}
          <b>Total financiado:</b> {MT(financiado)} · <b>Gasto:</b> {MT(gasto)} · <b>Saldo:</b> {MT(saldo)}
          {acerto && (
            <>
              {" "}
              · <b>Acerto:</b> {acerto.estado.replaceAll("_", " ")}
              {acerto.comprovativo_url && (
                <>
                  {" "}
                  <a href={acerto.comprovativo_url} target="_blank" rel="noreferrer" className="ficheiro">
                    📎 comprovativo
                  </a>
                </>
              )}
            </>
          )}
        </p>
      )}

      {s.perfil === "financeiro" && e === "compra_comprovada" && (
        <form action={fecharRequisicao} className="card">
          <h2>Acerto e fecho</h2>
          <Hidden id={id} />
          {saldo > 0 && (
            <>
              <p>
                <label>O saldo de {MT(saldo)} foi…</label>
                <select name="destino">
                  <option value="devolvido">Devolvido (anexe o comprovativo)</option>
                  <option value="abatido">Abatido a próxima requisição</option>
                </select>
              </p>
              <FicheiroInput name="comprovativo" label="Comprovativo da devolução (obrigatório se devolvido)" />
            </>
          )}
          {saldo < 0 && (
            <p className="mut">
              O mestre gastou {MT(-saldo)} acima do que recebeu. Ao fechar, fica registado como excesso a reembolsar.
            </p>
          )}
          <Btn className="pri">Fechar requisição</Btn>
        </form>
      )}

      {s.perfil === "financeiro" && acerto?.estado === "excesso_a_reembolsar" && (
        <form action={registarReembolso} className="card">
          <h2>Reembolsar o excesso</h2>
          <Hidden id={id} />
          <p>
            O mestre gastou <b>{MT(-Number(acerto.saldo))}</b> acima do enviado. Registe a devolução com o comprovativo.
          </p>
          <FicheiroInput name="comprovativo" label="Comprovativo do reembolso (obrigatório)" required />
          <Btn className="pri">Marcar como reembolsado</Btn>
        </form>
      )}

      {reembolsos.length > 0 && (
        <div className="card">
          <b>Reembolsos registados:</b>
          {reembolsos.map((x) => (
            <p key={x.id}>
              {MT(x.valor)} · {dt(x.criado_em)}{" "}
              <a href={x.comprovativo_url} target="_blank" rel="noreferrer" className="ficheiro">
                📎 comprovativo
              </a>
            </p>
          ))}
        </div>
      )}

      {dono && itens.length > 0 && (
        <form action={guardarModelo} className="card">
          <h2>Guardar como modelo</h2>
          <p className="mut">
            Guarda os itens e a justificação para reutilizar numa próxima requisição. Pode ficar só para si ou
            partilhar com os outros mestres.
          </p>
          <Hidden id={id} />
          <label>Nome do modelo</label>
          <input name="nome" maxLength="120" required placeholder="Ex.: Material de fibra — Beira" />
          <label>
            <input type="checkbox" name="partilhado" /> Partilhar com os outros mestres
          </label>
          <Btn className="sec">Guardar modelo</Btn>
        </form>
      )}

      <h2>Conversa</h2>
      <div className="card">
        {coment.map((c) => (
          <p key={c.id}>
            <b>{c.nome}</b> <span className="mut">{dt(c.criado_em)}</span>
            <br />
            {c.texto}
          </p>
        ))}
        <form action={comentar} className="inline">
          <Hidden id={id} />
          <input name="texto" placeholder="Escreva um comentário…" required />
          <Btn className="sec">Enviar</Btn>
        </form>
      </div>

      <h2>Histórico</h2>
      <div className="card">
        {hist.map((h) => (
          <p key={h.id} className="mut">
            {dt(h.criado_em)} · {ESTADOS[h.estado_anterior] || "—"} → <b>{ESTADOS[h.estado_novo]}</b>
            {h.nome ? ` · ${h.nome}` : ""}
          </p>
        ))}
      </div>
    </>
  );
}
