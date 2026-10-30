import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { criarRequisicao } from "@/app/actions";
import ItensForm from "@/components/ItensForm";
import FicheiroInput from "@/components/FicheiroInput";
import Btn from "@/components/Btn";

const ERROS = {
  1: "Preencha o site, a justificação e pelo menos um item.",
  2: "Anexe pelo menos um documento (cotação, proforma ou foto) para submeter.",
  dados: "Verifique os valores: quantidades e preços têm de ser números válidos.",
  site: "Escolha um site a que tenha acesso.",
  upload: "Não foi possível carregar o ficheiro. Verifique o tamanho (máx. 4 MB) e tente novamente.",
  tamanho: "O ficheiro tem mais de 4 MB. Reduza a foto ou o PDF e tente outra vez.",
  tipo: "Só são aceites ficheiros PDF, JPG ou PNG.",
};

export default async function Nova({ searchParams }) {
  const s = await exigir("mestre");
  const [sites, categorias] = await Promise.all([
    q(
      `SELECT st.id, st.nome FROM sites st
        WHERE st.activo AND (EXISTS (SELECT 1 FROM mestre_sites ms WHERE ms.mestre_id=$1 AND ms.site_id=st.id)
                             OR NOT EXISTS (SELECT 1 FROM mestre_sites WHERE mestre_id=$1))
        ORDER BY st.nome`,
      [s.id]
    ),
    q("SELECT id, nome FROM categorias ORDER BY nome"),
  ]);
  return (
    <>
      <h1>Nova requisição</h1>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      <form action={criarRequisicao} className="card">
        <label>Site / obra</label>
        <select name="site_id" required>
          <option value="">Escolha…</option>
          {sites.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>

        <label>Justificação</label>
        <textarea name="justificacao" rows="3" required maxLength="2000" placeholder="Porque precisa deste equipamento?" />

        <label>Urgência</label>
        <select name="urgencia" defaultValue="normal">
          <option value="baixa">Baixa</option><option value="normal">Normal</option>
          <option value="alta">Alta</option><option value="urgente">Urgente</option>
        </select>

        <h2>Orçamento</h2>
        <ItensForm categorias={categorias} />

        <h2>Documentos do orçamento</h2>
        <select name="tipo_anexo" defaultValue="cotacao">
          <option value="cotacao">Cotação</option><option value="proforma">Factura proforma</option>
          <option value="foto">Foto</option><option value="outro">Outro</option>
        </select>
        <FicheiroInput name="anexos" multiple />

        <div className="acoes">
          <Btn name="acao" value="rascunho" className="sec">Guardar rascunho</Btn>
          <Btn name="acao" value="submeter" className="pri">Submeter para aprovação</Btn>
        </div>
      </form>
    </>
  );
}
