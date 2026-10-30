import Link from "next/link";
import { sessao } from "@/lib/auth";

export const metadata = {
  title: "Moz Teles · Compras de obra sob controlo",
  description:
    "Do orçamento ao acerto: aprovações por valor, comprovativos privados e saldo sempre à vista. O sistema de requisições para obras e telecomunicações.",
};

const PASSOS = [
  { n: "01", t: "Orçamento", d: "O mestre descreve o material, anexa a cotação e o sistema calcula o total." },
  { n: "02", t: "Aprovação", d: "Quem aprova recebe o pedido; acima de 50 000 MZN são precisas duas aprovações." },
  { n: "03", t: "Dinheiro", d: "O financeiro envia o valor e anexa o comprovativo da transferência. Sem prova, não anda." },
  { n: "04", t: "Compra e acerto", d: "O mestre anexa as facturas, o saldo é calculado e o acerto fecha com prova." },
];

const FEATURES = [
  {
    icone: "📎",
    t: "Comprovativos obrigatórios",
    d: "O banco de dados recusa fechar uma requisição sem a prova do envio e a prova da compra.",
  },
  {
    icone: "✅",
    t: "Aprovação por escalões",
    d: "Regras por valor configuráveis: um aprovador até 50 000 MZN, dois acima disso. Sem excepções.",
  },
  {
    icone: "💸",
    t: "Saldo e acerto",
    d: "Enviado, gasto e saldo somados automaticamente. Devolução com comprovativo, excesso reembolsado.",
  },
  {
    icone: "🔒",
    t: "Ficheiros privados",
    d: "Os comprovativos ficam num bucket privado e só abrem para quem pode ver a requisição.",
  },
  {
    icone: "📊",
    t: "Relatórios a sério",
    d: "Por obra, mestre, período e categoria — em PDF e CSV, prontos para a contabilidade.",
  },
  {
    icone: "🔔",
    t: "Avisos onde a equipa está",
    d: "Notificações na app e por WhatsApp. Requisições paradas são sinalizadas ao fim de poucos dias.",
  },
];

