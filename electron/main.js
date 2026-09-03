const { app, BrowserWindow, shell, Menu, clipboard, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// Fixed port so the loopback origin (and therefore localStorage / IndexedDB)
// stays stable across launches — otherwise the local-first data would reset
// every time the app restarts.
const PORT = 39741;

let serverProc = null;
let win = null;

function serverDir() {
  // Packaged: Resources/app-server ; dev: ../.next/standalone
  return app.isPackaged
    ? path.join(process.resourcesPath, "app-server")
    : path.join(__dirname, "..", ".next", "standalone");
}

function startServer(port) {
  const dir = serverDir();
  serverProc = spawn(process.execPath, [path.join(dir, "server.js")], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: "inherit",
  });
  serverProc.on("error", (err) => console.error("[slap-notes] server error", err));
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const ping = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (++tries > 150) return reject(new Error("server did not start"));
        setTimeout(ping, 100);
      });
    };
    ping();
  });
}

const LOADING_HTML = `data:text/html,${encodeURIComponent(`
<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#070809;color:#C5F74F;font-family:system-ui">
<div style="text-align:center"><div style="font-size:15px;font-weight:600;letter-spacing:-.01em">Slap <span style="color:#C5F74F">Notes</span></div>
<div style="margin-top:8px;color:#52555c;font-size:12px">Starting your second brain…</div></div>
</body></html>`)}`;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: "#070809",
    title: "Slap Notes",
    // Keep the window's own menu bar out of the way: it stays hidden until
    // Alt is pressed, so nothing sits above the app's (auto-hiding) top bar.
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(LOADING_HTML);
  win.once("ready-to-show", () => win.show());

  // Check once per launch, quietly. The Help menu can still be used to check on
  // demand; this only speaks up when there is actually something newer, so a
  // user who never opens the menu still hears about releases.
  win.webContents.once("did-finish-load", () => {
    setTimeout(showWelcomeOnce, 900);
    setTimeout(() => {
      checkForUpdates()
        .then((r) => {
          if (r && r.status === "update") {
            showUpdateBanner(r.latest, lastReleaseUrl || WEBSITE);
          }
        })
        .catch(() => {});
    }, 8000);
  });
  // Open external links in the user's browser, keep app links in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function isUp(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on("error", () => resolve(false));
  });
}


// ── Application menu ────────────────────────────────────────────────────────
// The bar stays hidden (autoHideMenuBar) until Alt is pressed. Items that act
// on the note itself drive the page's own controls, so the menu and the
// in-app toolbar can never disagree about what an action does.

const REPO = "Onefailatatime/slap-notes"; // ← set to your GitHub owner/repo
const WEBSITE = "https://slapnotes.com";
const X_HANDLE = "jessyka_boat";
// Author photo, inlined so the greeting works offline and needs no asset path
// inside app.asar. Source image: electron/assets/author.jpg
const AUTHOR_AVATAR =
  "data:image/jpeg;base64,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";

function runInPage(js) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(js, true).catch(() => {});
}

// Click a toolbar control by its accessible label.
function clickLabel(label) {
  runInPage(
    "(()=>{const b=document.querySelector('header button[aria-label=' + " +
      JSON.stringify(JSON.stringify(label)) +
      " + ']'); if (b) b.click();})()"
  );
}

// Click a toolbar control by its visible text ("New", "Templates", "Today").
function clickText(text) {
  runInPage(
    "(()=>{const t=" + JSON.stringify(text) +
      ";const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.trim()===t); if (b) b.click();})()"
  );
}

// Open the export menu, then pick one of its entries by label.
function clickExportItem(text) {
  runInPage(
    "(async()=>{const t=" + JSON.stringify(text) + ";" +
      "const d=document.querySelector('header button[aria-label=\"export and backup\"]');" +
      "if(!d)return; if(!document.querySelector('header .absolute'))d.click();" +
      "await new Promise(r=>setTimeout(r,120));" +
      "const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.trim()===t); if(b)b.click();})()"
  );
}

