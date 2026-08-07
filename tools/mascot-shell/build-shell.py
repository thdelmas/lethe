import bpy
import sys
import os

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, MASKTEX, OUT, EPS = argv[0], argv[1], argv[2], float(argv[3])

# Refuse to shell an already-shelled GLB. The output of this script is a valid
# input to it, and re-running would stack a second shell on the first — 92
# meshes, four materials, and veins offset twice. SRC must be the stone model
# (prebuilt/filament/mascot-stone.glb), never prebuilt/filament/mascot.glb.
with open(SRC, "rb") as f:
    head = f.read(2 * 1024 * 1024)
if b"LetheCrackShell" in head:
    sys.exit(
        "FATAL: %s is already shelled — pass the stone model "
        "(prebuilt/filament/mascot-stone.glb) instead" % SRC
    )

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print(
    "IMPORTED meshes=%d armatures=%d actions=%d"
    % (len(meshes), len(arms), len(bpy.data.actions))
)
for a in arms:
    n = len(a.animation_data.nla_tracks) if a.animation_data else 0
    print("  armature %s nla_tracks=%d" % (a.name, n))

# --- shell material: crack RGB, alpha = crack mask -------------------------
mat = bpy.data.materials.new("LetheCrackShell")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(MASKTEX)
tex.image.alpha_mode = "STRAIGHT"
tex.interpolation = "Closest"  # keep hairline veins crisp
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.5
try:
    mat.blend_method = "CLIP"
except TypeError:
    mat.blend_method = "BLEND"  # 5.x dropped CLIP; GLB is patched later

# --- duplicate every mesh, push along normals, reskin to the shell ---------
made = 0
for src in meshes:
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = src.name + "_crack"
    dup.data.name = src.data.name + "_crack"
    for c in src.users_collection:
        c.objects.link(dup)
    me = dup.data
    # vertex normals are computed, not authored (the GLB carries no NORMAL)
    for v in me.vertices:
        v.co += v.normal * EPS
    me.materials.clear()
    me.materials.append(mat)
    made += 1

print("SHELLED %d meshes (eps=%g)" % (made, EPS))

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animation_mode="NLA_TRACKS",
    export_animations=True,
    export_skins=True,
    export_image_format="AUTO",
    export_apply=False,
    export_yup=True,
)
print("EXPORTED", OUT, os.path.getsize(OUT))
