import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function criarSessao(u) {
  const token = await new SignJWT({ id: String(u.id), nome: u.nome, perfil: u.perfil })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(key());
  cookies().set("sessao", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function terminarSessao() {
  cookies().delete("sessao");
}

export async function sessao() {
  const t = cookies().get("sessao")?.value;
  if (!t) return null;
  try {
    return (await jwtVerify(t, key())).payload;
  } catch {
    return null;
  }
}

// Exige sessão e (opcionalmente) um dos perfis indicados.
export async function exigir(...perfis) {
  const s = await sessao();
  if (!s) redirect("/login");
  if (perfis.length && !perfis.includes(s.perfil)) redirect("/requisicoes");
  return s;
}
