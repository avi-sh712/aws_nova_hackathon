import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: "Nova Architect — Diagram to Terraform",
    description:
        "Upload architecture diagrams and let Amazon Nova AI generate production-ready Terraform code instantly.",
    icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={`${inter.variable} font-sans antialiased min-h-screen w-full`}>
                {/* Animated background orbs */}
                <div className="bg-orb bg-orb-blue" />
                <div className="bg-orb bg-orb-purple" />
                <div className="bg-orb bg-orb-pink" />

                {/* Main content */}
                <div className="relative z-10 min-h-screen w-full">{children}</div>
            </body>
        </html>
    );
}
