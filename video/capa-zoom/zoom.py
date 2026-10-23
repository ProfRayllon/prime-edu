#!/usr/bin/env python3
"""Gera o vídeo de zoom lento da foto da capa (capa_zoom.mp4).
Requisitos: pip install pillow  ·  ffmpeg no PATH.
Ajuste ZOOM (quanto aproxima), DUR (segundos do zoom) e HOLD (segundos parado no fim)."""
from PIL import Image
import math, os, subprocess, shutil
ZOOM, DUR, HOLD, FPS = 1.10, 22, 58, 30
CX, CY = 0.54, 0.46          # ponto para onde o zoom caminha (0–1)
src = Image.open(os.path.join(os.path.dirname(__file__), "capa_estudante.jpg")).convert("RGB")
W, H = src.size
shutil.rmtree("kb", ignore_errors=True); os.makedirs("kb")
N = DUR * FPS
for i in range(N):
    e = math.sin((i / (N - 1)) * math.pi / 2)          # desacelera até parar
    s = 1 + (ZOOM - 1) * e
    sx, sy = W * .5 + W * (CX - .5) * e, H * .5 + H * (CY - .5) * e
    a = 1 / s
    src.transform((W, H), Image.AFFINE, (a, 0, sx - W / 2 * a, 0, a, sy - H / 2 * a), resample=Image.BICUBIC).save(f"kb/f{i:04d}.jpg", quality=93)
subprocess.run(f'ffmpeg -y -loglevel error -framerate {FPS} -i kb/f%04d.jpg -vf "tpad=stop_mode=clone:stop_duration={HOLD}" '
               '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart capa_zoom.mp4', shell=True, check=True)
print("Pronto: capa_zoom.mp4 — copie para ../../assets/capa-zoom.mp4")
