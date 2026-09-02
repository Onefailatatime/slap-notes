// Editor: markdown shortcuts, the slash menu, inline styles, math, code.
const { Session, sleep } = require("./harness.js");
const { reporter, box, click, slashPopup, newNote, pageBlocks, sidebarNote } = require("./helpers.js");

module.exports = async function editorSuite(s) {
  const { ok, bad, results } = reporter();
  console.log("\nEditor");

  // markdown shortcuts, one clean note each so lists cannot bleed between cases
  const shortcuts = [
    ["# ", "h1", "Heading one"], ["## ", "h2", "Heading two"], ["### ", "h3", "Heading three"],
    ["- ", "bullet", "a bullet"], ["1. ", "numbered", "first item"], ["[] ", "todo", "a task"],
    ["> ", "quote", "a quotation"],
  ];
  for (const [prefix, type, text] of shortcuts) {
    const title = "QA md " + type;
    await newNote(s, title);
    await s.type(prefix + text);
    await sleep(500);
    const blocks = await pageBlocks(s, title);
    const first = blocks && blocks[0];
    first && first.type === type
      ? ok(`markdown '${prefix.trim()}' → ${type}`)
      : bad(`markdown '${prefix.trim()}' → ${type}`, JSON.stringify(first));
  }
  for (const [marker, type] of [["```", "code"], ["---", "divider"]]) {
    const title = "QA md " + type;
    await newNote(s, title);
    await s.type(marker, 0);
    await sleep(600);
    const blocks = await pageBlocks(s, title);
    (blocks || []).some(b => b.type === type)
      ? ok(`markdown '${marker}' → ${type}`)
      : bad(`markdown '${marker}' → ${type}`, JSON.stringify(blocks));
  }

  // slash menu
  for (const [label, type] of [
    ["Callout", "callout"], ["Quote", "quote"], ["To-do", "todo"], ["Toggle", "toggle"],
    ["Table", "table"], ["Divider", "divider"], ["Heading 3", "h3"], ["Bulleted list", "bullet"], ["Code", "code"],
  ]) {
    const title = "QA slash " + type;
    await newNote(s, title);
    await s.type("/", 0);
    await sleep(500);
    const item = await box(s, `(() => { const p = ${slashPopup}; return p ? [...p.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})) : null; })()`);
    if (!item) { bad("slash menu offers " + label); await s.key("Escape"); continue; }
    await s.clickAt(item.x, item.y);
    await sleep(600);
    const blocks = await pageBlocks(s, title);
    (blocks || []).some(b => b.type === type)
      ? ok("slash menu → " + label)
      : bad("slash menu → " + label, JSON.stringify((blocks || []).map(b => b.type)));
  }

  // blocks render formatted once they are no longer being edited
  const leaveBlock = async (title) => {
    await click(s, sidebarNote("Welcome to Slap Notes"));
    await click(s, sidebarNote(title), 900);
  };

  await newNote(s, "QA inline");
  await s.type("**bold** *italic* ++under++ ~~strike~~ ==mark== `code` [link](https://slapnotes.com)", 8);
  await sleep(400);
  await leaveBlock("QA inline");
  const tags = await s.eval(`[...new Set([...document.querySelectorAll('.print-area .space-y-px *')].map(e => e.tagName.toLowerCase()))]`);
  for (const [tag, name] of [["strong","bold"],["em","italic"],["u","underline"],["s","strikethrough"],["mark","highlight"],["code","inline code"],["a","link"]]) {
    tags.includes(tag) ? ok("inline " + name) : bad("inline " + name, "no <" + tag + ">");
  }

  await newNote(s, "QA math");
  await s.type("Euler: $e^{i\\pi} + 1 = 0$", 6);
  await sleep(400);
  await leaveBlock("QA math");
  (await s.eval(`!!document.querySelector('.print-area .katex')`))
    ? ok("inline math renders (KaTeX)") : bad("inline math renders (KaTeX)");

  await newNote(s, "QA code");
  await s.type("```", 0); await sleep(500);
  await s.type("function slap(idea) { return idea.connect(); }", 6);
  await sleep(400);
  await leaveBlock("QA code");
  const pre = await s.eval(`(() => { const p = document.querySelector('.print-area pre'); return p ? p.querySelectorAll('span').length : -1; })()`);
  pre > 0 ? ok("code block highlights", pre + " spans") : bad("code block highlights", "spans=" + pre);

  await s.shot("editor");
  return results;
};
