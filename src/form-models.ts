// 種目ごとの、フォームの 3D アニメーション（GLB）の対応表。
// GLB は、tools/blender/ のスクリプトで作って、forms/ に置く（作り方は tools/blender/README.md）。
// ここにない種目は、3D の表示を出さない（メモと動画のリンクだけ）。種目の名前は、アプリの種目の名前（正式な名称）と同じ

/** 種目名 → GLB の場所（index.html からの相対） */
export const FORM_MODELS: Readonly<Record<string, string>> = {
  'バーベルスクワット': 'forms/squat.glb',
};

export function formModelFor(exerciseName: string): string | null {
  return Object.hasOwn(FORM_MODELS, exerciseName) ? (FORM_MODELS[exerciseName] as string) : null;
}

/** 見る向き。camera は、人（原点。高さ 0〜1.7m）を見るカメラの位置、target は見る点。人は +Z（画面の手前）を向いて立つ */
export const FORM_VIEWS = {
  side: { label: '横', camera: [-3.7, 1.1, 0.2], target: [0, 0.82, 0.05] },
  front: { label: '正面', camera: [0.2, 1.2, 3.9], target: [0, 0.82, 0] },
  angle: { label: '斜め', camera: [-2.7, 1.4, 2.8], target: [0, 0.82, 0] },
} as const;

export type FormViewName = keyof typeof FORM_VIEWS;
