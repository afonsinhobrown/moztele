import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q1 } from "@/lib/db";

const DURACAO = "7d";
const COOKIE = "sessao";
const COOKIE_PENDENTE = "sessao_pendente";

function chave() {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 24)
    throw new Error(
      "AUTH_SECRET em falta ou demasiado curto (mínimo 24 caracteres). Defina-o no .env.local e na Vercel."
    );
  return new TextEncoder().encode(segredo);
}

// A sessão leva a versão (para poder ser cortada) e se o utilizador tem de mudar a senha.
export async function criarSessao(u) {
  const token = await new SignJWT({
    id: String(u.id),
    nome: u.nome,
    perfil: u.perfil,
    v: Number(u.sessao_versao || 0),
    mudar: Boolean(u.deve_mudar_senha),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(DURACAO)
    .sign(chave());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}

export function terminarSessao() {
  cookies().delete(COOKIE);
}

// Entre a senha certa e o código do segundo factor ainda não há sessão:
// fica só um bilhete curto (10 min) com quem está a entrar.
export async function criarSessaoPendente(u) {
  const token = await new SignJWT({ id: String(u.id), telefone: u.telefone || null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(chave());
  cookies().set(COOKIE_PENDENTE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function sessaoPendente() {
  const t = cookies().get(COOKIE_PENDENTE)?.value;
  if (!t) return null;
  try {
    return (await jwtVerify(t, chave())).payload;
  } catch {
    return null;
  }
}

export function terminarSessaoPendente() {
  cookies().delete(COOKIE_PENDENTE);
}

export async function tokenSessao() {
  return cookies().get(COOKIE)?.value || null;
}

// Verificação barata: só a assinatura do JWT.
export async function sessao() {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    return (await jwtVerify(t, chave())).payload;
  } catch {
    return null;
  }
}

// Verificação completa: assinatura + utilizador activo + versão da sessão.
// É esta que os ecrãs e as rotas de API devem usar.
export async function sessaoActiva() {
  const p = await sessao();
  if (!p) return null;
  const u = await q1(
    `SELECT u.id, u.nome, u.activo, u.deve_mudar_senha, u.sessao_versao, u.area_id, p.nome AS perfil
       FROM utilizadores u JOIN perfis p ON p.id = u.perfil_id
      WHERE u.id = $1`,
    [p.id]
  );
  if (!u || !u.activo) return null;
  if (Number(u.sessao_versao) !== Number(p.v || 0)) return null;
  return {
    id: String(u.id),
    nome: u.nome,
    perfil: u.perfil,
    area_id: u.area_id ? Number(u.area_id) : null,
    deve_mudar_senha: Boolean(u.deve_mudar_senha),
    sessao_versao: Number(u.sessao_versao),
  };
}

// Exige sessão e (opcionalmente) um dos perfis indicados.
export async function exigir(...perfis) {
  const s = await sessaoActiva();
  if (!s) redirect("/login");
  if (s.deve_mudar_senha) redirect("/conta/senha");
  if (perfis.length && !perfis.includes(s.perfil)) redirect("/requisicoes");
  return s;
}

// Para o ecrã de mudança de senha: não redirecciona em ciclo.
export async function exigirSessao() {
  const s = await sessaoActiva();
  if (!s) redirect("/login");
  return s;
}
