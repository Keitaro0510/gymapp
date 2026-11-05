// 接続先。maney-app と同じ Supabase プロジェクト（本番）につなぐ（D23）。
// sb_publishable_… はブラウザ用の公開キーで、秘密ではない（maney-app の vite.config.mjs と同じ値）
export const ENV = Object.freeze({
  supaUrl: 'https://sgvyjolyfuqchugltvls.supabase.co',
  supaKey: 'sb_publishable_xQszLlsL0IVxrnxsHK0ZtA_AHqsaDMu',
  /**
   * ログインの状態を保存するキー。maney-app と同じにして、ログインを共有する。
   * 2つのアプリは同じ origin（keitaro0510.github.io）なので、localStorage が共通になる
   */
  authStorageKey: 'money-app-auth',
  /** 端末に保存するサーバーの写し・送信待ちのキーの頭（maney-app の maney:prod: とは別） */
  storagePrefix: 'gym:',
});
