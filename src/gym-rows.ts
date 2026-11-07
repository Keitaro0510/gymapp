// DB の行（gym_exercises・gym_workouts・gym_sets）と、画面が使う形（種目名・記録）の変換。DOM にも通信にも触れない。
// - 行 → 画面: rowsToView
// - 画面の操作 → 変更の列（src/data.ts の Change）: 種目名を ID に直し、トレーニングを消すときは先にセットを消す（D23）
import { MAX_CHANGES_PER_OP, type Change, type Row, type Rows } from './data.ts';
import { checkNotes, normalizeVideoUrl } from './exercise-detail.ts';
import { DEFAULT_PARTS, isMuscle, type Muscle, type Parts } from './muscles.ts';
import type { SetEntry, StoredWorkout, Workout } from './types.ts';

/** 消していない種目（画面が使う形）。部位は、主1つ（なければ null）と補助（複数） */
export interface ExerciseInfo {
  id: string;
  name: string;
  primary: Muscle | null;
  secondary: Muscle[];
  /** やり方・フォーム・意識することのメモ（D25）。なければ空の文字 */
  notes: string;
  /** 解説動画の URL（D25）。なければ null */
  videoUrl: string | null;
}

export interface View {
  /** 新しい順 */
  workouts: StoredWorkout[];
  /** 消していない種目の名前（並び順） */
  exercises: string[];
  /** 消していない種目（並び順。部位つき） */
  exerciseInfos: ExerciseInfo[];
  /** 種目名 → 部位（消した種目も含む。過去の記録の部位を数えるため。同じ名前なら消していない種目が優先） */
  partsByName: Map<string, Parts>;
}

const num = (v: unknown): number => Number(v);
const byPosition = (a: Row, b: Row): number => (num(a.position) - num(b.position)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 日本時間の日（YYYY-MM-DD）。gym_workouts.date に入れる（D23） */
export function jstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 行から画面の形を作る。消した種目の名前も、過去の記録には出る */
export function rowsToView(rows: Rows): View {
  const exRows = [...(rows.gym_exercises || [])].sort(byPosition);
  const nameOf = new Map(exRows.map(r => [r.id, String(r.name)]));
  const setsOf = new Map<string, Row[]>();
  for (const s of rows.gym_sets || []) {
    const wid = String(s.workout_id);
    const list = setsOf.get(wid);
    if (list) list.push(s); else setsOf.set(wid, [s]);
  }
  const workouts = [...(rows.gym_workouts || [])]
    .sort((a, b) => (new Date(String(b.performed_at)).getTime() - new Date(String(a.performed_at)).getTime()) || byPosition(b, a))
    .map((w): StoredWorkout => ({
      id: w.id,
      date: new Date(String(w.performed_at)).toISOString(),
      durationSec: durationValue(w.duration_sec),
      sets: (setsOf.get(w.id) || []).sort(byPosition).map((s): SetEntry => ({
        ex: nameOf.get(String(s.exercise_id)) ?? '（不明な種目）',
        kg: num(s.kg),
        reps: num(s.reps),
        rpe: s.rpe === null || s.rpe === undefined ? null : num(s.rpe),
        note: String(s.note ?? ''),
      })),
    }));
  const active = exRows.filter(r => !r.deleted_at);
  const exerciseInfos = active.map((r): ExerciseInfo => ({
    id: r.id,
    name: String(r.name),
    primary: isMuscle(r.primary_muscle) ? r.primary_muscle : null,
    secondary: Array.isArray(r.secondary_muscles) ? r.secondary_muscles.filter(isMuscle) : [],
    notes: typeof r.notes === 'string' ? r.notes : '',
    videoUrl: typeof r.video_url === 'string' && r.video_url ? r.video_url : null,
  }));
  const partsByName = new Map<string, Parts>();
  for (const r of [...exRows.filter(r => r.deleted_at), ...active]) { // 消した種目を先に入れ、消していない種目で上書きする
    if (!isMuscle(r.primary_muscle)) continue;
    partsByName.set(String(r.name), {
      primary: r.primary_muscle,
      secondary: Array.isArray(r.secondary_muscles) ? r.secondary_muscles.filter(isMuscle) : [],
    });
  }
  return { workouts, exercises: exerciseInfos.map(e => e.name), exerciseInfos, partsByName };
}

// ---------- 値の確かめ（DB の制約に合うか。合わないと、送るときに操作ごと断られる） ----------

/** きつさ（RPE）。1〜10 の小数1桁。空や範囲外は null */
export function rpeValue(rpe: string | number | null | undefined): number | null {
  if (rpe === null || rpe === undefined || rpe === '') return null;
  const n = Number(rpe);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n * 10) / 10 : null;
}

/** 重量は 0〜9999.99、回数は 1〜32767 の整数。外れていたらエラー */
export function assertSet(s: SetEntry): void {
  if (!Number.isFinite(s.kg) || s.kg < 0 || s.kg > 9999.99) throw new Error(`重量が範囲外です（${s.ex}: ${s.kg}kg）`);
  if (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > 32767) throw new Error(`回数が範囲外です（${s.ex}: ${s.reps}回）`);
}

