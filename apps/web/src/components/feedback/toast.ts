'use client';

import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  dismiss: () => void;
}

const VISIBLE_MS = 4000;
let timer: ReturnType<typeof setTimeout> | undefined;

/** One toast at a time, auto-dismissed after 4s (ui-ux: toast-dismiss). */
export const useToast = create<ToastState>(set => ({
  message: null,
  show: message => {
    clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), VISIBLE_MS);
  },
  dismiss: () => {
    clearTimeout(timer);
    set({ message: null });
  },
}));
