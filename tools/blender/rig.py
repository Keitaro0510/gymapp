# フォームの 3D アニメーションの、全種目で共通の部分: 人型のリグ（ボーン＋IK）と見た目（カプセルの組み合わせ）。
# Blender（4.5 で確認）の中で動く。使い方は tools/blender/README.md。
#
# 座標: Blender の +Z が上、正面は -Y、体の左は +X。glTF に書き出すと、Y が上・正面が +Z になる（Blender の書き出しが変換する）。
# 長さの目安（身長 約 1.7m）: 股関節 0.95 / 膝 0.52 / 足首 0.10 / 肩 1.42 / 頭 1.64
import math

import bpy
import mathutils
from mathutils import Matrix, Vector

# 色（アプリの色に合わせる。シャツは、アプリの赤）
SKIN = (0.90, 0.70, 0.55, 1)
SHIRT = (0.84, 0.19, 0.17, 1)
PANTS = (0.20, 0.20, 0.25, 1)
SHOES = (0.12, 0.12, 0.14, 1)
METAL = (0.62, 0.62, 0.66, 1)
PLATE = (0.12, 0.12, 0.13, 1)
BENCH = (0.25, 0.25, 0.30, 1)

# メッシュの細かさ（小さいほど GLB が軽い）
CYL_VERTS, SPH_SEGS, SPH_RINGS = 16, 16, 8


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for d in list(coll):
            coll.remove(d)


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = 0.8
    return m


# ---------- ボーンと IK ----------

