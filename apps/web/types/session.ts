import type { QuantizedNote } from './audio';

export interface Session {
  id: string;
  userId: string | null;
  name: string;
  bpm: number;
  key: string;
  scale: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWithNotes extends Session {
  notes: QuantizedNote[];
}
