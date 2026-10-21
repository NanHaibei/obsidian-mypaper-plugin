"""Package only public release assets, never the developer's vault or runtime data."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
out = root / "dist"
plugin = out / manifest["id"]
assets = ["main.js", "manifest.json", "styles.css", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]
if not (root / "main.js").is_file():
    raise SystemExit("Run npm run build before packaging")
if plugin.exists():
    shutil.rmtree(plugin)
plugin.mkdir(parents=True)
for name in assets:
    shutil.copy2(root / name, plugin / name)
archive = out / f'{manifest["id"]}-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for name in assets:
        bundle.write(plugin / name, f'{manifest["id"]}/{name}')
release_files = [out / name for name in ["manifest.json", "main.js", "styles.css"]]
for file in release_files:
    shutil.copy2(root / file.name, file)
files = [*release_files, archive]
(out / "SHA256SUMS.txt").write_text("".join(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n" for file in files), encoding="utf-8")
print(archive)
