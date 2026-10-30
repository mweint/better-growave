"""Make a reproducible, source-only Mozilla upload archive."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
source = root / "extension"
manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8-sig"))
files = ["manifest.json", "core.js", "cart.js", "content.js"]
assert set(manifest["content_scripts"][0]["js"]) == set(files[1:])
destination = root / "dist" / f"better-growave-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
    for filename in sorted(files):
        info = ZipInfo(filename, date_time=(2020, 1, 1, 0, 0, 0))
        info.create_system = 3  # Keep ZIP metadata identical on Windows and Linux.
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        # Normalize line endings so Windows and CI produce the same bytes.
        archive.writestr(info, (source / filename).read_text(encoding="utf-8-sig").encode("utf-8"))
with ZipFile(destination) as archive:
    assert set(archive.namelist()) == set(files)
    assert archive.testzip() is None
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix(".zip.sha256").write_text(f"{digest}  {destination.name}\n", encoding="utf-8")
print(f"Built {destination.name}\nSHA-256 {digest}")
