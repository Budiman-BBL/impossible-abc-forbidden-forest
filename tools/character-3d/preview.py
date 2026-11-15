import bpy, sys, math
argv=sys.argv[sys.argv.index('--')+1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
from mathutils import Vector
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for o in objs:
    for c in o.bound_box:
        w=o.matrix_world@Vector(c); mn=Vector(map(min,mn,w)); mx=Vector(map(max,mx,w))
ctr=(mn+mx)/2; h=max(mx-mn)
print('BOUNDS',mn,mx)
sc=bpy.context.scene
sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='FLAT' if '--flat' in argv else 'STUDIO'
sc.display.shading.color_type='TEXTURE' if '--tex' in argv else 'VERTEX'
sc.render.resolution_x=400; sc.render.resolution_y=500
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=h*1.1
import os
views=[('front',(0,-1,0)),('side',(1,0,0)),('back',(0,1,0)),('q',(0.7,-0.7,0))]
for name,d in views:
    d=Vector(d).normalized()
    cam.location=ctr+d*h*3
    cam.rotation_euler=(d*-1).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
