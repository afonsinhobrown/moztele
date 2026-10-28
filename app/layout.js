import "./globals.css";

export const metadata = { title: "Moz Teles · Requisições", description: "Sistema de requisições" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
