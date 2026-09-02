// Entry point: attaches to a Slap Notes window started with a debugging port,
// runs every suite against a throwaway vault, and reports.
const { Session, sleep } = require("./harness.js");

(async () => {
  const s = await Session.attach(Number(process.env.QA_CDP_PORT || 9223));
  await s.send("Page.enable");
  await s.send("Runtime.enable");

  // start from seeded demo notes every time
  await s.eval("localStorage.clear(); indexedDB.deleteDatabase('slap-notes-media'); true");
  await s.send("Page.reload", { ignoreCache: true });
  await sleep(3000);
  await s.normalView();

  const boot = await s.eval(`JSON.stringify({
    url: location.href,
    notes: Object.keys(JSON.parse(localStorage.getItem('slap-notes:v1') || '{"pages":{}}').pages).length,
    menuStrip: !!document.querySelector('#slap-menu-strip'),
    shellBridge: !!window.slapShell
  })`);
  console.log("Slap Notes QA — " + boot);

  const all = [];
  for (const suite of ["./editor.js", "./linking.js", "./data.js"]) {
    all.push(...(await require(suite)(s)));
  }

  const failed = all.filter((r) => !r.pass);
  console.log(`\n${all.length - failed.length}/${all.length} passed`);
  if (failed.length) {
    console.log("failed:");
    for (const f of failed) console.log("  - " + f.name);
  }
  s.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("harness error: " + e.message);
  process.exit(2);
});
