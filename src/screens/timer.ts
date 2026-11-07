// 記録画面のタイマー: トレーニング全体の経過時間と、セット間のレスト（カウントダウン）
// どちらも「開始した時刻」を持ち、表示のたびに今との差を出す（画面を閉じていても、戻ったときにズレない）
import { byId } from '../ui.ts';
import { formatClock, normalizeRestSec, restRemaining } from '../timer-core.ts';

const REST_KEY = 'gw_rest_sec';

let sessionStart: number | null = null; // 最初のセットを追加した時刻
let restEnd: number | null = null; // レストが終わる時刻（動いていないときは null）
let restFinished = false; // 終わりを知らせたあと、押されるまで赤く点滅させる
let restSec = loadRestSec();
let ticker: number | null = null;
let audio: AudioContext | null = null;

function loadRestSec(): number {
  try { return normalizeRestSec(localStorage.getItem(REST_KEY)); } catch { return normalizeRestSec(null); }
}

/** タップの中で呼ぶ。iPhone は、タップのときに音を有効にしておかないと、あとで鳴らせない */
function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* 音が使えない環境では、振動と画面だけで知らせる */ }
}

/** レストが終わった合図: 音・振動（iPhone の Safari は振動に対応していない）・画面の点滅 */
function notifyRestDone(): void {
  try { navigator.vibrate?.([300, 120, 300, 120, 300]); } catch { /* 非対応 */ }
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      osc.connect(gain).connect(audio.destination);
      const start = t0 + i * 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  } catch { /* 鳴らせなくても、画面で分かる */ }
}

function tick(): void {
  const now = Date.now();
  byId('timer-elapsed').textContent = sessionStart === null ? '0:00' : formatClock(now - sessionStart);

  const left = restRemaining(restEnd, now);
  const box = byId('timer-rest-box');
  const btn = byId('timer-rest-btn');
  if (left === null) {
    byId('timer-rest').textContent = formatClock(restSec * 1000);
    btn.textContent = restFinished ? 'OK' : '開始';
  } else if (left === 0) {
    // 終わった。1回だけ知らせて、止める
    restEnd = null;
    restFinished = true;
    byId('timer-rest').textContent = '0:00';
    btn.textContent = 'OK';
    notifyRestDone();
  } else {
    byId('timer-rest').textContent = formatClock(Math.ceil(left / 1000) * 1000);
    btn.textContent = '停止';
  }
  box.classList.toggle('done', restFinished);
  box.classList.toggle('running', restEnd !== null);

  // 何も動いていなければ、更新を止める
  if (sessionStart === null && restEnd === null && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function ensureTicker(): void {
  if (ticker === null) ticker = window.setInterval(tick, 250);
  tick();
}

/** セットを追加したとき: 経過時間を始め（最初の1回だけ）、レストを自動で始める */
export function onSetAdded(): void {
  unlockAudio();
  const now = Date.now();
  sessionStart ??= now;
  restEnd = now + restSec * 1000;
  restFinished = false;
  ensureTicker();
}

/** 保存・クリア・最後のセットを消したとき: 経過時間とレストを戻す */
export function resetTimer(): void {
  sessionStart = null;
  restEnd = null;
  restFinished = false;
  tick();
}

/** 「開始／停止／OK」のボタン */
export function toggleRest(): void {
  unlockAudio();
  if (restEnd !== null) restEnd = null; // 停止
  else if (restFinished) restFinished = false; // 終わりの点滅を消す
  else restEnd = Date.now() + restSec * 1000; // 手で開始
  ensureTicker();
}

/** レストの長さを選び直したとき */
export function setRestDuration(value: string): void {
  restSec = normalizeRestSec(value);
  try { localStorage.setItem(REST_KEY, String(restSec)); } catch { /* 保存できなくても使える */ }
  if (restEnd !== null) restEnd = Date.now() + restSec * 1000; // 動いているなら、選んだ長さで数え直す
  tick();
}

export function initTimer(): void {
  byId<HTMLSelectElement>('timer-rest-sec').value = String(restSec);
  tick();
}