// Hand a keyboard shortcut back to the page: the menu swallows the accelerator,
// so the app's own handler has to be invoked explicitly.
function sendKey(key, opts) {
  const init = Object.assign({ key: key, bubbles: true, cancelable: true, ctrlKey: true }, opts || {});
  runInPage(
    "document.dispatchEvent(new KeyboardEvent('keydown'," + JSON.stringify(init) + "))"
  );
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(/[.-]/);
  const pb = String(b).replace(/^v/, "").split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i], 10);
    const nb = parseInt(pb[i], 10);
    if (isNaN(na) && isNaN(nb)) continue;
    if (isNaN(na)) return -1;
    if (isNaN(nb)) return 1;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

// Manual only, never on launch: a local-first app should not phone home
// unless the person asks it to. Returns a result the page renders itself —
// GTK message boxes do not map reliably under Wayland.
let lastReleaseUrl = null;

// Shown once, on first launch only. Injected from the main process so it does
// not depend on the renderer bundle, and dismissed state lives in the page's
// own localStorage.
// ---------------------------------------------------------------------------
// One-click update.
//
// The app installs to /opt via pacman, which is root-owned, so applying an
// update needs elevation. pkexec raises exactly one polkit prompt and pacman -U
// keeps the package database honest, so the system does not end up with files
// pacman does not know about. There is no way to avoid the prompt for a
// system-installed package - an AppImage build is the passwordless route.
// ---------------------------------------------------------------------------

// Where we are installed decides how - and whether - we can update ourselves.
//   portable : running from a directory the user owns. We can drop the new
//              version alongside and relaunch into it. No elevation, one click.
//   pacman   : /opt is root-owned. pkexec, one password prompt. Unavoidable.
//   appimage : single file the user owns; handled like portable.
function installKind() {
  if (process.env.APPIMAGE) return "appimage";
  if (process.execPath.startsWith("/opt/") || process.execPath.startsWith("/usr/")) return "pacman";
  try {
    fs.accessSync(portableRoot(), fs.constants.W_OK);
    return "portable";
  } catch (e) {
    return "pacman";
  }
}

// <root>/slap-notes-<version>/app/slap-notes  ->  <root>
function portableRoot() {
  return path.dirname(path.dirname(path.dirname(process.execPath)));
}

// Download the release tarball, verify it, unpack it beside the current
// version, then relaunch into it. The running install is never modified, so a
// failure part-way through leaves the working copy untouched.
async function selfUpdatePortable(meta) {
  const latest = String(meta.tag_name || "").replace(/^v/, "");
  const asset = (meta.assets || []).find((a) => /-linux-x64\.tar\.zst$/.test(a.name));
  const sums = (meta.assets || []).find((a) => a.name === "SHA256SUMS");
  if (!asset) return { status: "error", detail: "This release has no portable build attached." };

  const root = portableRoot();
  const tmp = path.join(os.tmpdir(), asset.name);

  progress(0, "Downloading " + latest + "…");
  await downloadTo(asset.browser_download_url, tmp, (f) => progress(f, "Downloading…"));

  if (sums) {
    progress(1, "Verifying…");
    const text = await fetchText(sums.browser_download_url);
    const line = text.split("\n").find((l) => l.includes(asset.name));
    if (line) {
      const want = line.trim().split(/\s+/)[0];
      const got = await sha256Of(tmp);
      if (want !== got) {
        try { fs.unlinkSync(tmp); } catch (e) {}
        return { status: "error", detail: "Checksum did not match. Download discarded." };
      }
    }
  }

  progress(1, "Unpacking…");
  const ok = await new Promise((resolve) => {
    const p = spawn("tar", ["-I", "zstd", "-xf", tmp, "-C", root], { stdio: "ignore" });
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (!ok) return { status: "error", detail: "Could not unpack the update." };

  const next = path.join(root, "slap-notes-" + latest, "app", "slap-notes");
  if (!fs.existsSync(next)) return { status: "error", detail: "Unpacked build looks wrong." };
  try { fs.chmodSync(next, 0o755); } catch (e) {}

  progress(1, "Restarting…");
  setTimeout(() => { app.relaunch({ execPath: next }); app.exit(0); }, 600);
  return { status: "installed" };
}

function httpsGetFollow(url, onResponse, onError) {
  const req = https.get(
    url,
    { headers: { "User-Agent": "slap-notes/" + app.getVersion(), Accept: "application/octet-stream" } },
    (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();                       // GitHub redirects release assets to a CDN
        return httpsGetFollow(res.headers.location, onResponse, onError);
      }
      onResponse(res);
    }
  );
  req.on("error", onError);
  req.setTimeout(120000, () => req.destroy(new Error("the download timed out")));
}

function downloadTo(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    httpsGetFollow(
      url,
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("GitHub replied " + res.statusCode));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let seen = 0;
        const file = fs.createWriteStream(dest);
        res.on("data", (c) => {
          seen += c.length;
          if (total) onProgress(seen / total);
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      },
      reject
    );
  });
}

