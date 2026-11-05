// Supabase のクライアントを作る。接続先は src/env.ts。
// モジュールを読んだだけでは作らない（Node のテストが、ここを import する別のモジュールを読めるように）。src/main.ts が1回呼ぶ
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ENV } from './env.ts';

let client: SupabaseClient | null = null;

export function getSupa(): SupabaseClient {
  if (!client) throw new Error('Supabase のクライアントを、作る前に使いました（src/main.ts の createSupa より前）');
  return client;
}

export function createSupa(env: typeof ENV): SupabaseClient {
  client = createClient(env.supaUrl, env.supaKey, {
    auth: {
      persistSession: true,
      storageKey: env.authStorageKey,
      storage: window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
