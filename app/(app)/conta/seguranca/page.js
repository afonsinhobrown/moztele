import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q1 } from "@/lib/db";
import {
  iniciar2fa,
  confirmar2fa,
  desactivar2fa,
  actualizarPreferenciasAvisos,
} from "@/app/actions";
import { uriOtpauth } from "@/lib/totp";
import { emailConfigurado } from "@/lib/email";
import { smsConfigurado } from "@/lib/sms";
import Btn from "@/components/Btn";

export const metadata = { title: "Segurança · Moz Teles" };

const ERROS = {
  codigo: "Código incorrecto. Verifique a hora do telemóvel e tente outra vez.",
  estado: "O estado do segundo factor mudou. Recarregue a página.",
  autenticacao: "Confirme com a senha actual ou com um código válido.",
};

const OK = {
  activo: "Segundo factor activado. No próximo acesso vai precisar do código.",
  desactivado: "Segundo factor desactivado.",
  avisos: "Preferências de aviso guardadas.",
};

export default async function Seguranca({ searchParams }) {
  const s = await exigir();
  const u = await q1(
    `SELECT email, totp_secret, totp_ativo, totp_criado_em, notificar_email, notificar_sms
       FROM utilizadores WHERE id=$1`,
    [s.id]
  );
  const emailLigado = emailConfigurado();
  const smsLigado = smsConfigurado();

  return (
    <>
      <div className="linha">
        <h1>Segurança</h1>
        <div className="acoes">
          <Link href="/conta/senha" className="btn sec">Mudar senha</Link>
          <Link href="/requisicoes" className="btn sec">Voltar</Link>
        </div>
      </div>

      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      <h2>Segundo factor (aplicação autenticadora)</h2>
      <div className="card">
        {u.totp_ativo ? (
          <>
            <p className="aviso-inline">
              <b>Activo.</b> Além da senha, é pedido um código de 6 dígitos a cada entrada.
            </p>
            <p className="mut pequeno">
              Se perder o telemóvel, peça a um administrador para repor o segundo factor — sem isso não
              consegue entrar.
            </p>
            <form action={desactivar2fa}>
              <p className="mut pequeno">Para desactivar, confirme com a senha ou com um código actual.</p>
              <label>Senha actual (opcional)</label>
              <input name="senha" type="password" autoComplete="current-password" />
              <label>Ou código actual (opcional)</label>
              <input name="codigo" inputMode="numeric" maxLength="7" placeholder="000000" />
              <Btn className="sec">Desactivar segundo factor</Btn>
            </form>
          </>
        ) : u.totp_secret ? (
          <>
            <p>
              <b>Passo 1.</b> Na sua aplicação autenticadora (Google Authenticator, Authy, 1Password…), escolha
              “adicionar conta” e introduza este segredo:
            </p>
            <p className="codigo">{u.totp_secret}</p>
            <p className="mut pequeno">
              Ou abra este endereço no telemóvel: <code>{uriOtpauth(u.totp_secret, s.nome)}</code>
            </p>
            <p>
              <b>Passo 2.</b> Escreva aqui o código de 6 dígitos que a aplicação mostra, para confirmar que
              ficou bem configurado.
            </p>
            <form action={confirmar2fa} className="inline">
              <input name="codigo" inputMode="numeric" maxLength="7" placeholder="000000" required />
              <Btn className="pri">Confirmar e activar</Btn>
            </form>
          </>
        ) : (
          <>
            <p>
              O segundo factor pede um código temporário a cada entrada. É a diferença entre alguém saber a sua
              senha e alguém conseguir entrar na sua conta.
            </p>
            <form action={iniciar2fa}>
              <Btn className="pri">Activar segundo factor</Btn>
            </form>
          </>
        )}
      </div>

      <h2>Avisos</h2>
      <div className="card">
        <p className="mut pequeno">
          Os avisos aparecem sempre na aplicação (sino <b>Avisos</b>). Pode receber também por email
          {emailLigado ? "" : " (serviço ainda não configurado)"} ou por SMS
          {smsLigado ? "" : " (serviço ainda não configurado)"}.
        </p>
        <form action={actualizarPreferenciasAvisos}>
          <label className="chek">
            <input type="checkbox" name="notificar_email" defaultChecked={u.notificar_email} disabled={!emailLigado || !u.email} />
            Email{u.email ? ` (${u.email})` : " (sem email na ficha)"}
          </label>
          <label className="chek">
            <input type="checkbox" name="notificar_sms" defaultChecked={u.notificar_sms} disabled={!smsLigado} />
            SMS
          </label>
          <Btn className="sec">Guardar preferências</Btn>
        </form>
      </div>
    </>
  );
}
