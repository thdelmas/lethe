"""
LETHE Mixamo Hand Fix
Run in Blender after importing any Mixamo FBX for the LETHE model.

Usage:
  1. Import Mixamo FBX (File > Import > FBX)
  2. Open this script in Blender's Text Editor
  3. Click Run Script (or Alt+P)

Or from Blender's Python console:
  exec(open("/home/mia/OSmosis/lethe/scripts/fix-mixamo-hands.py").read())
"""
import bpy
import math
from mathutils import Quaternion

HAND_FIXES = {
    'mixamorig:LeftHand': Quaternion((0, 1, 0), math.radians(90)),
    'mixamorig:RightHand': Quaternion((0, 1, 0), math.radians(-90)),
}

fixed = 0
for action in bpy.data.actions:
    if not action.is_action_layered:
        continue
    try:
        fcs = action.layers[0].strips[0].channelbags[0].fcurves
    except (IndexError, AttributeError):
        continue
    for bname, twist in HAND_FIXES.items():
        path = f'pose.bones["{bname}"].rotation_quaternion'
        curves = sorted(
            [fc for fc in fcs if fc.data_path == path],
            key=lambda c: c.array_index,
        )
        if len(curves) != 4:
            continue
        for kp_idx in range(len(curves[0].keyframe_points)):
            old_q = Quaternion([
                curves[i].keyframe_points[kp_idx].co[1] for i in range(4)
            ])
            new_q = old_q @ twist
            for i in range(4):
                curves[i].keyframe_points[kp_idx].co[1] = new_q[i]
        for c in curves:
            c.update()
    fixed += 1

print(f"LETHE: Fixed hand orientation in {fixed} actions")