// ---------- 種目の名前 → ID ----------

/**
 * 名前から種目の ID を探す。
 * - 消していない種目がなければ、消した種目を使う（過去の記録とつながったままにする）
 * - どちらもなければ作る。記録にだけ出る種目は「消した種目」として作る（deleted_at 付き。一覧には出ない）
 * - active を true にすると、消した種目は戻し（deleted_at を空にする）、なければ消していない種目として作る
 * 必要になった行の変更は changes に溜まる（種目の変更は、記録より先に送る）
 */
function exerciseBook(rows: Rows, newId: () => string, now: string) {
  const ids = new Map<string, string>();
  const deleted = new Set<string>();
  for (const r of rows.gym_exercises || []) {
    const name = String(r.name);
    if (!ids.has(name) || !r.deleted_at) ids.set(name, r.id);
    if (r.deleted_at) deleted.add(r.id);
  }
  let position = nextPosition(rows.gym_exercises);
  const changes: Change[] = [];
  return {
    changes,
    idFor(name: string, active = false): string {
      const known = ids.get(name);
      if (known) {
        if (active && deleted.has(known)) {
          deleted.delete(known);
          changes.push({ table: 'gym_exercises', action: 'update', id: known, row: { deleted_at: null, position: position++ } });
        }
        return known;
      }
      const id = newId();
      ids.set(name, id);
      changes.push({ table: 'gym_exercises', action: 'insert', id, row: { name, position: position++, deleted_at: active ? null : now } });
      return id;
    },
  };
}

function nextPosition(list: Row[] | undefined): number {
  return Math.max(-1, ...(list || []).map(r => num(r.position))) + 1;
}

// ---------- 画面の操作 → 変更の列 ----------

/** 所要時間（秒）として使える値なら整数で返す。0〜86400（DB の check と同じ）以外・数でないものは null（未計測） */
export function durationValue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 86400 ? Math.round(n) : null;
}

/** 今日の記録を保存する（トレーニング1回とそのセット）。durationSec は所要時間（秒。測っていなければ null） */
export function saveWorkoutChanges(rows: Rows, sets: SetEntry[], at: Date, newId: () => string, durationSec: number | null = null): Change[] {
  sets.forEach(assertSet);
  const res = exerciseBook(rows, newId, at.toISOString());
  const exIds = sets.map(s => res.idFor(s.ex));
  const workoutId = newId();
  const duration = durationValue(durationSec);
  return [
    ...res.changes,
    { table: 'gym_workouts', action: 'insert', id: workoutId, row: { performed_at: at.toISOString(), date: jstDate(at), note: '', position: nextPosition(rows.gym_workouts), ...(duration === null ? {} : { duration_sec: duration }) } },
    ...sets.map((s, i): Change => ({
      table: 'gym_sets', action: 'insert', id: newId(),
      row: { workout_id: workoutId, exercise_id: exIds[i], kg: s.kg, reps: s.reps, rpe: rpeValue(s.rpe), note: s.note, position: i },
    })),
  ];
}

/** トレーニングを消す。先にセットを消す（D23: on delete cascade にしていない） */
export function deleteWorkoutChanges(rows: Rows, workoutId: string): Change[] {
  const sets = (rows.gym_sets || []).filter(s => s.workout_id === workoutId);
  return [
    ...sets.map((s): Change => ({ table: 'gym_sets', action: 'delete', id: s.id })),
    { table: 'gym_workouts', action: 'delete', id: workoutId },
  ];
}

const activeExercises = (rows: Rows): Row[] => (rows.gym_exercises || []).filter(r => !r.deleted_at).sort(byPosition);

/** 種目を足す。同じ名前の「消した種目」があれば、それを戻す（過去の記録とつながったままにする） */
export function addExerciseChanges(rows: Rows, name: string, newId: () => string): Change[] {
  const res = exerciseBook(rows, newId, '');
  res.idFor(name, true);
  // 標準の割り当てがある名前（src/muscles.ts）なら、新しい種目に部位を最初から入れる（消した種目を戻すときは、前の部位のまま）
  const parts = DEFAULT_PARTS[name];
  return res.changes.map(c => (c.action === 'insert' && parts
    ? { ...c, row: { ...c.row, primary_muscle: parts.primary, secondary_muscles: parts.secondary } }
    : c));
}

/** 種目の部位を設定する。主は1つ（なしも可）、補助は複数。主の部位は補助に入れない（DB も見張っている） */
export function setMusclesChanges(rows: Rows, exerciseId: string, primary: Muscle | null, secondary: Muscle[]): Change[] {
  if (!(rows.gym_exercises || []).some(r => r.id === exerciseId)) throw new Error('その種目が見つかりません');
  if (primary !== null && !isMuscle(primary)) throw new Error(`知らない部位です: ${primary}`);
  const bad = secondary.find(m => !isMuscle(m));
  if (bad) throw new Error(`知らない部位です: ${bad}`);
  if (primary !== null && secondary.includes(primary)) throw new Error('主の部位を、補助にも入れることはできません');
  return [{ table: 'gym_exercises', action: 'update', id: exerciseId, row: { primary_muscle: primary, secondary_muscles: [...new Set(secondary)] } }];
}

