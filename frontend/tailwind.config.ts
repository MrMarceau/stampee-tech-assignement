import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                ink: '#0f172a',
                mist: '#f8fafc',
                accent: '#0ea5e9',
                accentMuted: '#38bdf8',
            },
        },
    },
    plugins: [],
};

export default config;
