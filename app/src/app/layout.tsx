import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { SwRegistro } from "@/components/pwa/sw-registro";
import { DestravarAudio } from "@/components/providers/destravar-audio";
import { TemaScript } from "@/components/providers/tema-script";
import { APP } from "@/features/comum/copy";
import "./globals.css";

// UI / display. Fonte variável com eixo wdth (75-100): usado no rótulo micro
// do cartão de conta. Licença SIL OFL 1.1.
const fonteUi = Instrument_Sans({
  variable: "--fonte-ui",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
});

// Valor monetário, data, parcela. Só os pesos que o sistema usa. SIL OFL 1.1.
const fonteMono = IBM_Plex_Mono({
  variable: "--fonte-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/**
 * P-1 do handoff do Vitrine: liga ao <head> os assets que ele entregou.
 * Caminhos da seção 4.1; os pesos foram medidos por ele e estão no orçamento.
 */
export const metadata: Metadata = {
  title: APP.nome,
  description: APP.descricao,
  applicationName: APP.nome,
  manifest: "/manifest.webmanifest",
  // Dá URL absoluta ao og:image mesmo em local/preview.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  icons: {
    // O favicon.svg vem primeiro: ele troca de cor sozinho no escuro
    // (@media dentro do próprio SVG). O .ico é fallback e tem fundo próprio.
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: APP.nome,
    title: APP.nome,
    description: APP.descricao,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        // WCAG 1.1.1: imagem informativa exige alternativa textual.
        alt: `${APP.nome} — ${APP.descricao}`,
      },
    ],
  },
  appleWebApp: {
    capable: true,
    // Cabe sob o ícone na tela inicial do iOS.
    title: "Finanças",
    statusBarStyle: "default",
  },
};

/**
 * theme-color por tema: pinta a barra do navegador no celular.
 * Valores = --background de cada modo (handoff, seções 2.1 e 4.2).
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F7" },
    { media: "(prefers-color-scheme: dark)", color: "#101417" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fonteUi.variable} ${fonteMono.variable} h-full antialiased`}
      // Obrigatório (P-3): o TemaScript escreve classList e dataset no <html>
      // antes da hidratação, de propósito. Sem isto o React acusa divergência
      // entre o HTML do servidor e o DOM já ajustado no cliente. NÃO é máscara
      // de fronteira errada — é exatamente o atributo que o script muda.
      suppressHydrationWarning
    >
      <head>
        <TemaScript />
      </head>
      <body className="min-h-full flex flex-col">
        <SwRegistro />
        <DestravarAudio />
        {children}
      </body>
    </html>
  );
}
