import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Stampee - Messages',
    description: 'Envoyer un message sécurisé avec pièces jointes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <body>{children}</body>
        </html>
    );
}