function sha256Of(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpsGetFollow(
      url,
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(b));
      },
      reject
    );
  });
}

function progress(pct, label) {
  runInPage(
    "window.__slapUpdateProgress && window.__slapUpdateProgress(" +
      JSON.stringify(pct) + "," + JSON.stringify(label) + ")"
  );
}

async function downloadAndInstallUpdate() {
  const kind = installKind();

  try {
    progress(0, "Looking for the latest release…");
    const meta = JSON.parse(await fetchText("https://api.github.com/repos/" + REPO + "/releases/latest"));

    // Portable and AppImage installs live in the user's own space, so they can
    // update with no password at all.
    if (kind === "portable" || kind === "appimage") return await selfUpdatePortable(meta);

    const assets = meta.assets || [];
    const pkg = assets.find((a) => /\.pkg\.tar\.zst$/.test(a.name));
    const sums = assets.find((a) => a.name === "SHA256SUMS");
    if (!pkg) return { status: "error", detail: "This release has no Arch package attached." };

    const dest = path.join(os.tmpdir(), pkg.name);
    progress(0, "Downloading " + (meta.tag_name || "") + "…");
    await downloadTo(pkg.browser_download_url, dest, (f) => progress(f, "Downloading…"));

    // Verify before handing anything to pacman.
    if (sums) {
      progress(1, "Verifying…");
      const text = await fetchText(sums.browser_download_url);
      const line = text.split("\n").find((l) => l.includes(pkg.name));
      if (line) {
        const want = line.trim().split(/\s+/)[0];
        const got = await sha256Of(dest);
        if (want !== got) {
          fs.unlinkSync(dest);
          return { status: "error", detail: "Checksum did not match. Download discarded." };
        }
      }
    }

    progress(1, "Installing — approve the password prompt…");
    const ok = await new Promise((resolve) => {
      const p = spawn("pkexec", ["pacman", "-U", "--noconfirm", dest], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
    try { fs.unlinkSync(dest); } catch (e) {}
    if (!ok) return { status: "error", detail: "Install was cancelled or failed." };

    progress(1, "Restarting…");
    setTimeout(() => { app.relaunch(); app.exit(0); }, 600);
    return { status: "installed" };
  } catch (err) {
    return { status: "error", detail: String((err && err.message) || err) };
  }
}

// The update prompt. Injected rather than built into the renderer bundle so it
// stays in the main process alongside the code that actually performs the
// update, and cannot be broken by a change to the app's own UI.
function showUpdateBanner(latest, url) {
  const kind = installKind();
  const d = {
    latest: latest, url: url, current: app.getVersion(),
    canInstall: true,
    // Only a system install has to ask for a password.
    needsAuth: kind === "pacman",
  };
  runInPage(
    "(function(d){" +
    "if(document.querySelector('[data-slap-update]'))return;" +
    "var css='position:fixed;left:16px;bottom:16px;z-index:9999;width:330px;background:#18181b;color:#e4e4e7;" +
      "border:1px solid #3f3f46;border-left:3px solid #a3e635;border-radius:10px;padding:13px 15px;" +
      "font:13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)';" +
    "var b=document.createElement('div');b.setAttribute('data-slap-update','');b.style.cssText=css;" +
    "var sub=d.needsAuth?'Installs with one password prompt.':'One click. No password needed.';" +
    "b.innerHTML='<div style=\"font-weight:600;color:#a3e635\">Slap Notes '+d.latest+' is out</div>'+" +
      "'<div style=\"color:#a1a1aa;margin:3px 0 10px\">You have '+d.current+'. '+sub+'</div>'+" +
      "'<div data-bar style=\"display:none;height:5px;background:#27272a;border-radius:3px;overflow:hidden;margin-bottom:9px\">'+" +
        "'<div data-fill style=\"height:100%;width:0;background:#a3e635;transition:width .2s\"></div></div>'+" +
      "'<div data-msg style=\"display:none;color:#a1a1aa;margin-bottom:9px\"></div>'+" +
      "'<div data-actions style=\"display:flex;align-items:center;gap:9px\">'+" +
        "'<button data-go type=\"button\" style=\"background:#a3e635;color:#0a0a0a;border:0;border-radius:7px;" +
          "padding:6px 13px;font:inherit;font-weight:700;cursor:pointer\">'+(d.canInstall?'Update now':'Open release')+'</button>'+" +
        "'<a href=\"'+d.url+'\" target=\"_blank\" rel=\"noreferrer noopener\" style=\"color:#a3e635;text-decoration:none\">What\\'s new</a>'+" +
        "'<button data-later type=\"button\" style=\"margin-left:auto;background:none;border:0;color:#71717a;cursor:pointer;font:inherit\">Later</button>'+" +
      "'</div>';" +
    "var bar=b.querySelector('[data-bar]'),fill=b.querySelector('[data-fill]'),msg=b.querySelector('[data-msg]');" +
    "window.__slapUpdateProgress=function(pct,label){" +
      "bar.style.display='block';msg.style.display='block';" +
      "fill.style.width=Math.round((pct||0)*100)+'%';msg.textContent=label||'';};" +
    "b.querySelector('[data-later]').onclick=function(){" +
      "try{localStorage.setItem('slap-notes:update-dismissed',d.latest);}catch(e){}b.remove();};" +
    "b.querySelector('[data-go]').onclick=function(){" +
      "var go=b.querySelector('[data-go]');go.disabled=true;go.style.opacity=.6;go.textContent='Working…';" +
      "b.querySelector('[data-later]').remove();" +
      "window.slapShell.run('install-update').then(function(r){" +
        "if(!r||r.status==='installed')return;" +
        "if(r.status==='manual'){b.remove();return;}" +
        "go.disabled=false;go.style.opacity=1;go.textContent='Try again';" +
        "msg.style.display='block';msg.textContent=(r.detail||'Update failed.');" +
      "}).catch(function(){go.disabled=false;go.style.opacity=1;go.textContent='Try again';});};" +
    "try{if(localStorage.getItem('slap-notes:update-dismissed')===d.latest)return;}catch(e){}" +
    "(document.body||document.documentElement).appendChild(b);" +
    "})(" + JSON.stringify(d) + ");"
  );
}

function showWelcomeOnce() {
  const payload = {
    avatar: AUTHOR_AVATAR,
    handle: X_HANDLE,
    url: "https://x.com/" + X_HANDLE,
  };
  runInPage(
    "(function(d){try{" +
      "if(localStorage.getItem('slap-notes:welcomed'))return;" +
      "localStorage.setItem('slap-notes:welcomed','1');" +
    "}catch(e){}" +
    "if(document.querySelector('[data-slap-welcome]'))return;" +
    "var w=document.createElement('div');w.setAttribute('data-slap-welcome','');" +
    "w.style.cssText='position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(3px)';" +
    "var c=document.createElement('div');" +
    "c.style.cssText='max-width:440px;margin:20px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:16px;padding:28px 26px;font:14px/1.6 system-ui,-apple-system,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6);text-align:center';" +
    "c.innerHTML='<img src=\"'+d.avatar+'\" alt=\"Jessyka\" style=\"width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid #a3e635;display:block;margin:0 auto 14px\">'+" +
      "'<div style=\"font-size:19px;font-weight:700;color:#a3e635;margin-bottom:10px\">Thank you for downloading</div>'+" +
      "'<p style=\"margin:0 0 12px;color:#d4d4d8\">This started as a personal app. I wanted to share it on Omarchy because I believe in the OS, and I was inspired by <a href=\"https://x.com/dhh\" target=\"_blank\" rel=\"noreferrer noopener\" style=\"color:#a3e635;text-decoration:none\">@dhh</a>.</p>'+" +
      "'<p style=\"margin:0 0 12px;color:#d4d4d8\">I hope you enjoy it.</p>'+" +
      "'<p style=\"margin:0 0 20px;color:#a1a1aa\">Having trouble, or just want to connect? DM me on X at <a href=\"'+d.url+'\" target=\"_blank\" rel=\"noreferrer noopener\" style=\"color:#a3e635;text-decoration:none;font-weight:600\">@'+d.handle+'</a>.</p>'+" +
      "'<button type=\"button\" style=\"background:#a3e635;color:#0a0a0a;border:0;border-radius:9px;padding:10px 22px;font:inherit;font-weight:700;cursor:pointer\">Start writing</button>'+" +
      "'<div style=\"margin-top:12px;font-size:12px;color:#52525b\">— Jessyka</div>';" +
    "function close(){w.remove();document.removeEventListener('keydown',onKey);}" +
    "function onKey(e){if(e.key==='Escape')close();}" +
    "c.querySelector('button').onclick=close;" +
    "w.onclick=function(e){if(e.target===w)close();};" +
    "document.addEventListener('keydown',onKey);" +
    "w.appendChild(c);(document.body||document.documentElement).appendChild(w);" +
    "})(" + JSON.stringify(payload) + ");"
  );
}

function checkForUpdates() {
  const current = app.getVersion();

  if (REPO.startsWith("OWNER/")) {
    lastReleaseUrl = WEBSITE;
    return Promise.resolve({
      status: "unconfigured",
      current: current,
      detail: "No release feed is configured for this build.",
    });
  }

  return new Promise((resolve) => {
    const req = https.get(
      {
        host: "api.github.com",
        path: "/repos/" + REPO + "/releases/latest",
        headers: {
          "User-Agent": "slap-notes/" + current,
          Accept: "application/vnd.github+json",
        },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return resolve({ status: "error", current, detail: "GitHub replied " + res.statusCode + "." });
          }
          let release;
          try {
            release = JSON.parse(body);
          } catch (err) {
            return resolve({ status: "error", current, detail: "Could not read the release feed." });
          }
          const latest = String(release.tag_name || "").replace(/^v/, "");
          if (!latest) return resolve({ status: "error", current, detail: "No release found." });

          lastReleaseUrl = release.html_url || WEBSITE;
          resolve({
            status: compareVersions(latest, current) > 0 ? "update" : "current",
            current,
            latest,
          });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("the request timed out")));
    req.on("error", (err) =>
      resolve({ status: "error", current, detail: String(err.message || err) })
    );
  });
}

// ── Shell bridge ────────────────────────────────────────────────────────────
// The menus live in the app's own top bar (renderer). Anything that needs the
// window or the OS is routed here; everything else the page does itself.
ipcMain.handle("slap:shell", (event, action) => {
  const target = BrowserWindow.fromWebContents(event.sender) || win;
  if (!target || target.isDestroyed()) return false;
  const wc = target.webContents;

  switch (action) {
    case "quit": app.quit(); return true;
    case "minimize": target.minimize(); return true;
    case "maximize":
      target.isMaximized() ? target.unmaximize() : target.maximize();
      return true;
    case "close": target.close(); return true;
    case "fullscreen": target.setFullScreen(!target.isFullScreen()); return true;
    case "reload": wc.reload(); return true;
    case "devtools": wc.toggleDevTools(); return true;
    case "zoom-in": wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5)); return true;
    case "zoom-out": wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5)); return true;
    case "zoom-reset": wc.setZoomLevel(0); return true;
    case "cut": wc.cut(); return true;
    case "copy": wc.copy(); return true;
    case "paste": wc.paste(); return true;
    case "select-all": wc.selectAll(); return true;
    case "updates": return checkForUpdates();
    case "install-update": return downloadAndInstallUpdate();
    case "release-page":
      shell.openExternal(lastReleaseUrl || WEBSITE);
      return true;
    case "notes-folder": shell.openPath(app.getPath("userData")); return true;
    case "website": shell.openExternal(WEBSITE); return true;
    case "issues":
      shell.openExternal(
        REPO.startsWith("OWNER/") ? WEBSITE : "https://github.com/" + REPO + "/issues"
      );
      return true;
    case "diagnostics":
      clipboard.writeText(
        [
          "Slap Notes " + app.getVersion(),
          "Electron " + process.versions.electron,
          "Chromium " + process.versions.chrome,
          "Node " + process.versions.node,
          process.platform + " " + process.arch,
          "userData: " + app.getPath("userData"),
        ].join("\n")
      );
      return true;
    default:
      return false;
  }
});

