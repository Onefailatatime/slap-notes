#!/usr/bin/env python3
"""Set the version inside an Electron app.asar's package.json.

The app reports its version via app.getVersion(), which reads package.json
from inside the asar. Without this, a release would ship with the previous
version stamped in and the update check would compare against the wrong number.

    bump-asar-version.py <app.asar> <version>
"""
import json, struct, sys, pathlib

def read(path):
    d = path.read_bytes()
    hs = struct.unpack("<I", d[12:16])[0]
    hdr = json.loads(d[16:16 + hs].decode("utf-8").rstrip("\0"))
    base = 16 + ((hs + 3) // 4) * 4          # header is padded to 4 bytes
    out = []
    def walk(node, prefix=""):
        for k, v in node.get("files", {}).items():
            if "files" in v:
                walk(v, prefix + k + "/")
            else:
                off, size = int(v.get("offset", 0)), int(v["size"])
                out.append((prefix + k, d[base + off:base + off + size]))
    walk(hdr)
    return out

def write(path, files):
    tree, off = {"files": {}}, 0
    for name, data in files:
        node = tree
        for seg in name.split("/")[:-1]:
            node = node["files"].setdefault(seg, {"files": {}})
        node["files"][name.split("/")[-1]] = {"size": len(data), "offset": str(off)}
        off += len(data)
    hdr = json.dumps(tree, separators=(",", ":")).encode()
    hp = hdr + b"\0" * ((4 - len(hdr) % 4) % 4)
    path.write_bytes(
        struct.pack("<I", 4) + struct.pack("<I", len(hp) + 8)
        + struct.pack("<I", len(hp) + 4) + struct.pack("<I", len(hdr))
        + hp + b"".join(d for _, d in files))

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    path, version = pathlib.Path(sys.argv[1]), sys.argv[2]
    files, found = read(path), False
    out = []
    for name, data in files:
        if name == "package.json":
            pkg = json.loads(data)
            old = pkg.get("version")
            pkg["version"] = version
            data = json.dumps(pkg, indent=2).encode() + b"\n"
            found = True
            print(f"    app.asar package.json: {old} -> {version}")
        out.append((name, data))
    if not found:
        sys.exit("no package.json inside the asar")
    write(path, out)
    # read back and confirm
    for name, data in read(path):
        if name == "package.json":
            assert json.loads(data)["version"] == version, "verify failed"
    print(f"    repacked and verified ({path.stat().st_size} bytes)")

main()
