import bpy, bmesh, json, math, sys
from mathutils import Vector
D='/workspace/poc3d/char/'
bpy.ops.wm.open_mainfile(filepath=D+'tsr_up.blend')
sc=bpy.context.scene
body=bpy.data.objects['Body']
def activate(o):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode!='OBJECT' else None
    for x in sc.objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active=o
activate(body)
# clean + decimate
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
for a in list(body.data.attributes):
    if a.name.lower().startswith('col'): pass
m=body.modifiers.new('dec','DECIMATE'); m.ratio=float(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 0.28
bpy.ops.object.modifier_apply(modifier='dec')
body.data.materials.clear()

def add_piece(name, verts_fn, group):
    me=bpy.data.meshes.new(name); o=bpy.data.objects.new(name,me); sc.collection.objects.link(o)
    bm=bmesh.new(); verts_fn(bm); bm.to_mesh(me); bm.free()
    vg=o.vertex_groups.new(name=group); vg.add(list(range(len(me.vertices))),1.0,'REPLACE')
    return o
# cap brim: half ellipse plate in front of the head
def brim(bm):
    import mathutils
    n=12; top=[]; bot=[]
    for i in range(n+1):
        a=math.pi*i/n
        x=math.cos(a)*0.10; y=-math.sin(a)*0.085
        top.append(bm.verts.new((x,y,0.006))); bot.append(bm.verts.new((x,y,-0.006)))
    ct=bm.verts.new((0,0,0.006)); cb=bm.verts.new((0,0,-0.006))
    for i in range(n):
        bm.faces.new((ct,top[i],top[i+1])); bm.faces.new((cb,bot[i+1],bot[i]))
        bm.faces.new((top[i],bot[i],bot[i+1],top[i+1]))
    bm.faces.new((top[0],ct,cb,bot[0])); bm.faces.new((ct,top[n],bot[n],cb))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0,0,0), matrix=mathutils.Matrix.Rotation(math.radians(-14),3,'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0,-0.075,1.668))
b=add_piece('Brim',brim,'x_head')
# backpack: bevelled box on the back
def pack(bm):
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(0.29,0.11,0.34))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.025, segments=2, affect='EDGES')
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0,0.235,1.13))
p=add_piece('Pack',pack,'x_back')
# join
for x in sc.objects: x.select_set(x in (body,b,p))
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
body.data.materials.clear()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
print('TRIS', sum(len(pl.vertices)-2 for pl in body.data.polygons), 'VERTS', len(body.data.vertices))

# ---------- projection bake ----------
bb=json.load(open(D+'bbox.json'))
mat=bpy.data.materials.new('proj'); mat.use_nodes=True; nt=mat.node_tree; N=nt.nodes; L=nt.links
for n in list(N): N.remove(n)
out=N.new('ShaderNodeOutputMaterial'); em=N.new('ShaderNodeEmission'); L.new(em.outputs[0],out.inputs[0])
tc=N.new('ShaderNodeTexCoord'); sep=N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'],sep.inputs[0])
geo=N.new('ShaderNodeNewGeometry'); nsep=N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'],nsep.inputs[0])
def math_node(op,a,b=None):
    n=N.new('ShaderNodeMath'); n.operation=op
    for i,v in enumerate([a,b]):
        if v is None: continue
        if isinstance(v,(int,float)): n.inputs[i].default_value=v
        else: L.new(v,n.inputs[i])
    return n.outputs[0]
def lin(sock,mul,add): return math_node('ADD',math_node('MULTIPLY',sock,mul),add)
def tex(img, U, V):
    comb=N.new('ShaderNodeCombineXYZ'); L.new(U,comb.inputs[0]); L.new(V,comb.inputs[1])
    t=N.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(D+img); t.extension='EXTEND'; t.interpolation='Cubic'
    L.new(comb.outputs[0],t.inputs[0]); return t.outputs['Color']
S=1024.0
X,Y,Z=sep.outputs[0],sep.outputs[1],sep.outputs[2]
f=bb['front']; ppm=(f['y1']-f['y0'])/1.75; cx=(f['x0']+f['x1'])/2
cF=tex('front.png', lin(X,ppm/S,cx/S), lin(Z,ppm/S,(S-f['y1'])/S))
k=bb['back']; ppmb=(k['y1']-k['y0'])/1.75; cxb=(k['x0']+k['x1'])/2
cB=tex('back.png', lin(X,-ppmb/S,cxb/S), lin(Z,ppmb/S,(S-k['y1'])/S))
s=bb['side']; ppms=(s['y1']-s['y0'])/1.75
cS=tex('side.png', lin(Y,-ppms/S,(s['x1']-0.188*ppms)/S), lin(Z,ppms/S,(S-s['y1'])/S))
NX,NY=nsep.outputs[0],nsep.outputs[1]
P=4.0
wf=math_node('POWER',math_node('MAXIMUM',math_node('MULTIPLY',NY,-1.0),0.0),P)
wb=math_node('POWER',math_node('MAXIMUM',NY,0.0),P)
ws=math_node('POWER',math_node('ABSOLUTE',NX),P)
tot=math_node('ADD',math_node('ADD',wf,wb),math_node('ADD',ws,1e-4))
def scale_col(c,w):
    vm=N.new('ShaderNodeVectorMath'); vm.operation='SCALE'; L.new(c,vm.inputs[0]); L.new(math_node('DIVIDE',w,tot),vm.inputs['Scale']); return vm.outputs[0]
def addv(a,b2):
    vm=N.new('ShaderNodeVectorMath'); vm.operation='ADD'; L.new(a,vm.inputs[0]); L.new(b2,vm.inputs[1]); return vm.outputs[0]
col=addv(addv(scale_col(cF,wf),scale_col(cB,wb)),scale_col(cS,ws))
L.new(col,em.inputs['Color'])
img=bpy.data.images.new('budiman_albedo',1024,1024)
it=N.new('ShaderNodeTexImage'); it.image=img; N.active=it
body.data.materials.append(mat)
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=4
sc.render.bake.margin=6
activate(body)
bpy.ops.object.bake(type='EMIT')
img.filepath_raw=D+'budiman_albedo.png'; img.file_format='PNG'; img.save()
# final material
for n in list(N): N.remove(n)
out=N.new('ShaderNodeOutputMaterial'); bs=N.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value=0.9
t=N.new('ShaderNodeTexImage'); t.image=img; L.new(t.outputs[0],bs.inputs['Base Color']); L.new(bs.outputs[0],out.inputs[0])
mat.name='Budiman'
bpy.ops.wm.save_as_mainfile(filepath=D+'budiman_tex.blend')
print('BAKE_OK')
