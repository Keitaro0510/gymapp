// フォームの 3D アニメーションを見せるビューア（three.js）。種目の詳細シートで「3D でフォームを見る」を押したときにだけ読み込む
// （index.html から静的に import しない。動的 import で、別のファイルに分かれる）。
// - GLB（tools/blender/ で作ったもの）を読み込み、アニメーションを繰り返し再生する
// - 再生・一時停止・速度・見る向き（横・正面・斜め）。ドラッグで回せる（パンはなし。ピンチで少し寄れる）
// - 閉じるときは dispose() で、WebGL の資源を全部手放す（WebGL のコンテキストの数には上限があるため）
import {
  AmbientLight, AnimationMixer, CircleGeometry, Color, DirectionalLight, HemisphereLight, LoopRepeat, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, WebGLRenderer, type AnimationAction, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FORM_VIEWS, type FormViewName } from './form-models.ts';

export interface FormViewer {
  /** 画面に入れる要素（canvas）。シートを描き直しても、これを入れ直せば、再生が続く */
  readonly el: HTMLCanvasElement;
  readonly playing: boolean;
  /** 再生・一時停止を切り替える。切り替えたあとの「再生中か」を返す */
  toggle(): boolean;
  setSpeed(speed: number): void;
  setView(name: FormViewName): void;
  dispose(): void;
}

export async function createFormViewer(url: string): Promise<FormViewer> {
  const canvas = document.createElement('canvas');
  canvas.className = 'form-canvas';
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(new Color(0x000000), 0); // 背景は透明（カードの色がそのまま出る。ライト／ダークの両方に合う）
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8a8a9a, 1.7));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  // 床（足の位置の目印。薄い灰色の円。ライト／ダークのどちらでも見える）
  const floor = new Mesh(new CircleGeometry(1.5, 64), new MeshBasicMaterial({ color: 0x808090, transparent: true, opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  scene.add(floor);

  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.52; // 床の下には回らない

  const setView = (name: FormViewName): void => {
    const v = FORM_VIEWS[name];
    camera.position.set(v.camera[0], v.camera[1], v.camera[2]);
    controls.target.set(v.target[0], v.target[1], v.target[2]);
    controls.update();
  };
  setView('side');

  const gltf = await new GLTFLoader().loadAsync(url);
  const model: Object3D = gltf.scene;
  // プレートは半透明にする（横から見たとき、手前のプレートが体を隠して、上体の角度が見えなくなるため）
  model.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m.name === 'plate') { m.transparent = true; m.opacity = 0.28; m.depthWrite = false; }
    }
  });
  scene.add(model);
  const mixer = new AnimationMixer(model);
  const clip = gltf.animations[0];
  let action: AnimationAction | null = null;
  if (clip) {
    action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.play();
  }

  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; // 動きを減らす設定なら、止めた状態から始める
  let speed = 1;
  let last = performance.now();
  let raf = 0;
  let disposed = false;

  const resize = (): void => {
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const frame = (now: number): void => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); // 画面が止まっていたあとで、動きが飛ばないように
    last = now;
    if (document.hidden) return;
    if (playing) mixer.update(dt * speed);
    controls.update();
    renderer.render(scene, camera);
    canvas.dataset.t = (action ? action.time : 0).toFixed(2); // テストと確認のための印（今の再生位置・再生中か）
    canvas.dataset.playing = String(playing);
  };
  resize();
  raf = requestAnimationFrame(frame);

  return {
    el: canvas,
    get playing() { return playing; },
    toggle() { playing = !playing; return playing; },
    setSpeed(s: number) { speed = s; },
    setView,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      model.traverse(o => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const m = mesh.material;
          (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
        }
      });
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
