import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'WEIGHTLOOP — сбрось вес в Telegram за 30 дней',
  description: 'Фото еды + ежедневный чек-ин + accountability',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        {/* Telegram WebApp SDK — нужен до любого обращения к window.Telegram */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
