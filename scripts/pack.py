"""把 dist 打成一个可直接上传商店 / 解压加载的 zip。"""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RELEASE = ROOT / "release"

if not DIST.exists():
    raise SystemExit("dist 不存在，先跑 npm run build")

version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

manifest = json.loads((DIST / "manifest.json").read_text(encoding="utf-8"))
required = [
    manifest["side_panel"]["default_path"],
    manifest["devtools_page"],
    manifest["background"]["service_worker"],
    *manifest["icons"].values(),
]
missing = [path for path in required if not (DIST / path).exists()]
if missing:
    raise SystemExit(f"dist 缺少文件: {missing}")

for html in ("sidepanel.html", "panel.html", "replay.html"):
    text = (DIST / html).read_text(encoding="utf-8")
    for ref in ("/assets/",):
        if ref not in text:
            raise SystemExit(f"{html} 没有引用构建产物")

RELEASE.mkdir(exist_ok=True)
target = RELEASE / f"hackbar-clone-v{version}.zip"

with zipfile.ZipFile(
    target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
) as zf:
    for path in sorted(DIST.rglob("*")):
        if path.is_dir():
            continue
        zf.write(path, path.relative_to(DIST).as_posix())

size_kb = target.stat().st_size / 1024
print(f"packed {target} ({size_kb:.1f} KB, {len(zipfile.ZipFile(target).namelist())} files)")
