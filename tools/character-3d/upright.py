import bpy, sys, math
from mathutils import Vector, Matrix
argv=sys.argv[sys.argv.index('--')+1:]
src,out,rx,rz=argv[0],argv[1],float(argv[2]),float(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
o=objs[0]
bpy.context.view_layer.objects.active=o
for x in bpy.context.scene.objects: x.select_set(x==o)
W=o.matrix_world.copy()
R=Matrix.Rotation(math.radians(rz),4,'Z')@Matrix.Rotation(math.radians(rx),4,'X')
for v in o.data.vertices: v.co=R@(W@v.co)
o.parent=None; o.matrix_world=Matrix.Identity(4)
mn=Vector([min(v.co[i] for v in o.data.vertices) for i in range(3)]); mx=Vector([max(v.co[i] for v in o.data.vertices) for i in range(3)])
s=1.75/(mx.z-mn.z)
for v in o.data.vertices:
    v.co=Vector(((v.co.x-(mn.x+mx.x)/2)*s,(v.co.y-(mn.y+mx.y)/2)*s,(v.co.z-mn.z)*s))
for x in list(bpy.context.scene.objects):
    if x!=o: bpy.data.objects.remove(x)
o.name='Body'
print('VERTS',len(o.data.vertices),'FACES',len(o.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath=out)