/** 種目のメモと動画のリンクを設定する（D25）。リンクは空なら未設定。http(s) 以外・長すぎるものはエラー */
export function setDetailChanges(rows: Rows, exerciseId: string, notes: string, videoUrl: string): Change[] {
  if (!(rows.gym_exercises || []).some(r => r.id === exerciseId)) throw new Error('その種目が見つかりません');
  return [{ table: 'gym_exercises', action: 'update', id: exerciseId, row: { notes: checkNotes(notes), video_url: normalizeVideoUrl(videoUrl) } }];
}

/** 種目を消す（deleted_at を入れる。過去の記録は種目名を出し続ける） */
export function deleteExerciseChanges(rows: Rows, name: string, now: string): Change[] {
  const r = activeExercises(rows).find(x => x.name === name);
  return r ? [{ table: 'gym_exercises', action: 'update', id: r.id, row: { deleted_at: now } }] : [];
}

/** 種目を1つ上げる・下げる。並びが変わった行の position を、0 からの連番に付け直す */
export function moveExerciseChanges(rows: Rows, name: string, dir: number): Change[] {
  const list = activeExercises(rows);
  const i = list.findIndex(r => r.name === name);
  const j = i + dir;
  const a = list[i], b = list[j];
  if (!a || !b) return [];
  const order = [...list];
  order[i] = b;
  order[j] = a;
  return order.flatMap((r, p): Change[] => (num(r.position) === p ? [] : [{ table: 'gym_exercises', action: 'update', id: r.id, row: { position: p } }]));
}

// ---------- バックアップ・端末の古い記録の取り込み ----------

/** 同じ記録かどうかの判定（日時とセットの中身が同じ）。DB を通ると rpe が文字から数値になるので、数値にそろえてから比べる */
export function workoutKey(w: Workout): string {
  return `${new Date(w.date).getTime()}|${JSON.stringify(w.sets.map(s => [s.ex, Number(s.kg), Number(s.reps), rpeValue(s.rpe), s.note ?? '']))}`;
}

/** 取り込む記録のうち、まだない（同じ記録でない）ものだけを返す */
export function newWorkouts(existing: Workout[], incoming: Workout[]): Workout[] {
  const keys = new Set(existing.map(workoutKey));
  const out: Workout[] = [];
  for (const w of incoming) {
    const k = workoutKey(w);
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(w);
  }
  return out;
}

/**
 * 取り込みの変更の列。1回の操作の上限（500件）に収まるように、複数の操作に分ける。
 * 先に種目の操作（なければ作る）。そのあと、トレーニング1回とそのセットを、まとめて1つの操作に入れていく。
 * exercises の種目は、消していない種目として足す（消した種目は戻す）。記録にだけ出る種目は、消した種目として作る
 */
export function importChanges(
  rows: Rows, workouts: Workout[], exercises: string[] | null, at: Date, newId: () => string,
): Change[][] {
  workouts.forEach(w => w.sets.forEach(assertSet));
  const res = exerciseBook(rows, newId, at.toISOString());
  for (const name of exercises ?? []) res.idFor(name, true);

  const wPosition = nextPosition(rows.gym_workouts);
  const groups = workouts.map((w, wi): Change[] => {
    const workoutId = newId();
    const when = new Date(w.date);
    const duration = durationValue(w.durationSec);
    return [
      { table: 'gym_workouts', action: 'insert', id: workoutId, row: { performed_at: when.toISOString(), date: jstDate(when), note: '', position: wPosition + wi, ...(duration === null ? {} : { duration_sec: duration }) } },
      ...w.sets.map((s, i): Change => ({
        table: 'gym_sets', action: 'insert', id: newId(),
        row: { workout_id: workoutId, exercise_id: res.idFor(s.ex), kg: Number(s.kg), reps: Number(s.reps), rpe: rpeValue(s.rpe), note: s.note ?? '', position: i },
      })),
    ];
  });

  const ops: Change[][] = [];
  for (let i = 0; i < res.changes.length; i += MAX_CHANGES_PER_OP) ops.push(res.changes.slice(i, i + MAX_CHANGES_PER_OP));
  let cur: Change[] = [];
  for (const group of groups) {
    if (group.length > MAX_CHANGES_PER_OP) throw new Error(`1回のトレーニングのセットが多すぎます（${group.length - 1}セット）`);
    if (cur.length + group.length > MAX_CHANGES_PER_OP) { ops.push(cur); cur = []; }
    cur.push(...group);
  }
  if (cur.length) ops.push(cur);
  return ops;
}
