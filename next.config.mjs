/** @type {import('next').NextConfig} */
const desenvolvimento = process.env.NODE_ENV !== "production";

const nextConfig = {
  swcMinify: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
    // Em máquinas com pouca memória, compilar num único processo evita
    // duplicar o heap por cada worker. (Na Vercel o comportamento é o mesmo.)
    webpackBuildWorker: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          {
            // O Next injecta scripts e estilos inline; sem 'unsafe-inline' a
            // aplicação não hidrata. Tudo o resto fica limitado à própria origem.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Em desenvolvimento o React precisa de eval para o Fast Refresh.
              `script-src 'self' 'unsafe-inline'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
