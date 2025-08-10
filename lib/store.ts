"use client";

import { create } from "zustand";
import { Granularity, Mode, ParticipantInput, computeShares } from "./calc";

// 追加行のID生成はクライアント操作時のみ実行される
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AppState {
  participants: ParticipantInput[];
  total: number;
  granularity: Granularity;
  mode: Mode;

  setTotal: (v: number) => void;
  setGranularity: (g: Granularity) => void;
  setMode: (m: Mode) => void;

  addParticipant: () => void;
  removeParticipant: (id: string) => void;
  updateParticipant: (
    id: string,
    updates: Partial<Omit<ParticipantInput, "id">>
  ) => void;

  getComputed: () => ReturnType<typeof computeShares>;
}

// SSR/CSRで同一になるよう固定IDを採用
const initialParticipants: ParticipantInput[] = [
  { id: "p1", name: "田中さん", role: "junior", age: 25 },
  { id: "p2", name: "佐藤さん", role: "mid", age: 34 },
  { id: "p3", name: "鈴木さん", role: "manager", age: 45 },
];

export const useAppStore = create<AppState>((set, get) => ({
  participants: initialParticipants,
  total: 12000,
  granularity: 100,
  mode: "nearest",

  setTotal: (v) => set({ total: Math.max(0, Math.round(v)) }),
  setGranularity: (g) => set({ granularity: g }),
  setMode: (m) => set({ mode: m }),

  addParticipant: () =>
    set((s) => ({
      participants: [
        ...s.participants,
        { id: generateId(), name: "", role: "mid", age: 30 },
      ],
    })),

  removeParticipant: (id) =>
    set((s) => ({ participants: s.participants.filter((p) => p.id !== id) })),

  updateParticipant: (id, updates) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  getComputed: () => {
    const { participants, total, granularity, mode } = get();
    return computeShares(participants, total, granularity, mode);
  },
}));