def make_rig():
    """ボーン。腕は下ろした姿勢。IK の操作ボーン（ik_foot・ik_hand・elbow_pole）は見た目に出ない（書き出しにも入らない）"""
    data = bpy.data.armatures.new('Rig')
    arm = bpy.data.objects.new('Rig', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones

    def bone(name, head, tail, parent=None, deform=True):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
        return b

    bone('hips', (0, 0, 0.95), (0, 0, 1.05))
    bone('spine', (0, 0, 1.05), (0, 0, 1.45), 'hips')
    bone('neck', (0, 0, 1.45), (0, 0, 1.62), 'spine')
    for s, sx in (('L', 1), ('R', -1)):
        x = 0.10 * sx
        # 膝は、静止の姿勢で少し前（-Y）に曲げておく（IK が、膝を前に曲げる向きを、ここから決める）
        bone(f'thigh.{s}', (x, 0, 0.95), (x, -0.03, 0.52), 'hips')
        bone(f'shin.{s}', (x, -0.03, 0.52), (x, 0, 0.10), f'thigh.{s}')
        bone(f'foot.{s}', (x, 0, 0.10), (x, -0.16, 0.05), f'shin.{s}')
        sh = 0.22 * sx
        bone(f'upper_arm.{s}', (sh, 0, 1.42), (sh, 0, 1.15), 'spine')
        bone(f'forearm.{s}', (sh, 0, 1.15), (sh, -0.05, 0.90), f'upper_arm.{s}')
        # IK の操作ボーン。足は床に置いたまま。手の目標は、背中（spine）に付ける（種目ごとに、位置を変えてよい）
        bone(f'ik_foot.{s}', (x, 0, 0.10), (x, -0.16, 0.05), None, deform=False)
        bone(f'ik_hand.{s}', (0.45 * sx, 0.10, 1.38), (0.45 * sx, 0.10, 1.30), 'spine', deform=False)
        bone(f'elbow_pole.{s}', (0.62 * sx, 0.55, 1.10), (0.62 * sx, 0.55, 1.18), 'spine', deform=False)
    bpy.ops.object.mode_set(mode='POSE')
    pb = arm.pose.bones
    for s in 'LR':
        c = pb[f'shin.{s}'].constraints.new('IK')
        c.target, c.subtarget = arm, f'ik_foot.{s}'
        c.chain_count = 2
        # 脚は前後の曲げ伸ばしだけ（ひねり・横への開きは固定）。膝は前にだけ曲がり、後ろにはそらさない
        # （IK が逆向きの解を選ぶのを防ぐ。膝の向きを決める pole を付けると、足が目標に届かなくなる）
        for n in (f'thigh.{s}', f'shin.{s}'):
            pb[n].lock_ik_y = pb[n].lock_ik_z = True
        pb[f'shin.{s}'].use_ik_limit_x = True
        pb[f'shin.{s}'].ik_min_x, pb[f'shin.{s}'].ik_max_x = 0.0, math.radians(160)
        f = pb[f'foot.{s}'].constraints.new('COPY_ROTATION')  # 足は、床に平らに置いたまま
        f.target, f.subtarget = arm, f'ik_foot.{s}'
        f.target_space = f.owner_space = 'WORLD'
        a = pb[f'forearm.{s}'].constraints.new('IK')
        a.target, a.subtarget = arm, f'ik_hand.{s}'
        a.pole_target, a.pole_subtarget = arm, f'elbow_pole.{s}'
        a.pole_angle = math.radians(-90)
        a.chain_count = 2
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def attach(obj, arm, bone_name):
    """物を、ボーンの動きについてくるようにくっつける（静止の姿勢で、物がそのままの位置に見える）"""
    b = arm.data.bones[bone_name]
    obj.parent, obj.parent_type, obj.parent_bone = arm, 'BONE', bone_name
    obj.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()


# ---------- 見た目 ----------

def capsule(name, p0, p1, r, mat, arm, bone_name):
    """p0 から p1 までの、両端が丸い筒。ボーンにくっつける"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p0 + p1) / 2, vertices=CYL_VERTS)
    cyl = bpy.context.active_object
    cyl.rotation_mode = 'QUATERNION'
    cyl.rotation_quaternion = d.to_track_quat('Z', 'Y')
    parts.append(cyl)
    for end in (p0, p1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=end, segments=SPH_SEGS, ring_count=SPH_RINGS)
        parts.append(bpy.context.active_object)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = cyl
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    attach(obj, arm, bone_name)
    return obj


def sphere(name, center, r, mat, arm, bone_name, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=center, segments=SPH_SEGS, ring_count=SPH_RINGS)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    attach(o, arm, bone_name)
    return o


def cylinder(name, center, radius, depth, rotation, mat, arm, bone_name):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=center, rotation=rotation, vertices=CYL_VERTS * 2)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    attach(o, arm, bone_name)
    return o


def box(name, center, size, mat, arm, bone_name):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(mat)
    attach(o, arm, bone_name)
    return o


def build_figure():
    """人型（骨つき）を作って、リグを返す。器具は、種目ごとのスクリプトで足す"""
    clear_scene()
    arm = make_rig()
    skin, shirt, pants, shoes = (material('skin', SKIN), material('shirt', SHIRT), material('pants', PANTS), material('shoes', SHOES))
    capsule('torso', (0, 0, 1.08), (0, 0, 1.40), 0.15, shirt, arm, 'spine')
    capsule('shoulders', (-0.2, 0, 1.40), (0.2, 0, 1.40), 0.07, shirt, arm, 'spine')
    capsule('pelvis', (-0.09, 0, 0.99), (0.09, 0, 0.99), 0.12, pants, arm, 'hips')
    capsule('neck_m', (0, 0, 1.47), (0, 0, 1.55), 0.045, skin, arm, 'neck')
    capsule('head', (0, 0, 1.64), (0, 0, 1.68), 0.095, skin, arm, 'neck')
    bpy.ops.mesh.primitive_cone_add(radius1=0.03, depth=0.07, location=(0, -0.11, 1.65), rotation=(math.radians(90), 0, 0))
    nose = bpy.context.active_object  # 鼻（向きが分かるように）
    nose.name = 'nose'
    nose.data.materials.append(skin)
    attach(nose, arm, 'neck')
    for s, sx in (('L', 1), ('R', -1)):
        x = 0.10 * sx
        capsule(f'thigh_m.{s}', (x, 0, 0.95), (x, -0.03, 0.54), 0.085, pants, arm, f'thigh.{s}')
        capsule(f'shin_m.{s}', (x, -0.03, 0.52), (x, 0, 0.12), 0.065, pants, arm, f'shin.{s}')
        capsule(f'foot_m.{s}', (x, 0, 0.08), (x, -0.17, 0.05), 0.05, shoes, arm, f'foot.{s}')
        sh = 0.22 * sx
        capsule(f'uarm_m.{s}', (sh, 0, 1.40), (sh, 0, 1.17), 0.052, skin, arm, f'upper_arm.{s}')
        capsule(f'farm_m.{s}', (sh, 0, 1.15), (sh, -0.05, 0.92), 0.042, skin, arm, f'forearm.{s}')
        sphere(f'hand_m.{s}', (sh, -0.06, 0.90), 0.05, skin, arm, f'forearm.{s}', scale=(1, 1.1, 0.9))
    return arm


def add_barbell(arm, bone_name, center, half_length=1.1, plate_x=0.95):
    """バーベル（バー・プレート・カラー）。center は、静止の姿勢での、バーの中央の位置"""
    metal, plate = material('metal', METAL), material('plate', PLATE)
    rot = (0, math.radians(90), 0)
    cx, cy, cz = center
    cylinder('bar', center, 0.016, half_length * 2, rot, metal, arm, bone_name)
    for sx in (-1, 1):
        cylinder(f'plate{sx}', (cx + plate_x * sx, cy, cz), 0.22, 0.05, rot, plate, arm, bone_name)
        cylinder(f'collar{sx}', (cx + (plate_x - 0.07) * sx, cy, cz), 0.03, 0.03, rot, metal, arm, bone_name)


# ---------- 姿勢を付ける道具 ----------

def _m3(arm, bone):
    return arm.data.bones[bone].matrix_local.to_3x3()


def set_world_rot(arm, bone, deg_x=0.0):
    """ボーンを、世界の X まわりに deg_x 度（正で、上の端が前＝-Y へ倒れる）回す（垂直なボーン用）"""
    m3 = _m3(arm, bone)
    r = mathutils.Matrix.Rotation(math.radians(deg_x), 3, 'X')
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (m3.inverted() @ r @ m3).to_quaternion()


def set_world_loc(arm, bone, dx=0.0, dy=0.0, dz=0.0):
    """ボーンを、静止の位置から、世界の (dx, dy, dz) だけ動かす（親がいないボーン用）"""
    pb = arm.pose.bones[bone]
    pb.location = _m3(arm, bone).inverted() @ Vector((dx, dy, dz))


def key_pose(arm, frame, bones=('hips', 'spine'), loc=('hips',)):
    for b in bones:
        arm.pose.bones[b].keyframe_insert('rotation_quaternion', frame=frame)
    for b in loc:
        arm.pose.bones[b].keyframe_insert('location', frame=frame)


def evaluated_world(arm, bone, tail=False):
    """IK の結果を含めた、ボーンの世界の位置（評価前のポーズを読むと、IK の結果とずれる）"""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = arm.evaluated_get(dg)
    b = ev.pose.bones[bone]
    return ev.matrix_world @ (b.tail if tail else b.head)
