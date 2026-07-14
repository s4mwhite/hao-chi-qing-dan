import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const image = new URL("/og-v2.png", origin).toString();

  return {
    title: "好吃清单｜想吃的，都记下来",
    description: "记录想亲手做的美食和想去吃的饭店，让每一个馋念都有地方安放。",
    openGraph: {
      title: "好吃清单｜想吃的，都记下来",
      description: "想自己做，也想出去吃。把每一个馋念都收进清单。",
      type: "website",
      images: [{ url: image, width: 1536, height: 1024, alt: "好吃清单" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "好吃清单｜想吃的，都记下来",
      description: "想自己做，也想出去吃。把每一个馋念都收进清单。",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
