# 種目を 1 つ作って、forms/<種目>.glb に書き出す。
#
#   画面なしで: blender --background --factory-startup --python tools/blender/build.py -- squat
#   ひとつ作って確かめるだけ: ... -- squat --check   （書き出さず、動きの数値を出す）
#
# Blender の MCP から使うとき: exec(open('tools/blender/build.py').read()) のあと、main('squat') を呼ぶ
import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.abspath('tools/blender')
ROOT = os.path.dirname(os.path.dirname(HERE))
for p in (HERE, os.path.join(HERE, 'exercises')):
    if p not in sys.path:
        sys.path.insert(0, p)


def export_glb(path):
    """アニメーションつきで GLB に書き出す。IK の結果は、フレームごとに計算して入れる（force_sampling）。
    IK の操作ボーンは入れない（変形に使うボーンだけ）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        o.select_set(True)
    kwargs = dict(
        filepath=path, export_format='GLB', use_selection=True, export_animations=True,
        export_force_sampling=True, export_def_bones=True, export_frame_range=True,
        export_anim_single_armature=True, export_cameras=False, export_lights=False,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_optimize_animation_size=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)


def main(name, check_only=False):
    import rig
    importlib.reload(rig)
    mod = importlib.import_module(name)
    importlib.reload(mod)
    arm = rig.build_figure()
    mod.build(arm)
    problems, info = mod.report(arm)
    for k, v in info.items():
        print(f'  {k}: {v}')
    if problems:
        print('問題:', *problems[:5], sep='\n  ')
    if check_only:
        return problems
    out = os.path.join(ROOT, 'forms', f'{name}.glb')
    export_glb(out)
    print(f'書き出した: {out} ({os.path.getsize(out) / 1024:.0f} KB)')
    return problems


if __name__ == '__main__' and '--' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    names = [a for a in args if not a.startswith('--')]
    for n in names:
        main(n, check_only='--check' in args)
