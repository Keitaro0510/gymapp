// タイマーの計算（src/timer-core.ts）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, restRemaining, normalizeRestSec } from '../src/timer-core.ts';

test('時間の表示: 分:秒。1時間以上は 時:分:秒。負の値は 0', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(5_000), '0:05');
  assert.equal(formatClock(90_000), '1:30');
  assert.equal(formatClock(59_999), '0:59');
  assert.equal(formatClock(3_600_000 + 61_000), '1:01:01');
  assert.equal(formatClock(-500), '0:00');
});

test('レストの残り: 終了時刻との差。動いていなければ null、過ぎたら 0', () => {
  assert.equal(restRemaining(null, 1000), null);
  assert.equal(restRemaining(10_000, 4_000), 6_000);
  assert.equal(restRemaining(10_000, 12_000), 0);
});

test('レストの長さ: 選択肢以外は 90 秒に戻す', () => {
  assert.equal(normalizeRestSec('120'), 120);
  assert.equal(normalizeRestSec(null), 90);
  assert.equal(normalizeRestSec('abc'), 90);
  assert.equal(normalizeRestSec('45'), 90);
});
