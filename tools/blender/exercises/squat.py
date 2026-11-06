# バーベルスクワット（バックスクワット）。立つ → しゃがむ → 立つ の 1 回（約 3.9 秒。最後は最初と同じ姿勢で、つないで繰り返せる）。
# 動きの作り方: 足は床に置いたまま（IK）。腰の位置と、腰・背中の傾きだけを、キーフレームで決める。膝は IK が前に曲げる。
#   - 深さ: 一番下で、股関節の高さが膝の高さ付近（太ももが水平に近い）
#   - バー: 足の真ん中（かかとからつま先の中点）の上を、ほぼ垂直に動く。そのため、上体は前に約 52° 倒れる
#   - 体は、腰を後ろに引くのが先、上体の前傾は、あとから増える
import bpy

import rig

FPS = 30
LABEL = 'バーベルスクワット'
# 足を、体の真下より少し後ろ（+Y）に置く。バーが首の後ろにあるぶん、立ったときも、バーが足の真ん中の上に近くなる
FOOT_BACK = 0.03

# (フレーム, 腰の後ろへの移動 m, 腰の下への移動 m, 腰の前傾 度, 背中の前傾 度)。腰と背中の前傾の合計が、上体の傾き
KEYS = [
    (1, 0.00, 0.00, 5, 8),      # 立つ（バーを担いだ、自然な少しの前傾）
    (12, 0.00, 0.00, 5, 8),     # 立ったまま、少し待つ（0.4 秒）
    (30, 0.07, -0.18, 12, 21),  # 下がり始め（腰を後ろへ）
    (45, 0.14, -0.36, 16, 29),
    (60, 0.18, -0.50, 18, 34),  # 一番下
    (68, 0.18, -0.50, 18, 34),  # 一番下で、少し止まる
    (84, 0.15, -0.32, 16, 31),  # 上がり（腰と胸が一緒に上がる）
    (96, 0.06, -0.12, 9, 17),
    (106, 0.00, 0.00, 5, 8),    # 立つ
    (118, 0.00, 0.00, 5, 8),    # 立ったまま、少し待つ（最初と同じ姿勢で、1 回がつながる）
]


def build(arm):
    """器具を足して、動きを付ける"""
    # バーは、首の後ろの、背中の上（背中の骨 spine にくっつく）。両手で、肩幅より広く握る
    rig.add_barbell(arm, 'spine', center=(0, 0.10, 1.38))

    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = KEYS[0][0], KEYS[-1][0]
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for side in 'LR':
        rig.set_world_loc(arm, f'ik_foot.{side}', 0, FOOT_BACK, 0)  # 足の位置は、ずっと同じ（キーフレームなし）
    for frame, dy, dz, hips_deg, spine_deg in KEYS:
        rig.set_world_loc(arm, 'hips', 0, dy, dz)
        rig.set_world_rot(arm, 'hips', hips_deg)
        rig.set_world_rot(arm, 'spine', spine_deg)
        rig.key_pose(arm, frame)
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.animation_data.action.name = 'squat'


def bar_center(obj):
    """物の、形の中心の世界の位置（原点は世界の原点のままなので、形の箱の中心で測る）"""
    from mathutils import Vector
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return sum(corners, Vector()) / 8


def report(arm):
    """動きを数値で確かめる（足が動かない・バーが足の上にある・深さ）。問題があれば、文で返す"""
    sc = bpy.context.scene
    problems = []
    bar = bpy.data.objects['bar']
    ankle0 = None
    bar_y, bar_z = [], []
    for fr in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(fr)
        ankle = rig.evaluated_world(arm, 'shin.L', tail=True)
        if ankle0 is None:
            ankle0 = ankle.copy()
        if (ankle - ankle0).length > 0.01:
            problems.append(f'フレーム {fr}: 足が動いた（{(ankle - ankle0).length:.3f} m）')
        c = bar_center(bar)
        bar_y.append(c.y)
        bar_z.append(c.z)
    sc.frame_set(60)
    hip, knee = rig.evaluated_world(arm, 'thigh.L'), rig.evaluated_world(arm, 'shin.L')
    info = {
        'バーの前後の動き（m）': round(max(bar_y) - min(bar_y), 3),
        f'一番下のバーの位置 y（足の真ん中は {-0.085 + FOOT_BACK:.3f}。かかと {0.05 + FOOT_BACK:.2f}〜つま先 {-0.22 + FOOT_BACK:.2f}）': round(bar_y[60 - sc.frame_start], 3),
        '立ったときのバーの位置 y': round(bar_y[0], 3),
        'バーの高さ（立つ → 一番下）': (round(bar_z[0], 2), round(min(bar_z), 2)),
        '一番下: 股関節の高さ − 膝の高さ（0 以下なら、太ももは水平以下）': round(hip.z - knee.z, 3),
        f'一番下: 膝の前後 y（つま先は {-0.22 + FOOT_BACK:.2f}）': round(knee.y, 3),
    }
    return problems, info
