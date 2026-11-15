import bpy, math
from mathutils import Vector
D='/workspace/poc3d/char/'
bpy.ops.wm.open_mainfile(filepath=D+'budiman_tex.blend')
sc=bpy.context.scene
body=bpy.data.objects['Body']
arm_data=bpy.data.armatures.new('Rig'); arm=bpy.data.objects.new('Rig',arm_data); sc.collection.objects.link(arm)
for x in sc.objects: x.select_set(False)
arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
J={}
def bone(name, head, tail, parent=None, connect=False):
    b=arm_data.edit_bones.new(name); b.head=Vector(head); b.tail=Vector(tail)
    if parent: b.parent=arm_data.edit_bones[parent]; b.use_connect=connect
    b.roll=0
    return b
bone('root',(0,0,0),(0,0.15,0))
bone('DEF-hips',(0,0.0,0.93),(0,0.01,1.00),'root')
bone('DEF-spine.001',(0,0.01,1.00),(0,0.01,1.15),'DEF-hips',True)
bone('DEF-spine.002',(0,0.01,1.15),(0,0.01,1.30),'DEF-spine.001',True)
bone('DEF-spine.003',(0,0.01,1.30),(0,0.0,1.46),'DEF-spine.002',True)
bone('DEF-neck',(0,0.0,1.46),(0,-0.005,1.53),'DEF-spine.003',True)
bone('DEF-head',(0,-0.005,1.53),(0,-0.005,1.74),'DEF-neck',True)
for s,sx in (('L',1),('R',-1)):
    bone(f'DEF-shoulder.{s}',(0.03*sx,0.0,1.40),(0.18*sx,0.01,1.39),'DEF-spine.003')
    bone(f'DEF-upper_arm.{s}',(0.18*sx,0.01,1.39),(0.265*sx,0.02,1.08),f'DEF-shoulder.{s}',True)
    bone(f'DEF-forearm.{s}',(0.265*sx,0.02,1.08),(0.29*sx,0.0,0.81),f'DEF-upper_arm.{s}',True)
    bone(f'DEF-hand.{s}',(0.29*sx,0.0,0.81),(0.295*sx,-0.005,0.69),f'DEF-forearm.{s}',True)
    bone(f'DEF-thigh.{s}',(0.10*sx,0.0,0.90),(0.115*sx,-0.01,0.48),'DEF-hips')
    bone(f'DEF-shin.{s}',(0.115*sx,-0.01,0.48),(0.12*sx,0.02,0.09),f'DEF-thigh.{s}',True)
    bone(f'DEF-foot.{s}',(0.12*sx,0.02,0.09),(0.12*sx,-0.10,0.03),f'DEF-shin.{s}',True)
    bone(f'DEF-toe.{s}',(0.12*sx,-0.10,0.03),(0.12*sx,-0.17,0.02),f'DEF-foot.{s}',True)
bpy.ops.object.mode_set(mode='OBJECT')
# bind with automatic (heat) weights
for x in sc.objects: x.select_set(False)
body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
vg={g.name:g for g in body.vertex_groups}
print('GROUPS',[g.name for g in body.vertex_groups])
# extras: rigid
def rigid(extra, bonename):
    gi=vg[extra].index; target=vg[bonename]
    ids=[v.index for v in body.data.vertices if any(g.group==gi for g in v.groups)]
    for g in body.vertex_groups:
        if g.name.startswith('DEF-') or g.name=='root':
            g.remove(ids)
    target.add(ids,1.0,'REPLACE')
    print(extra, len(ids))
rigid('x_head','DEF-head'); rigid('x_back','DEF-spine.003')
body.vertex_groups.remove(vg['x_head']); body.vertex_groups.remove(vg['x_back'])
# report unweighted verts
unw=[v.index for v in body.data.vertices if not any(body.vertex_groups[g.group].name.startswith('DEF') and g.weight>0.001 for g in v.groups)]
print('UNWEIGHTED',len(unw))
# limit to 4 influences, normalize
for x in sc.objects: x.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active=body
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.wm.save_as_mainfile(filepath=D+'budiman_rigged.blend')
bpy.ops.export_scene.gltf(filepath=D+'budiman.glb', export_format='GLB', use_selection=False, export_animations=False, export_skins=True, export_image_format='JPEG', export_jpeg_quality=88, export_apply=False, export_yup=True)
print('EXPORT_OK')
