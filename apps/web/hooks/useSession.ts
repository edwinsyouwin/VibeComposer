'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/lib/store/sessionStore';

export function useSession(sessionId: string) {
  const setSessionId = useSessionStore((s) => s.setSessionId);

  useEffect(() => {
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  return {
    sessionId,
    bpm: useSessionStore((s) => s.bpm),
    key: useSessionStore((s) => s.key),
    scale: useSessionStore((s) => s.scale),
    notes: useSessionStore((s) => s.notes),
  };
}