ipcMain.handle("slap:info", () => ({
  version: app.getVersion(),
  platform: process.platform + " " + process.arch,
  userData: app.getPath("userData"),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  website: WEBSITE,
}));

function buildMenu() {
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "New Note", accelerator: "CmdOrCtrl+N", click: () => clickText("New") },
        { label: "New from Template…", accelerator: "CmdOrCtrl+Shift+N", click: () => clickText("Templates") },
        { label: "Today's Note", accelerator: "CmdOrCtrl+T", click: () => clickText("Today") },
        { type: "separator" },
        { label: "Export This Note (.md)", click: () => clickExportItem("Export this note (.md)") },
        { label: "Export Vault (.zip)", click: () => clickExportItem("Export vault (.zip)") },
        { label: "Back Up Everything (.json)", click: () => clickExportItem("Backup everything (.json)") },
        { label: "Restore from Backup…", click: () => clickExportItem("Restore from backup…") },
        { type: "separator" },
        { label: "Print / Save as PDF", accelerator: "CmdOrCtrl+P", click: () => runInPage("window.print()") },
        { type: "separator" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => clickLabel("settings") },
        { type: "separator" },
        { role: "quit", label: "Quit Slap Notes" },
      ],
    },
    {
      label: "&Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => sendKey("z") },
        { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: () => sendKey("z", { shiftKey: true }) },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Search Notes…", accelerator: "CmdOrCtrl+K", click: () => sendKey("k") },
        { label: "Find & Replace…", accelerator: "CmdOrCtrl+Shift+F", click: () => clickLabel("find and replace") },
      ],
    },
    {
      label: "&View",
      submenu: [
        { label: "Toggle Sidebar", click: () => clickLabel("toggle sidebar") },
        { label: "Outline", click: () => clickLabel("outline") },
        { label: "Focus Mode", accelerator: "CmdOrCtrl+.", click: () => clickLabel("focus mode") },
        { type: "separator" },
        { label: "Cluster Brain", click: () => clickLabel("cluster brain") },
        { label: "AI Research", click: () => clickLabel("ai research") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "&Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "close" }],
    },
    {
      label: "&Help",
      submenu: [
        { label: "Check for Updates…", click: () => runInPage("window.__slapMenuUI && window.__slapMenuUI.updates()") },
        { type: "separator" },
        { label: "Open Notes Folder", click: () => shell.openPath(app.getPath("userData")) },
        { label: "Slap Notes Website", click: () => shell.openExternal(WEBSITE) },
        {
          label: "Report an Issue",
          click: () =>
            shell.openExternal(
              REPO.startsWith("OWNER/") ? WEBSITE : "https://github.com/" + REPO + "/issues"
            ),
        },
        {
          label: "Copy Diagnostics",
          click: () =>
            clipboard.writeText(
              [
                "Slap Notes " + app.getVersion(),
                "Electron " + process.versions.electron,
                "Chromium " + process.versions.chrome,
                "Node " + process.versions.node,
                process.platform + " " + process.arch,
                "userData: " + app.getPath("userData"),
              ].join("\n")
            ),
        },
        { type: "separator" },
        { label: "About Slap Notes", click: () => runInPage("window.__slapMenuUI && window.__slapMenuUI.about()") },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();
  createWindow();
  try {
    const already = await isUp(PORT);
    if (!already) startServer(PORT);
    await waitForServer(PORT);
    if (win) win.loadURL(`http://127.0.0.1:${PORT}/`);
  } catch (err) {
    console.error("[slap-notes]", err);
    if (win) {
      win.loadURL(
        `data:text/html,${encodeURIComponent(
          `<body style="background:#070809;color:#F73D55;font-family:system-ui;padding:40px">Failed to start Slap Notes: ${String(err)}</body>`
        )}`
      );
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProc) serverProc.kill();
});
