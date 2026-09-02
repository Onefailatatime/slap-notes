// Data: media, trash, exports, the workspace.json mirror, backup/restore,
// persistence, print, and the in-bar menus.
const { Session, sleep } = require("./harness.js");
const { reporter, box, click, sidebarNote, headerLabel, headerText, slashPopup, newNote, noteCount, hookDownloads } = require("./helpers.js");

const zipEntries = `(async () => {
  const b = window.__qaBlobs[window.__qaBlobs.length - 1];
  if (!b) return null;
  const buf = new Uint8Array(await b.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eo = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  const count = dv.getUint16(eo + 10, true);
  let p = dv.getUint32(eo + 16, true);
  const names = [];
  for (let i = 0; i < count; i++) {
    const nl = dv.getUint16(p + 28, true);
    names.push(new TextDecoder().decode(buf.slice(p + 46, p + 46 + nl)));
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return JSON.stringify({ type: b.type, names });
})()`;

module.exports = async function dataSuite(s) {
  const { ok, bad, results } = reporter();
  console.log("\nData, exports & menus");
  // ── media ────────────────────────────────────────────────────────────
  await newNote(s, "QA media");
  await s.type("/", 0); await sleep(500);
  const img = await box(s, `(() => { const p = ${slashPopup}; return p ? [...p.querySelectorAll('button')].find(b => /^Image/.test(b.textContent.trim())) : null; })()`);
  if (!img) bad("slash menu offers Image");
  else {
    await s.clickAt(img.x, img.y); await sleep(800);
    // feed the hidden input rather than opening the OS file picker
    await s.eval(`(() => {
      const input = [...document.querySelectorAll('input[type=file]')].find(i => !(i.getAttribute('accept') || '').includes('json'));
      if (!input) return false;
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2NkYPjPQApgYhhVMKpgVMGoAtIVAAAoUAF/CDBQvgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([png], 'qa-dot.png', { type: 'image/png' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(1800);
    const block = await s.eval(`(() => { const p = Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(x => x.title === 'QA media').pop(); const b = p && p.blocks.find(b => b.type === 'image'); return !!(b && b.mediaId); })()`);
    block ? ok("image block stores a media id") : bad("image block stores a media id");
    (await s.eval(`!!document.querySelector('.print-area img')`)) ? ok("image renders") : bad("image renders");
    const count = await s.eval(`new Promise(res => { const q = indexedDB.open('slap-notes-media'); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('media')) return res(0); const tx = db.transaction('media','readonly'); const c = tx.objectStore('media').count(); c.onsuccess = () => { db.close(); res(c.result); }; }; q.onerror = () => res(-1); })`);
    count > 0 ? ok("media saved to IndexedDB", count + " item(s)") : bad("media saved to IndexedDB");
  }

  // ── exports ──────────────────────────────────────────────────────────
  await hookDownloads(s);
  await s.normalView();
  const openExport = async (item) => {
    await s.revealBar();
    await click(s, headerLabel("export and backup"));
    await click(s, `[...document.querySelectorAll('header button')].find(b => ${item}.test(b.textContent))`, 1200);
  };

  await openExport("/Export this note/i");
  const md = await s.eval(`(async () => { const b = window.__qaBlobs[window.__qaBlobs.length-1]; return b ? JSON.stringify({ type: b.type, head: (await b.text()).slice(0, 40) }) : null; })()`);
  md && md.includes("markdown") ? ok("export note (.md)", md) : bad("export note (.md)", md);

  await openExport("/Export vault/i");
  await sleep(1200);
  const zip = JSON.parse((await s.eval(zipEntries)) || "null") || {};
  const names = zip.names || [];
  zip.type === "application/zip" && names.some(n => n.startsWith("notes/")) && names.includes("all-notes.html") && names.includes("README.txt")
    ? ok("export vault (.zip)", names.length + " entries") : bad("export vault (.zip)", JSON.stringify(names.slice(0, 5)));
  names.some(n => n.startsWith("attachments/"))
    ? ok("vault zip carries attachments", names.filter(n => n.startsWith("attachments/"))[0]) : bad("vault zip carries attachments");

  await openExport("/Backup everything/i");
  const backupText = await s.eval(`(async () => { const b = window.__qaBlobs[window.__qaBlobs.length-1]; return b ? await b.text() : null; })()`);
  let backup = null;
  try { backup = JSON.parse(backupText); } catch (e) {}
  backup && backup.app === "slap-notes"
    ? ok("backup everything (.json)", Object.keys(backup.workspace.pages).length + " notes, " + backup.media.length + " media")
    : bad("backup everything (.json)");

  // ── trash ────────────────────────────────────────────────────────────
  await s.normalView();
  const victim = await box(s, sidebarNote("QA media"));
  if (!victim) bad("sidebar lists the note to delete");
  else {
    await s.rightClickAt(victim.x, victim.y); await sleep(600);
    await click(s, `[...document.querySelectorAll('button')].find(b => /^delete/i.test(b.textContent.trim()))`, 1000);
    (await s.eval(`(() => { const p = Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).find(p => p.title === 'QA media'); return !!(p && p.deletedAt); })()`))
      ? ok("delete moves a note to the trash", "confirm: " + (s.lastDialog || "")) : bad("delete moves a note to the trash");
    await click(s, `[...document.querySelectorAll('button')].find(b => /trash/i.test(b.getAttribute('aria-label') || ''))`, 800);
    await click(s, `(() => { const panels = [...document.querySelectorAll('div')].filter(d => /trash/i.test(d.textContent) && (d.className||'').includes('fixed inset-0')); const p = panels[panels.length-1]; return p ? [...p.querySelectorAll('button')].find(b => b.textContent.trim() === 'Restore') : null; })()`, 1200);
    (await s.eval(`(() => { const p = Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).find(p => p.title === 'QA media'); return !!(p && !p.deletedAt); })()`))
      ? ok("trash restores a note") : bad("trash restores a note");
    await s.key("Escape"); await sleep(400);
  }

  // ── persistence and the disk mirror ──────────────────────────────────
  const before = await noteCount(s);
  await s.send("Page.reload", { ignoreCache: false });
  await sleep(2500);
  const after = await noteCount(s);
  before === after ? ok("notes survive a reload", after + " notes") : bad("notes survive a reload", `${before} → ${after}`);
  const mirrored = await s.eval(`(async () => { const r = await fetch('/api/notes?vault=1'); const j = await r.json(); return Object.keys((j.workspace || {}).pages || {}).length; })()`);
  mirrored === after ? ok("workspace.json mirrors the vault", mirrored + " notes on disk") : bad("workspace.json mirror", `store=${after} disk=${mirrored}`);

  // ── backup → wipe → restore ──────────────────────────────────────────
  if (backupText) {
    await s.eval(`(() => { const w = JSON.parse(localStorage.getItem('slap-notes:v1')); const first = Object.values(w.pages)[0]; localStorage.setItem('slap-notes:v1', JSON.stringify({ pages: { [first.id]: first } })); return true; })()`);
    await s.send("Page.reload", { ignoreCache: false }); await sleep(2500);
    await s.revealBar();
    await click(s, headerLabel("export and backup"));
    await s.eval(`(() => {
      const input = [...document.querySelectorAll('input[type=file]')].find(i => (i.getAttribute('accept') || '').includes('json'));
      if (!input) return false;
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(backupText)}], 'qa-backup.json', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(3000);
    const restored = await noteCount(s);
    restored === Object.keys(backup.workspace.pages).length
      ? ok("backup → wipe → restore round trip", restored + " notes back")
      : bad("backup → wipe → restore round trip", `expected ${Object.keys(backup.workspace.pages).length}, got ${restored}`);
  }

  // ── print ────────────────────────────────────────────────────────────
  const printCss = await s.eval(`(() => {
    let media = 0, noPrint = 0;
    for (const sheet of document.styleSheets) {
      try { for (const rule of sheet.cssRules) {
        if (rule.type === CSSRule.MEDIA_RULE && /print/.test(rule.conditionText || '')) { media++; for (const r of rule.cssRules) if (/no-print/.test(r.selectorText || '')) noPrint++; }
      } } catch (e) {}
    }
    return JSON.stringify({ media, noPrint, chrome: document.querySelectorAll('.no-print').length });
  })()`);
  JSON.parse(printCss).noPrint > 0 ? ok("print stylesheet hides the chrome", printCss) : bad("print stylesheet", printCss);

  // ── in-bar menus ─────────────────────────────────────────────────────
  await s.normalView();
  // a toolbar dropdown left open swallows the first click elsewhere
  await s.clickAt(700, 500); await sleep(400);
  for (const name of ["File", "Edit", "View", "Window", "Help"]) {
    await s.revealBar();
    const opened = await click(s, `[...document.querySelectorAll('#slap-menu-strip button')].find(b => b.textContent === ${JSON.stringify(name)})`);
    const items = await s.eval(`(() => { const p = document.querySelector('#slap-menu-strip .absolute'); return p ? p.querySelectorAll('button').length : 0; })()`);
    if (opened && items > 2) ok("menu " + name, items + " items");
    else {
      const why = await s.eval(`JSON.stringify({ header: !!document.querySelector('header'), strip: !!document.querySelector('#slap-menu-strip'), bar: document.body.className, focus: /exit focus/i.test(document.body.innerText) })`);
      bad("menu " + name, "items=" + items + " " + why);
    }
    await s.key("Escape"); await sleep(250);
  }
  const zoom0 = await s.eval(`window.devicePixelRatio`);
  await s.revealBar();
  await click(s, `[...document.querySelectorAll('#slap-menu-strip button')].find(b => b.textContent === 'View')`);
  await click(s, `[...document.querySelectorAll('#slap-menu-strip .absolute button')].find(b => /Zoom In/.test(b.textContent))`);
  const zoom1 = await s.eval(`window.devicePixelRatio`);
  zoom1 > zoom0 ? ok("View → Zoom In (shell bridge)") : bad("View → Zoom In (shell bridge)");
  await s.revealBar();
  await click(s, `[...document.querySelectorAll('#slap-menu-strip button')].find(b => b.textContent === 'View')`);
  await click(s, `[...document.querySelectorAll('#slap-menu-strip .absolute button')].find(b => /Actual Size/.test(b.textContent))`);
  (await s.eval(`window.devicePixelRatio`)) === zoom0 ? ok("View → Actual Size") : bad("View → Actual Size");

  await s.shot("data");
  return results;
};
