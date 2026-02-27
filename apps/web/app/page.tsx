'use client';

import { useRouter } from 'next/navigation';
import { v4 } from './utils/uuid';

export default function Home() {
  const router = useRouter();

  const handleNewSession = () => {
    const id = v4();
    router.push(`/session/${id}`);
  };

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-3">Hum Studio</h1>
        <p className="text-gray-400 text-lg max-w-md">
          Hum or sing a melody into your microphone and convert it to MIDI in real time.
        </p>
      </div>

      <button
        onClick={handleNewSession}
        className="px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full text-lg transition-colors"
      >
        Start New Session
      </button>

      <div className="mt-12 text-sm text-gray-500 max-w-lg text-center">
        <p>Set a key and scale, hit record, and hum your melody.</p>
        <p className="mt-1">Edit notes on the piano roll, then export as MIDI for your DAW.</p>
      </div>
    </main>
  );
}
