# gymapp

筋トレの記録アプリ（PWA）。iPhone のホーム画面から使っている。

**公開URL**: https://keitaro0510.github.io/gymapp/

## 今できること

記録（種目・重量・回数・RPE・メモ）、休憩タイマー、カレンダー、履歴、種目の管理、統計、バックアップ JSON の書き出し・読み込み。

記録は Supabase（maney-app と同じプロジェクト。`gym_` のテーブル）に保存する。maney-app と同じ Google アカウントでログインする（ログインは共有）。通信できないときは端末に残し、つながったら送る。

## 作り方

Vite + TypeScript（strict）。画面は `index.html`（骨組み）・`css/app.css`・`src/`（コード）に分かれている。

```
npm install        # 部品を入れる（最初の1回）
npm run dev        # 手元で動かす（http://127.0.0.1:8766/）
npm run typecheck  # 型の検査
npm test           # テスト
npm run build      # dist/ にビルドする
```

公開は main に入ると GitHub Actions（`.github/workflows/deploy.yml`）が行う。

## これから

姉妹アプリ [maney-app](https://github.com/Keitaro0510/maney-app)（家計・予定・タスク）と、あとで連携する（カレンダーにトレーニングの日、今週の回数、ジム代の1回あたり）。方針と進める順番は [docs/PLAN.md](docs/PLAN.md)。