export default async function Inicio() {
  let s = null;
  try {
    s = await sessao();
  } catch {
    s = null;
  }
  const destino = s ? (s.mudar ? "/conta/senha" : "/requisicoes") : "/login";

  return (
    <div className="site">
      <header className="site-topo">
        <Link href="/" className="site-logo">
          <span className="site-logo-marca">MT</span> Moz Teles
        </Link>
        <nav className="site-nav">
          <a href="#fluxo">Fluxo</a>
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#seguranca">Segurança</a>
        </nav>
        <Link href={destino} className="btn pri site-cta">
          {s ? "Entrar na app" : "Entrar"}
        </Link>
      </header>

      <section className="hero">
        <div className="hero-texto">
          <p className="etiqueta">Sistema de requisições · Moçambique</p>
          <h1>
            O dinheiro da obra <span className="realce">não se perde</span> em conversas.
          </h1>
          <p className="hero-sub">
            Do pedido do mestre ao acerto do financeiro, com orçamento, aprovações por valor e comprovativos
            guardados — tudo num sítio, com prova em cada passo.
          </p>
          <div className="hero-acoes">
            <Link href={destino} className="btn pri grande">
              {s ? "Abrir as requisições" : "Começar agora"}
            </Link>
            <a href="#fluxo" className="btn sec grande">
              Ver como funciona
            </a>
          </div>
          <p className="hero-nota">Acesso reservado a mestres, aprovadores, financeiro e administração.</p>
        </div>

        <div className="hero-mock" aria-hidden="true">
          <div className="mock-janela">
            <div className="mock-barra">
              <span className="ponto" />
              <span className="ponto" />
              <span className="ponto" />
              <span className="mock-url">moztele · REQ-2026-00042</span>
            </div>
            <div className="mock-corpo">
              <div className="mock-linha">
                <b>REQ-2026-00042</b>
                <span className="mock-badge">Dinheiro enviado</span>
              </div>
              <p className="mock-mut">Cabo de fibra · Site Beira Norte</p>
              <div className="mock-valores">
                <div>
                  <span className="mock-mut">Enviado</span>
                  <b>45 000,00 MZN</b>
                </div>
                <div>
                  <span className="mock-mut">Gasto</span>
                  <b>38 500,00 MZN</b>
                </div>
                <div>
                  <span className="mock-mut">Saldo</span>
                  <b className="verde">6 500,00 MZN</b>
                </div>
              </div>
              <div className="mock-timeline">
                <span className="mock-passo feito">Orçamento</span>
                <span className="mock-passo feito">Aprovado 2/2</span>
                <span className="mock-passo feito">Transferência</span>
                <span className="mock-passo actual">Factura anexada</span>
              </div>
              <div className="mock-anexo">
                📎 comprovativo-transferencia.pdf
                <span className="mock-mini">ver</span>
              </div>
            </div>
          </div>
          <div className="mock-flutuante">✅ Aprovado por 2 pessoas</div>
        </div>
      </section>

      <section className="tira">
        <div><b>100%</b><span>comprovativos exigidos</span></div>
        <div><b>4</b><span>passos até ao acerto</span></div>
        <div><b>0</b><span>facturas repetidas</span></div>
        <div><b>PDF · CSV</b><span>relatórios prontos</span></div>
      </section>

      <section id="fluxo" className="seccao">
        <p className="etiqueta">Do pedido ao acerto</p>
        <h2>Quatro passos, zero surpresas</h2>
        <p className="seccao-sub">
          Cada passo deixa rasto: quem pediu, quem aprovou, quem pagou e que documento prova.
        </p>
        <div className="passos">
          {PASSOS.map((p) => (
            <article className="passo" key={p.n}>
              <span className="passo-num">{p.n}</span>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="funcionalidades" className="seccao alternada">
        <p className="etiqueta">Feito para o terreno</p>
        <h2>Tudo o que uma compra de obra precisa</h2>
        <div className="grelha-funcionalidades">
          {FEATURES.map((f) => (
            <article className="funcionalidade" key={f.t}>
              <span className="func-icone">{f.icone}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="seguranca" className="seccao seguranca">
        <div className="seguranca-texto">
          <p className="etiqueta">Confiança</p>
          <h2>O dinheiro tem prova. Os documentos têm dono.</h2>
          <p>
            Os comprovativos não ficam num link público: são servidos pela aplicação apenas a quem tem sessão e
            pode ver aquela requisição. Cada factura é identificada pelo seu conteúdo, o que impede que a mesma
            prova seja usada duas vezes.
          </p>
          <p>
            Cada alteração de estado fica registada com o nome de quem a fez. As sessões podem ser cortadas a
            qualquer momento, e a mudança de senha termina os acessos antigos.
          </p>
          <Link href={destino} className="btn pri">
            Entrar no sistema
          </Link>
        </div>
        <ul className="lista-seguranca">
          <li><span>🔐</span> Bucket privado, entrega autenticada</li>
          <li><span>🧾</span> Hash anti-duplicação de comprovativos</li>
          <li><span>🧭</span> Histórico com autor em cada passo</li>
          <li><span>⏱️</span> Sessões revogáveis e senhas exigentes</li>
          <li><span>📵</span> Sem links públicos para facturas</li>
        </ul>
      </section>

      <section className="cta-final">
        <h2>Menos papelada. Mais obra feita.</h2>
        <p>Entre com o seu telefone e comece a acompanhar as requisições da sua equipa.</p>
        <Link href={destino} className="btn pri grande">
          {s ? "Abrir as requisições" : "Entrar no Moz Teles"}
        </Link>
      </section>

      <footer className="site-rodape">
        <span>© {new Date().getFullYear()} Moz Teles · Sistema de requisições</span>
        <span>
          <Link href={destino}>Aplicação</Link> · <Link href="/login">Entrar</Link>
        </span>
      </footer>
    </div>
  );
}
