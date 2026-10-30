import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLICOS = new Set(["/", "/login", "/api/saude", "/icon.svg"]);
const ESTATICOS = [/^\/_next\//, /^\/favicon\.ico$/, /^\/uploads\//];

const chave = () => {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 24) return null;
  return new TextEncoder().encode(segredo);
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLICOS.has(pathname) || ESTATICOS.some((r) => r.test(pathname))) return NextResponse.next();

  const k = chave();
  const token = req.cookies.get("sessao")?.value;
  let payload = null;
  if (k && token) {
    try {
      payload = (await jwtVerify(token, k)).payload;
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    // Nas rotas de API devolve 401 (em vez de HTML de login).
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ erro: "Precisa de entrar." }, { status: 401 });
    const login = new URL("/login", req.url);
    login.searchParams.set("de", pathname);
    return NextResponse.redirect(login);
  }
  if (payload.mudar && pathname !== "/conta/senha") {
    return NextResponse.redirect(new URL("/conta/senha", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
