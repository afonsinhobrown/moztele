import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req) {
  const t = req.cookies.get("sessao")?.value;
  try {
    await jwtVerify(t, new TextEncoder().encode(process.env.AUTH_SECRET));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!login|_next|favicon.ico|uploads).*)"] };
