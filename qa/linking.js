// Linking and navigation: wiki links, backlinks, tags, search, templates,
// daily note, outline, focus mode, the graph, undo/redo, find & replace.
const { Session, sleep } = require("./harness.js");
const { reporter, box, click, sidebarNote, headerText, headerLabel, newNote } = require("./helpers.js");

module.exports = async function linkingSuite(s) {
  const { ok, bad, results } = reporter();
  console.log("\nLinking & navigation");
  await newNote(s, "QA link source");
  await s.type("See [[Research", 25);
  await sleep(700);
  (await s.eval(`[...document.querySelectorAll('button')].some(b => /Research Hub/.test(b.textContent) && b.closest('[class*="fixed"],[class*="absolute"]'))`))
    ? ok("[[ suggests existing notes") : bad("[[ suggests existing notes");
  await s.key("Enter");
  await sleep(600);
  const text = await s.eval(`(() => { const p = Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(p => p.title === 'QA link source').pop(); return p ? p.blocks.map(b => b.text).join(' ') : ''; })()`);
  /\[\[Research Hub\]\]/.test(text) ? ok("wiki link inserted", text.slice(0, 40)) : bad("wiki link inserted", text);

  await click(s, sidebarNote("Research Hub"), 900);
  (await s.eval(`/QA link source/.test(document.body.innerText) && /BACKLINK/i.test(document.body.innerText)`))
    ? ok("backlink shows on the target note") : bad("backlink shows on the target note");

  await click(s, sidebarNote("QA link source"), 700);
  await s.clickSelector(".print-area .cursor-text"); await sleep(400);
  await s.type("[[QA brand new", 28);
  await sleep(900);
  const create = await box(s, `(() => { const pops = [...document.querySelectorAll('div')].filter(d => (d.className||'').match(/fixed|absolute/) && d.querySelectorAll('button').length); const p = pops[pops.length-1]; return p ? [...p.querySelectorAll('button')].find(b => /Create/i.test(b.textContent)) : null; })()`);
  if (create) {
    await s.clickAt(create.x, create.y); await sleep(900);
    (await s.eval(`Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).some(p => p.title === 'QA brand new')`))
      ? ok("[[ creates a missing note") : bad("[[ creates a missing note");
  } else bad("[[ offers to create a missing note");

  await newNote(s, "QA tags");
  await s.type("tagged with #qatag here", 18);
  await sleep(500);
  await click(s, sidebarNote("Welcome to Slap Notes"));
  await click(s, sidebarNote("QA tags"), 900);
  (await s.eval(`/qatag/.test(document.body.innerText)`)) ? ok("#tag renders and lists in the sidebar") : bad("#tag renders and lists in the sidebar");

  await s.chord("k", 2);
  await sleep(700);
  (await s.eval(`!!document.querySelector('input[placeholder*="Search" i]')`)) ? ok("⌘K opens search") : bad("⌘K opens search");
  await s.type("Cluster Brain", 22);
  await sleep(800);
  await s.key("Enter");
  await sleep(1000);
  (await s.eval(`document.querySelector('.print-area input[class*="text-4xl"]')?.value`)) === "Cluster Brain"
    ? ok("search opens the chosen note") : bad("search opens the chosen note");

  await s.revealBar();
  await click(s, headerText("Templates"));
  const meeting = await box(s, `[...document.querySelectorAll('button')].find(b => /Meeting Notes/.test(b.textContent))`);
  if (meeting) {
    await s.clickAt(meeting.x, meeting.y); await sleep(900);
    const blocks = await s.eval(`(() => { const p = Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(p => /Meeting/.test(p.title)).pop(); return p ? p.blocks.length : 0; })()`);
    blocks > 2 ? ok("template creates a filled note", blocks + " blocks") : bad("template creates a filled note");
  } else bad("template gallery lists Meeting Notes");

  await s.revealBar();
  await click(s, headerText("Today"));
  const title = await s.eval(`document.querySelector('.print-area input[class*="text-4xl"]')?.value || ''`);
  /\d{4}/.test(title) ? ok("Today opens a daily note", title) : bad("Today opens a daily note", title);

  await click(s, sidebarNote("Welcome to Slap Notes"), 800);
  await s.revealBar();
  await click(s, headerLabel("outline"));
  (await s.eval(`/Blocks & the slash menu/.test(document.body.innerText)`)) ? ok("outline lists headings") : bad("outline lists headings");
  await s.key("Escape"); await sleep(300);

  // undo / redo (the store save is debounced, so give it time)
  await click(s, sidebarNote("QA tags"), 700);
  await s.clickSelector(".print-area .cursor-text"); await sleep(400);
  await s.type("scratch line", 18); await sleep(1800);
  const withEdit = await s.eval(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(p=>p.title==='QA tags').pop().blocks.map(b=>b.text))`);
  withEdit.includes("scratch line") ? ok("typing reaches the store") : bad("typing reaches the store", withEdit);
  await s.chord("z", 2); await sleep(1200);
  const undone = await s.eval(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(p=>p.title==='QA tags').pop().blocks.map(b=>b.text))`);
  !undone.includes("scratch line") ? ok("⌘Z undo") : bad("⌘Z undo", undone);
  await s.chord("z", 2 | 8); await sleep(1200);
  (await s.eval(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).filter(p=>p.title==='QA tags').pop().blocks.map(b=>b.text))`)).includes("scratch line")
    ? ok("⌘⇧Z redo") : bad("⌘⇧Z redo");

  await s.revealBar();
  await click(s, headerLabel("find and replace"), 900);
  if (await s.eval(`/Find & replace/i.test(document.body.innerText)`)) {
    ok("find & replace opens");
    const fi = await box(s, `[...document.querySelectorAll('input')].find(i => /find/i.test(i.placeholder||''))`);
    await s.clickAt(fi.x, fi.y); await s.type("qatag", 18); await sleep(300);
    const ri = await box(s, `[...document.querySelectorAll('input')].find(i => /replace/i.test(i.placeholder||''))`);
    await s.clickAt(ri.x, ri.y); await s.type("qalabel", 18); await sleep(300);
    await click(s, `[...document.querySelectorAll('button')].find(b => /Replace all/i.test(b.textContent))`, 1200);
    (await s.eval(`Object.values(JSON.parse(localStorage.getItem('slap-notes:v1')).pages).map(p => p.blocks.map(b => b.text).join(' ')).join(' ')`)).includes("qalabel")
      ? ok("replace all rewrites across notes") : bad("replace all rewrites across notes");
  } else bad("find & replace opens");
  await s.key("Escape"); await sleep(400);

  await s.normalView();
  const chrome = () => s.eval(`JSON.stringify({
    header: !!document.querySelector('header'),
    sidebar: [...document.querySelectorAll('div')].some(d => (d.className||'').includes('w-[268px]')),
    exit: /exit focus/i.test(document.body.innerText)
  })`);
  const before = JSON.parse(await chrome());
  await s.revealBar();
  await click(s, headerLabel("focus mode"), 1200);
  await sleep(600);
  const after = JSON.parse(await chrome());
  before.header && !after.header && after.exit
    ? ok("focus mode hides the chrome")
    : bad("focus mode hides the chrome", `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await s.normalView();

  await s.revealBar();
  await click(s, headerLabel("cluster brain"), 1500);
  const nodes = await s.eval(`document.querySelectorAll('svg circle').length`);
  nodes > 3 ? ok("Cluster Brain draws the graph", nodes + " nodes") : bad("Cluster Brain draws the graph");
  await s.shot("linking");
  await s.key("Escape"); await sleep(400);
  await s.normalView();

  return results;
};
