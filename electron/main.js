const { app, BrowserWindow, shell, Menu, clipboard, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const https = require("https");

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
    setTimeout(() => {
      checkForUpdates()
        .then((r) => {
          if (r && r.status === "update") {
            runInPage("window.__slapMenuUI && window.__slapMenuUI.updates()");
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

const REPO = "OWNER/slap-notes"; // ← set to your GitHub owner/repo
const WEBSITE = "https://slapnotes.com";

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
