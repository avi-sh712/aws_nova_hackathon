import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                nova: {
                    blue: "#1A73E8",
                    "blue-light": "#4DA3FF",
                    "blue-dark": "#0D47A1",
                    pink: "#E91E8C",
                    "pink-light": "#FF6EB4",
                    "pink-dark": "#AD1457",
                    purple: "#7B2FF7",
                    "purple-light": "#A855F7",
                    "purple-dark": "#5B21B6",
                    black: "#0A0A0F",
                    "dark-surface": "#12121A",
                    "dark-card": "#1A1A2E",
                    white: "#FFFFFF",
                    "gray-100": "#F3F4F6",
                    "gray-400": "#9CA3AF",
                    "gray-600": "#4B5563",
                },
            },
            backgroundImage: {
                "nova-gradient": "linear-gradient(135deg, #1A73E8, #7B2FF7, #E91E8C)",
                "nova-gradient-subtle":
                    "linear-gradient(135deg, rgba(26,115,232,0.15), rgba(123,47,247,0.15), rgba(233,30,140,0.15))",
                "nova-glow":
                    "radial-gradient(ellipse at center, rgba(123,47,247,0.2) 0%, transparent 70%)",
            },
            boxShadow: {
                "nova-blue": "0 0 20px rgba(26, 115, 232, 0.3)",
                "nova-purple": "0 0 20px rgba(123, 47, 247, 0.3)",
                "nova-pink": "0 0 20px rgba(233, 30, 140, 0.3)",
                "nova-glow":
                    "0 0 40px rgba(123, 47, 247, 0.15), 0 0 80px rgba(26, 115, 232, 0.1)",
            },
            animation: {
                "gradient-shift": "gradient-shift 8s ease infinite",
                "pulse-glow": "pulse-glow 3s ease-in-out infinite",
                "border-spin": "border-spin 4s linear infinite",
                "fade-in": "fade-in 0.5s ease-out",
                "slide-up": "slide-up 0.5s ease-out",
            },
            keyframes: {
                "gradient-shift": {
                    "0%, 100%": { backgroundPosition: "0% 50%" },
                    "50%": { backgroundPosition: "100% 50%" },
                },
                "pulse-glow": {
                    "0%, 100%": { opacity: "0.4" },
                    "50%": { opacity: "1" },
                },
                "border-spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                },
                "fade-in": {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                "slide-up": {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
