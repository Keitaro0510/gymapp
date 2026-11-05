# gymapp

筋トレの記録アプリ（PWA）。iPhone のホーム画面から使っている。

**公開URL**: https://keitaro0510.github.io/gymapp/

## 今できること

記録（種目・重量・回数・RPE・メモ）、休憩タイマー、カレンダー、履歴、種目の管理、統計、バックアップ JSON の書き出し・読み込み。

## これから

今は端末の `localStorage` にしか記録がないので、関係データベース（Supabase）に載せる。姉妹アプリ [maney-app](https://github.com/Keitaro0510/maney-app)（家計・予定・タスク）と同じ DB を使い、あとで連携する。方針と進める順番は [docs/PLAN.md](docs/PLAN.md)。
