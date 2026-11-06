# フォームの 3D アニメーションの作り方（Blender）

種目の詳細シートの「🎬 3D でフォームを見る」で出す、3D のアニメーション（GLB）を作る道具。
Blender のスクリプトで、人型・骨・IK・器具・動きを作り、`forms/<名前>.glb` に書き出す。アプリは、その GLB を three.js で再生する（`src/form3d.ts`）。

- 使う Blender: **4.5 LTS**（`winget install BlenderFoundation.Blender.LTS.4.5`）
- 設計の経緯・決めたこと: gymapp の #24

## 作る（画面なしで）

```bash
# 書き出さずに、動きの数値だけ確かめる
blender --background --factory-startup --python tools/blender/build.py -- squat --check

# forms/squat.glb に書き出す
blender --background --factory-startup --python tools/blender/build.py -- squat
```

Windows では、`"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"` を使う。

## 見ながら作る（Blender の MCP）

Claude Code に Blender の MCP（`uvx mcp-for-blender`）をつなぐと、Claude が Blender の画面を見ながら直せる。
Blender を開くと、アドオンが自動で MCP サーバー（`127.0.0.1:9876`）を開始する。画面なしでも作れるので、MCP は必須ではない。

## ファイル

| ファイル | 内容 |
|---|---|
| `rig.py` | **全種目で共通**。人型（頭・胴・腕・脚・足・手）、骨、IK（足は床に固定・手は目標に固定）、器具の部品（バーベル）、姿勢を付ける道具 |
| `build.py` | 種目を 1 つ作って、GLB に書き出す入口 |
| `exercises/<名前>.py` | **種目ごと**。器具を足して、キーフレームで動きを付ける。`build(arm)` と `report(arm)` を持つ |

## 人型と IK の約束（全種目で守る）

- 体の向き: Blender の **+Z が上、正面は -Y、体の左は +X**。身長は約 1.7m（股関節 0.95 / 膝 0.52 / 足首 0.10 / 肩 1.42）
- **足は床に置いたまま**（`ik_foot.L/R`）。手は目標（`ik_hand.L/R`）に付く。種目ごとに、位置を変えてよい。腕の IK は、肘の向きを `elbow_pole` で決める
- 動きは、**腰の位置と、腰・背中の傾きをキーフレームで決め、足と手は IK に任せる**（関節の角度を直接決めない）
- 膝の IK: 静止の姿勢で膝を少し前に曲げ、膝が前にだけ曲がる制限を付けてある（IK が逆向きの解を選ぶのを防ぐ。膝の向きを決める pole を付けると、足が目標に届かなくなる）
- IK の結果は、書き出しのときに、フレームごとに計算して入れる。**IK の操作用ボーンは、GLB に入れない**（`tests/form-models.test.mjs` が確かめる）
- ボーンの位置を数値で確かめるときは、評価後（`rig.evaluated_world`）で読む。評価前だと、IK の結果とずれる
- 器具の部品は、動かすボーンにくっつける（`rig.attach`）。バーは、背中の骨 `spine` にくっつける、など

## 種目を足すには

1. `exercises/<名前>.py` を作る（`squat.py` が手本）。`build(arm)` で、器具を足して動きを付ける。`report(arm)` で、動きの数値（足が動かない・バーの経路・深さ）を確かめられるようにする
2. `blender ... build.py -- <名前> --check` で数値を見る。Blender の画面（MCP の `look`）で、前・横・斜めと、時間の連続コマを見て、直す
3. `blender ... build.py -- <名前>` で、`forms/<名前>.glb` を作る
4. `src/form-models.ts` の `FORM_MODELS` に、種目名（アプリの種目の正式な名称）と GLB の場所を足す
5. `npm test`（`tests/form-models.test.mjs` が、GLB の形・アニメーション・大きさを確かめる）

## 注意

- GLB は、`forms/` に置く。公開のとき、**先読みはせず**、開いたときに読み込んで端末に保存する（`scripts/finalize-sw.mjs` の `LAZY`）
- 色は、`rig.py` の上の定数（シャツは、アプリの赤）。見た目を変えたら、全種目を作り直す（`build.py` に、種目の名前を並べて渡せる）
- バーベルのプレートは、アプリ側で半透明にして描く（横から見たとき、上体の角度が見えるように）
