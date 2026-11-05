# gymapp の方針: DB に載せて、maney-app とつなぐ

2026-11-05 に決めた。今の gymapp は 1 ファイルの PWA（`index.html` 864 行）で、記録は端末の `localStorage` にしか入っていない。端末のデータが消えたら終わりで、複数の端末では使えない。

## 目的

1. 記録をクラウドの関係データベース（Supabase / PostgreSQL）に置き、端末が変わっても、消えても大丈夫にする
2. 姉妹アプリ maney-app（家計・予定・タスク）と同じ DB に置き、あとで連携できるようにする（カレンダーにトレーニングの日を出す、ジム代を1回あたりにする、タスクと合体する、など）

## 決めたこと（2026-11-05）

1. **DB は maney-app と同じ Supabase プロジェクトにする。テーブル名は `gym_` で始める**。ログインが1つで済み、タスクやお金と結合できる
2. **マイグレーションは maney-app の `supabase/migrations/` に置く**。同じプロジェクトを触る入口を1か所にして、履歴とテストを1か所に揃える（この gymapp には置かない）
3. **gymapp は maney-app と同じ土台に移す**（Vite・TypeScript（strict）・テスト・GitHub Actions）。1ファイルのまま DB をつなぐと、あとで直しにくい
4. **作り直し構想だった training-log リポジトリは削除した**（Next.js・FastAPI・Cloud Run の別構成。この方針とは別の道になるため）。次の「将来の構想」だけ引き継ぐ

## 今のデータの形（`index.html` から）

- 記録: `{ date: ISO時刻, sets: [{ ex: "ベンチプレス", kg, reps, rpe, note }] }`（`localStorage` の `gw`）
- 種目: 名前の文字列の配列（`gw_ex`）。ID はなく、記録は名前で種目を指す。消した種目も、過去の記録には名前が残る
- バックアップ JSON: `{ app: "gym-tracker-backup", version: 1, exportedAt, workouts, exercises }`
- 重複の判定: `date + sets` の文字列が同じなら同じ記録（取り込みのとき）
- タイマー（休憩）は画面の中だけで完結している（DB は要らない）

## テーブルの案（たたき台。maney-app の DECISIONS.md に D23 として決める）

どのテーブルも maney-app と同じ作法: `id`（uuid）・`user_id`（`auth.users` を指す）・`created_at`・`updated_at`、本人の行だけ読み書きできる（RLS）、一覧には `position`、消すときは `deleted_at`。

```
gym_exercises  (id, name, position, deleted_at)
gym_workouts   (id, performed_at timestamptz, date date, note)
gym_sets       (id, workout_id → gym_workouts, exercise_id → gym_exercises,
                position, kg numeric, reps smallint, rpe numeric 空でもよい, note)
```

- `date` は端末の日付（日本時間）の日。カレンダーや連携で日付を使うため、`performed_at` とは別に持つ
- 種目の名前は ID に直す。履歴にだけ残っている消した種目は、`deleted_at` 付きの行として作る
- 筋トレの回数・重量の下限（`kg >= 0`・`reps > 0`）は DB が見張る

## 進める順番

### Phase 1: DB を作る（maney-app リポジトリ）

- [ ] D23（gym のテーブルの設計）を maney-app の `docs/DECISIONS.md` に書く
- [ ] マイグレーション（`gym_exercises`・`gym_workouts`・`gym_sets`）と RLS のテストを書く
- [ ] ローカルの Supabase で通してから、本番に適用する（`docs/db/LOCAL.md`。新しいテーブルを足すだけなので、既存のデータには触れない）
- [ ] `docs/db/SCHEMA.md` に追記する

### Phase 2: gymapp を新しい土台に移す（このリポジトリ）

- [ ] Vite・TypeScript（strict）・テスト・CI を入れる。maney-app の `package.json`・`tsconfig`・`.github/workflows/` を手本にする
- [ ] 今の画面（記録・タイマー・カレンダー・履歴・種目・統計）を、見た目と動きを変えずに `src/` へ移す。`localStorage` のまま
- [ ] 公開の手順（GitHub Pages）を新しい土台に合わせる。URL は今のまま（`/gymapp/`）。**新しい版が確かめられるまで、今の版を公開し続ける**

### Phase 3: DB につなぐ

- [ ] Google ログイン（maney-app と同じ。ログイン状態を共有できるかも調べる）
- [ ] 保存と読み込み: `localStorage` を端末の写しにして、Supabase を正にする（オフラインでも記録でき、つながったら送る。maney-app の `src/sync.ts` を手本にする）
- [ ] バックアップ JSON の取り込み（名前 → ID の変換、重複の判定）。1回だけ、今のデータを移す
- [ ] 乗り換える前に JSON を書き出して保管し、取り込み後に件数と合計ボリュームが合うか確かめる

### Phase 4: maney-app とつなぐ（読むだけから）

- [ ] maney-app のカレンダーに「トレーニングした日」を出す
- [ ] maney-app のホームに「今週のトレーニング回数」を出す
- [ ] ジム代（毎月のお金）÷ 回数で「1回あたり」を出す
- [ ] そのあとで、タスクとの合体を決める（「週3回に届いていなければタスクを出す」など。maney-app の ROADMAP の Phase 6 と一緒に考える）

## 将来の構想（training-log から引き継ぐ）

- 種目に部位（胸・背中・脚…）を持たせ、部位ごとの週間ボリュームを出す
- 推定 1RM（Epley の式 = 重量 ×（1 + 回数 / 30））と、伸び悩み（停滞）の検知
- 過去の記録を見て、次のメニューを提案する AI コーチ
- ジムに通う友人にも使ってもらう（DB は RLS で1人ずつ分かれているので、土台はある）

## 決めてあることの確認（変えるときは、ユーザーに相談する）

- 重量の小数（2.5kg など）を扱う。`kg` は数値型
- タイマーは今のまま画面の中だけ
