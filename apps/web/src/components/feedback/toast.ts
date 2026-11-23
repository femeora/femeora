'use client';

import { create } from 'zustand';

import { friendlyErrorMessage } from './friendlyError';

interface ToastState {
  message: string | null;
  title: string;
  tone: 'success' | 'error' | 'info';
  transactionHash: string | null;
  explorerUrl: string | null;
  show: (message: string, options?: {
    title?: string;
    tone?: 'success' | 'error' | 'info';
    transactionHash?: string;
    explorerUrl?: string;
    userFacing?: boolean;
  }) => void;
  dismiss: () => void;
}

const looksLikeError = (message: string) => /(?:failed|error|revert|reject|insufficient|unavailable|expired|required)/i.test(message);

/** Global activity result modal. Transaction results include an explorer link. */
export const useToast = create<ToastState>(set => ({
  message: null,
  title: 'Activity complete',
  tone: 'info',
  transactionHash: null,
  explorerUrl: null,
  show: (message, options = {}) => {
    const tone = options.tone ?? (looksLikeError(message) ? 'error' : 'success');
    set({
      message: tone === 'error' && !options.userFacing ? friendlyErrorMessage(message) : message,
      title: options.title ?? (tone === 'error' ? 'We could not complete that' : tone === 'success' ? 'Activity successful' : 'Notification'),
      tone,
      transactionHash: options.transactionHash ?? null,
      explorerUrl: options.explorerUrl ?? null,
    });
  },
  dismiss: () => set({ message: null, transactionHash: null, explorerUrl: null }),
}));
