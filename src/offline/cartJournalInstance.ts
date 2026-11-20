import { CartJournalClient, type JournalStorage } from './cartJournal';
import { api } from '../api/client';

let instance: CartJournalClient | null = null;

function createFallbackStorage(): JournalStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    }
  };
}

export function getCartJournal(): CartJournalClient {
  if (!instance) {
    const storage: JournalStorage =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : createFallbackStorage();

    instance = new CartJournalClient({
      storage,
      send: (payload, options) => api.sendCartJournalEvents(payload, options.keepalive)
    });
    instance.start();
  }
  return instance;
}
