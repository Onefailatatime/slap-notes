// Minimal, closed bridge: the page may ask for a fixed set of window/OS
// actions by name, and nothing else. No node, no ipcRenderer exposure.
const { contextBridge, ipcRenderer } = require("electron");

const ACTIONS = new Set([
  "quit", "minimize", "maximize", "close", "fullscreen",
  "reload", "devtools",
  "zoom-in", "zoom-out", "zoom-reset",
  "cut", "copy", "paste", "select-all",
  "updates", "install-update", "release-page", "notes-folder", "website", "issues", "diagnostics",
]);

contextBridge.exposeInMainWorld("slapShell", {
  run: (action) =>
    ACTIONS.has(action) ? ipcRenderer.invoke("slap:shell", action) : Promise.resolve(false),
  info: () => ipcRenderer.invoke("slap:info"),
});
