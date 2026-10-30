import Link from "next/link";
import { exigirSessao } from "@/lib/auth";
import { mudarSenha } from "@/app/actions";
import Btn from "@/components/Btn";
import { SENHA_MINIMA } from "@/lib/senha";

const ERROS = {
  atual: "A senha actual não está certa.",
  confirma: "A confirmação não coincide com a nova senha.",
  fraca: `A nova senha não cumpre as regras (mínimo ${SENHA_MINIMA} caracteres, com letras e números).`,
  igual: "A nova senha tem de ser diferente da actual.",
};

export const metadata = { title: "Mudar senha · Moz Teles" };

export default async function ContaSenha({ searchParams }) {
  const s = await exigirSessao();
  return (
    <>
      <div className="linha">
        <h1>{s.deve_mudar_senha ? "Defina a sua nova senha" : "Mudar senha"}</h1>
        {!s.deve_mudar_senha && (
          <Link href="/requisicoes" className="btn sec">
            Voltar
          </Link>
        )}
      </div>

      {s.deve_mudar_senha && (
        <p className="aviso">
          A sua senha foi criada por um administrador. Por segurança, tem de a substituir antes de continuar.
        </p>
      )}
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível mudar a senha."}</p>}

      <form action={mudarSenha} className="card">
        <label>Senha actual</label>
        <input name="atual" type="password" autoComplete="current-password" required autoFocus />
        <label>Nova senha</label>
        <input name="nova" type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required />
        <p className="mut">Mínimo {SENHA_MINIMA} caracteres, com pelo menos uma letra e um número.</p>
        <label>Repetir a nova senha</label>
        <input name="confirmar" type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required />
        <Btn className="pri">Guardar nova senha</Btn>
        <p className="mut" style={{ marginTop: 10 }}>
          A mudança termina as sessões abertas noutros dispositivos.
        </p>
      </form>
    </>
  );
}
