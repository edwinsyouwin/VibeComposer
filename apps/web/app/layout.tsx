import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hum Studio — Hum to MIDI',
  description: 'Hum or sing melodies and convert them to MIDI in real time',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
