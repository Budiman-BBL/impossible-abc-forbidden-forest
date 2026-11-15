import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const [src, dst, ...keep] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!keep.includes(a.getName())) { for (const s of a.listSamplers()) { s.dispose(); } for (const c of a.listChannels()) c.dispose(); a.dispose(); }
// drop the mannequin mesh + skin, keep the bone nodes
for (const n of root.listNodes()) { if (n.getMesh()) { n.setMesh(null); } if (n.getSkin()) n.setSkin(null); }
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMeshes()) m.dispose();
for (const a of root.listAccessors()) if (a.listParents().every(p => p === root)) a.dispose();
await doc.transform(prune({ keepLeaves: true }));
console.log(root.listAnimations().map(a => a.getName()), root.listNodes().length);
await io.write(dst, doc);
