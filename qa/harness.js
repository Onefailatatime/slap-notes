// CDP harness: trusted input + screenshots against the running Electron app
const fs = require("fs");

const KEYS = {
  Enter: { code: "Enter", key: "Enter", vk: 13, text: "\r" },
  Backspace: { code: "Backspace", key: "Backspace", vk: 8 },
  Delete: { code: "Delete", key: "Delete", vk: 46 },
  Escape: { code: "Escape", key: "Escape", vk: 27 },
  Tab: { code: "Tab", key: "Tab", vk: 9, text: "\t" },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", vk: 39 },
  Space: { code: "Space", key: " ", vk: 32, text: " " },
};

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }

  static async attach(port = 9223) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === "page" && t.url.startsWith("http"));
    if (!page) throw new Error("no page target: " + JSON.stringify(list.map((t) => t.url)));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && s.pending.has(d.id)) { s.pending.get(d.id)(d); s.pending.delete(d.id); return; }
      // confirm()/alert() block the renderer until answered
      if (d.method === "Page.javascriptDialogOpening") {
        s.lastDialog = d.params.message;
        ws.send(JSON.stringify({ id: ++s.id, method: "Page.handleJavaScriptDialog", params: { accept: s.acceptDialogs !== false } }));
      }
    };
    s.acceptDialogs = true;
    return s;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, (d) => (d.error ? reject(new Error(method + ": " + d.error.message)) : resolve(d.result)));
      setTimeout(() => reject(new Error(method + ": timeout")), 20000);
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }

  async key(name, mods = 0) {
    const k = KEYS[name];
    if (!k) throw new Error("unknown key " + name);
    const base = { code: k.code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: mods };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    if (k.text && !mods) await this.send("Input.dispatchKeyEvent", { type: "char", text: k.text, ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  // modifiers bitmask: alt 1, ctrl 2, meta 4, shift 8
  async chord(char, mods) {
    const vk = char.toUpperCase().charCodeAt(0);
    const base = { key: char, code: "Key" + char.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  // Printable characters must NOT carry a virtual key code derived from the
  // character: '#' would arrive as VK_END and '.' as VK_DELETE.
  async type(text, delay = 30) {
    for (const ch of text) {
      const base = { key: ch, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 };
      await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
      await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      if (delay) await sleep(delay);
    }
  }

  async mouseTo(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  }

  async clickAt(x, y) {
    await this.mouseTo(x, y);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  }

  async rightClickAt(x, y) {
    await this.mouseTo(x, y);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", buttons: 2, clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", buttons: 0, clickCount: 1 });
  }

  async clickSelector(sel, nth = 0) {
    const box = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
      const el = els[${nth}];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!box || box.w === 0) throw new Error("not clickable: " + sel + " #" + nth);
    await this.clickAt(box.x, box.y);
    return box;
  }

  // the toolbar auto-hides: bring it back the way a person would
  async revealBar() {
    await this.mouseTo(700, 4);
    await sleep(300);
  }

  // back to a known view: no modal, no focus mode, sidebar visible
  async normalView() {
    // a modal left open swallows clicks meant for the toolbar
    for (let i = 0; i < 3; i++) {
      const closer = await this.eval(`(() => {
        const overlay = [...document.querySelectorAll('div')].find(d => (d.className || '').includes('fixed inset-0'));
        if (!overlay) return null;
        const b = [...overlay.querySelectorAll('button')].find(x => x.textContent.trim() === '\u00d7' || /close/i.test(x.getAttribute('aria-label') || ''));
        const el = b || overlay;
        const r = el.getBoundingClientRect();
        return { x: b ? r.x + r.width / 2 : r.x + 8, y: b ? r.y + r.height / 2 : r.y + 8 };
      })()`);
      if (!closer) break;
      await this.clickAt(closer.x, closer.y);
      await sleep(400);
    }
    for (let i = 0; i < 3; i++) {
      const exit = await this.eval(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => /exit focus/i.test(x.textContent));
        if (!b) return null;
        const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`);
      if (exit) { await this.clickAt(exit.x, exit.y); await sleep(500); } else break;
    }
    await this.key("Escape");
    await sleep(300);
    return await this.eval(`!!document.querySelector('header') && [...document.querySelectorAll('div')].some(d => (d.className||'').includes('w-[268px]'))`);
  }

  async shot(name) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    const dir = process.env.SHOT_DIR || ".";
    fs.writeFileSync(`${dir}/${name}.png`, Buffer.from(r.data, "base64"));
    return `${dir}/${name}.png`;
  }

  close() { this.ws.close(); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { Session, sleep };
