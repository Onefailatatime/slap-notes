#!/usr/bin/env python3
"""Rebuild app.asar from the repo's electron/ source, and set the version.

Without this the release ships whatever electron/main.js happened to be baked
into the build tree, so edits made in the repo never reach users. The repo is
the source of truth for the Electron shell; the build tree only supplies the
compiled Next output.

electron-builder's own trimmed package.json is preserved - only its version
field is changed.

    sync-asar.py <repo-root> <app.asar> <version>
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
        + struct.pack("<I", len(hp) + 4) + struct.pack("<I", len(hdr)) + hp
        + b"".join(d for _, d in files))

def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    repo, asar, version = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
    existing = dict(read(asar))
    pkg = json.loads(existing["package.json"])
    old_version = pkg.get("version")
    pkg["version"] = version

    files = []
    for rel in ("electron/main.js", "electron/preload.js"):
        src = repo / rel
        if not src.exists():
            sys.exit(f"missing {src}")
        changed = existing.get(rel) != src.read_bytes()
        files.append((rel, src.read_bytes()))
        print(f"    {rel}: {'updated from repo' if changed else 'unchanged'}")
    files.append(("package.json", json.dumps(pkg, indent=2).encode() + b"\n"))
    print(f"    package.json: version {old_version} -> {version}")

    write(asar, files)

    # read back and verify what actually landed
    back = dict(read(asar))
    assert json.loads(back["package.json"])["version"] == version
    assert back["electron/main.js"] == (repo / "electron/main.js").read_bytes()
    src = back["electron/main.js"].decode("utf-8", "replace")
    repo_line = next((l.strip() for l in src.splitlines() if "const REPO" in l), "")
    if "OWNER/" in repo_line:
        sys.exit("REFUSING: electron/main.js still has the OWNER placeholder.\n"
                 "         Update checks would silently do nothing. Set the real repo first.")
    print(f"    verified: {repo_line}")
    print(f"    repacked ({asar.stat().st_size} bytes)")

main()
