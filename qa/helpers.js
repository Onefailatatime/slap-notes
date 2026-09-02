// Small helpers shared by the suites: reporting, element clicks by predicate,
// and the note-creation flow the editor tests build on.
const { sleep } = require("./harness.js");

function reporter() {
  const results = [];
  return {
    ok(name, detail = "") { results.push({ pass: true, name }); console.log("  PASS  " + name + (detail ? "  — " + detail : "")); },
    bad(name, detail = "") { results.push({ pass: false, name }); console.log("  FAIL  " + name + (detail ? "  — " + detail : "")); },
    results,
    tally() { return { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length }; },
  };
}

const box = (s, expr) => s.eval(`(() => {
  const el = ${expr};
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);

async function click(s, expr, settle = 700) {
  const b = await box(s, expr);
  if (!b) return false;
  await s.clickAt(b.x, b.y);
  await sleep(settle);
  return true;
}

const sidebarNote = (t) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith(${JSON.stringify(t)}))`;
const headerText = (t) => `[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`;
const headerLabel = (l) => `document.querySelector('header button[aria-label=${JSON.stringify(l)}]')`;
// the slash menu renders as a `fixed` popup, identified by its own contents
const slashPopup = `(() => { const p = [...document.querySelectorAll('div')].filter(d => /Heading 1/.test(d.textContent) && d.querySelectorAll('button').length > 3); return p[p.length - 1]; })()`;

async function newNote(s, title) {
  await s.revealBar();
  await click(s, headerText("New"));
  await s.clickSelector('.print-area input[class*="text-4xl"]');
  await s.type(title, 12);
  await sleep(200);
  await s.key("Enter");
  await sleep(400);
  if (!(await s.eval("document.activeElement.isContentEditable"))) {
    await s.clickSelector(".print-area .cursor-text");
    await sleep(300);
  }
}

const pageBlocks = (s, title) => s.eval(`(() => {
  const ws = JSON.parse(localStorage.getItem('slap-notes:v1') || '{"pages":{}}');
  const p = Object.values(ws.pages).filter(p => p.title === ${JSON.stringify(title)}).pop();
  return p ? p.blocks.map(b => ({ type: b.type, text: (b.text || '').slice(0, 40) })) : null;
})()`);

const noteCount = (s) => s.eval(`Object.keys(JSON.parse(localStorage.getItem('slap-notes:v1') || '{"pages":{}}').pages).length`);

// capture blobs the app hands to the browser (exports, backups)
const hookDownloads = (s) => s.eval(`(() => {
  if (!window.__qaHooked) {
    window.__qaBlobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { window.__qaBlobs.push(b); return orig(b); };
    window.__qaHooked = true;
  }
  return true;
})()`);

module.exports = { reporter, box, click, sidebarNote, headerText, headerLabel, slashPopup, newNote, pageBlocks, noteCount, hookDownloads };
