import numpy as np, cv2, sys, json, os
from scipy import ndimage as ndi
def key(path, t0=10, t1=26):
    bgr = cv2.imread(path); img = bgr[:, :, ::-1].astype(np.float32)
    h, w = img.shape[:2]
    border = np.concatenate([img[:4].reshape(-1,3), img[-4:].reshape(-1,3), img[:, :4].reshape(-1,3), img[:, -4:].reshape(-1,3)])
    bg = np.median(border, 0)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    bgl = cv2.cvtColor(np.uint8([[bg[::-1]]]), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    d = np.linalg.norm((lab - bgl) * np.array([0.5, 1, 1]), axis=2)
    a = np.clip((d - t0) / (t1 - t0), 0, 1)
    m = np.minimum(img[..., 0], img[..., 2]) - img[..., 1]
    a = np.minimum(a, 1 - np.clip((m - 18) / 40, 0, 1))
    # fill holes inside the silhouette that happen to be near bg colour
    solid = ndi.binary_fill_holes(a > 0.5)
    a = np.where(solid & (a < 0.5) & ~ndi.binary_erosion(~solid, iterations=1), np.maximum(a, 0), a)
    ae = np.maximum(a, 1e-3)[..., None]
    rgb = np.clip((img - (1 - ae) * bg) / ae, 0, 255)
    rgb = np.where(a[..., None] > 0.02, rgb, 0)
    # despill: limit magenta excess on edge pixels
    edge = (a < 0.98)[..., None]
    g = rgb[..., 1:2]; mx = np.maximum(g, np.minimum(rgb[..., 0:1], rgb[..., 2:3]))
    rgb = np.where(edge, np.concatenate([np.minimum(rgb[..., 0:1], mx + 40), g, np.minimum(rgb[..., 2:3], mx + 20)], 2), rgb)
    return np.dstack([rgb, a * 255]).astype(np.uint8), bg
def components(rgba, min_area=400, merge=6):
    m = rgba[..., 3] > 128
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=merge))
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        sub = (lab[sl] == i + 1) & m[sl]
        if sub.sum() < min_area: continue
        crop = rgba[sl].copy(); crop[..., 3] = np.where(lab[sl] == i + 1, crop[..., 3], 0)
        out.append((sl[1].start, sl[0].start, crop))
    out.sort(key=lambda t: (t[1] // 150, t[0]))
    return out
def save(rgba, path, pad=4):
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    c = rgba[max(ys.min()-pad,0):ys.max()+pad+1, max(xs.min()-pad,0):xs.max()+pad+1]
    cv2.imwrite(path, cv2.cvtColor(c, cv2.COLOR_RGBA2BGRA)); return c.shape
