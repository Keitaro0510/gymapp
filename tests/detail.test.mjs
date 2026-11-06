// 種目の詳細（src/exercise-detail.ts と、src/gym-rows.ts のメモ・動画のリンク）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVideoUrl, isSafeLink, checkNotes, youtubeSearchUrl, NOTES_MAX, VIDEO_URL_MAX } from '../src/exercise-detail.ts';
import { rowsToView, setDetailChanges } from '../src/gym-rows.ts';
import { checkChanges } from '../src/data.ts';

test('動画のリンク: 空は未設定。https:// がなければ補う。前後の空白は取る', () => {
  assert.equal(normalizeVideoUrl(''), null);
  assert.equal(normalizeVideoUrl('   '), null);
  assert.equal(normalizeVideoUrl('https://www.youtube.com/watch?v=abc'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(normalizeVideoUrl('  http://example.com/a  '), 'http://example.com/a');
  assert.equal(normalizeVideoUrl('youtu.be/abc123'), 'https://youtu.be/abc123');
  assert.equal(normalizeVideoUrl('HTTPS://EXAMPLE.COM/X'), 'HTTPS://EXAMPLE.COM/X');
});

test('動画のリンク: http(s) 以外・空白を含む・長すぎるものは断る', () => {
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://example.com/a', 'vbscript:x', 'https://example.com/a b', 'https://']) {
    assert.throws(() => normalizeVideoUrl(bad), /動画のリンク/, bad);
  }
  assert.throws(() => normalizeVideoUrl(`https://example.com/${'a'.repeat(VIDEO_URL_MAX)}`), /長すぎ/);
  assert.doesNotThrow(() => normalizeVideoUrl(`https://example.com/${'a'.repeat(VIDEO_URL_MAX - 20)}`));
});

test('画面で開いてよいリンクか', () => {
  assert.equal(isSafeLink('https://youtu.be/a'), true);
  assert.equal(isSafeLink('http://example.com'), true);
  assert.equal(isSafeLink('javascript:alert(1)'), false);
  assert.equal(isSafeLink(''), false);
  assert.equal(isSafeLink(null), false);
  assert.equal(isSafeLink(undefined), false);
});

test('メモの上限', () => {
  assert.equal(checkNotes('肩甲骨を寄せる'), '肩甲骨を寄せる');
  assert.doesNotThrow(() => checkNotes('あ'.repeat(NOTES_MAX)));
  assert.throws(() => checkNotes('あ'.repeat(NOTES_MAX + 1)), /長すぎ/);
});

test('YouTube の検索リンク: 「種目名 やり方」を、日本語のままエンコードして渡す', () => {
  const u = youtubeSearchUrl('ダンベルサイドレイズ');
  assert.ok(u.startsWith('https://www.youtube.com/results?search_query='));
  assert.equal(decodeURIComponent(u.split('search_query=')[1]), 'ダンベルサイドレイズ やり方');
  assert.ok(!/\s/.test(u), '空白が残らない');
  assert.equal(decodeURIComponent(youtubeSearchUrl('A&B 種目').split('search_query=')[1]), 'A&B 種目 やり方', '記号も壊れない');
});

const rows = () => ({
  gym_exercises: [
    { id: 'e1', name: 'ベンチ', position: 0, deleted_at: null, primary_muscle: 'chest', secondary_muscles: [], notes: '肩甲骨を寄せる\n足で踏む', video_url: 'https://youtu.be/abc' },
    { id: 'e2', name: 'スクワット', position: 1, deleted_at: null, primary_muscle: null, secondary_muscles: [] }, // 古い行（列がない）
  ],
  gym_workouts: [], gym_sets: [],
});

test('行から、メモと動画のリンクを読む。列がない古い行は、メモなし・リンクなし', () => {
  const v = rowsToView(rows()).exerciseInfos;
  assert.equal(v[0].notes, '肩甲骨を寄せる\n足で踏む');
  assert.equal(v[0].videoUrl, 'https://youtu.be/abc');
  assert.equal(v[1].notes, '');
  assert.equal(v[1].videoUrl, null);
});

test('メモとリンクを設定する変更: リンクは整えて、空なら null。不正なものは、変更を作らず断る', () => {
  const ch = setDetailChanges(rows(), 'e2', '膝をつま先と同じ向きに', ' youtu.be/xyz ');
  assert.deepEqual(ch, [{ table: 'gym_exercises', action: 'update', id: 'e2', row: { notes: '膝をつま先と同じ向きに', video_url: 'https://youtu.be/xyz' } }]);
  assert.equal(checkChanges(ch).length, 1);
  assert.equal(setDetailChanges(rows(), 'e1', '', '')[0].row.video_url, null, 'リンクを消せる');
  assert.equal(setDetailChanges(rows(), 'e1', '', '')[0].row.notes, '', 'メモを消せる');
  assert.throws(() => setDetailChanges(rows(), 'e1', 'x', 'javascript:alert(1)'), /動画のリンク/);
  assert.throws(() => setDetailChanges(rows(), 'e1', 'あ'.repeat(5001), ''), /長すぎ/);
  assert.throws(() => setDetailChanges(rows(), 'ない', 'x', ''), /見つかりません/);
});
