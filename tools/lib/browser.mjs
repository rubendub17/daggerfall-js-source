// BENCH1 - THE BROWSER A RUN LAUNCHES (2026-10-19). Playwright asks for ONE build number of its own
// Chromium (`chromium-1194` here), and a machine almost never has that exact one: it has the
// browser the person actually uses, and playwright's cache has whatever some other version last
// downloaded. `npm run bench` therefore failed on a machine with two perfectly good Chromiums on it
// ("no browser to launch"), which is the worst kind of error - the tool blaming the user for its own
// lookup.
//
// SO THE LOOKUP IS A LADDER, most-specific first, and every rung is a browser that really runs this
// game (it is WebGL2 + Chrome's own GL, so a Chromium-family browser or nothing):
//
//   1. `CHROME` in the environment - the person said which, and that outranks everything.
//   2. playwright's own bundled browser, when it is installed - no flags, and the run is identical
//      on every machine that has it (this is what CI uses).
//   3. THE MACHINE'S DEFAULT BROWSER, resolved the way the OS resolves it: Windows' `UserChoice`
//      registry entry, whose `shell\open\command` holds the browser's own path verbatim.
//   4. A browser playwright knows by name (`channel: 'chrome'`, then `'msedge'` - Edge is on every
//      Windows machine) - playwright does that lookup itself.
//   5. The newest `chromium-<n>` in playwright's cache (what the profiler's own fallback reads).
//   6. The well-known install paths for the browsers this game is actually played in.
//
// Every rung is TRIED, not chosen: a candidate that cannot launch is a candidate that lost, and the
// next one is asked. The one that won is printed, so a run can say which browser it measured - the
// number is that browser's, and a machine's browsers do not agree with each other.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Windows' registry key for "the browser that opens a web page": its ProgId, then its command. */
const WIN_DEFAULT_KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice';

/** The Chromium-family ProgIds Windows hands out, and the browser each one is. It is a LADDER HINT
 *  and not a gate: a ProgId missing from this table is still resolved through its own
 *  `shell\open\command` and TRIED, because Opera GX - the browser this was written on - registers
 *  itself as plain `Opera`, which a table of the ones I happened to remember did not list. */
export const WIN_PROGIDS = Object.freeze({
  ChromeHTML: 'chrome.exe',
  MSEdgeHTM: 'msedge.exe',
  MSEdgeBHTML: 'msedge.exe',
  BraveHTML: 'brave.exe',
  VivaldiHTM: 'vivaldi.exe',
  Opera: 'opera.exe',
  OperaStable: 'opera.exe',
  OperaGX: 'opera.exe',
  OperaGXStable: 'opera.exe',
  ThoriumHTM: 'thorium.exe',
  ChromiumHTML: 'chrome.exe',
});

/** The one family playwright's `chromium.launch` cannot drive, whatever its ProgId says. */
const NOT_DRIVABLE = /^(Firefox|FIREFOX|AppX|Excel|Word|Acrobat|Reader)/;

/** The places these browsers install to, per platform. Best-effort: a path that is not there is
 *  skipped, and a machine with none of them still has rungs 1-5 above. */
function knownPaths() {
  const out = [];
  const win = process.env.ProgramFiles ?? 'C:\\Program Files';
  const winX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = join(homedir(), 'AppData', 'Local');
  if (process.platform === 'win32') {
    for (const base of [local, win, winX86]) {
      out.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      out.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      out.push(join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
      out.push(join(base, 'Programs', 'Opera', 'opera.exe'));
      out.push(join(base, 'Programs', 'Opera GX', 'opera.exe'));
      out.push(join(base, 'Vivaldi', 'Application', 'vivaldi.exe'));
    }
  } else if (process.platform === 'darwin') {
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    out.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    out.push('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    out.push('/Applications/Opera GX.app/Contents/MacOS/Opera');
  } else {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
      for (const dir of ['/usr/bin', '/usr/local/bin', '/snap/bin']) out.push(join(dir, bin));
    }
  }
  return out;
}

/** The browser a Windows machine opens https with - by its own registry answer, not by a guess.
 *  A ProgId the table does not know is still resolved and TRIED (Opera GX calls itself `Opera`);
 *  only a family playwright cannot drive is refused, and it says which. */
export function windowsDefaultBrowser() {
  if (process.platform !== 'win32') return null;
  let reg = null;
  try { reg = execFileSync('reg', ['query', WIN_DEFAULT_KEY, '/v', 'ProgId'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  const prog = /ProgId\s+REG_SZ\s+(\S+)/.exec(reg ?? '')?.[1];
  if (!prog) return null;
  if (NOT_DRIVABLE.test(prog)) return { label: `${prog} (the machine's default browser, which playwright cannot drive)`, executablePath: null };
  let cmd = null;
  try { cmd = execFileSync('reg', ['query', `HKCU\\Software\\Classes\\${prog}\\shell\\open\\command`, '/ve'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { cmd = null; }
  // the command is `"C:\...\browser.exe" -- "%1"`; the quoted path is the browser's own
  const path = /"([^"]+\.exe)"/i.exec(cmd ?? '')?.[1] ?? null;
  const known = WIN_PROGIDS[prog];
  return {
    label: `${prog}${known ? '' : ' (unlisted)'} - the machine's default browser`,
    executablePath: path && existsSync(path) ? path : null,
  };
}

/** The newest playwright chromium in the cache, on THIS platform's path. The `??=` that sets
 *  PLAYWRIGHT_BROWSERS_PATH to `/opt/pw-browsers` is a CI convention, and on a workstation it points
 *  at a folder that does not exist - which is how the first cut of this tool looked, found nothing,
 *  and told the user to install a browser they already had. */
export function cachedChromium() {
  const platformBase = process.platform === 'win32' ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
      : join(homedir(), '.cache', 'ms-playwright');
  const env = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const base = env && existsSync(env) ? env : platformBase;
  const bins = ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'];
  let dirs;
  try { dirs = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => parseInt(b.slice(9), 10) - parseInt(a.slice(9), 10)); } catch { return null; }
  for (const d of dirs) for (const b of bins) { const p = join(base, d, b); if (existsSync(p)) return { label: `playwright's ${d}`, executablePath: p }; }
  return null;
}

/**
 * Every way this machine can give a run a browser, best first. The caller TRIES them in order.
 * @returns {Array<{ label: string, executablePath?: string, channel?: string }>}
 */
export function browserCandidates() {
  const out = [];
  const seen = new Set();
  const add = (c) => {
    const key = c.executablePath ?? c.channel ?? 'bundled';
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  if (process.env.CHROME) add({ label: `CHROME=${process.env.CHROME}`, executablePath: process.env.CHROME });
  // THE MACHINE'S OWN BROWSER FIRST (the owner's ask: "use the default browser in the machine").
  // It is the one the person already has, and the one whose GPU the numbers belong to.
  const def = windowsDefaultBrowser();
  if (def?.executablePath) add(def);
  // the default browser's own FAMILY, by path, when its registry command could not be read: a
  // machine whose default is Opera GX answers `Opera`, and Opera's command key is not always
  // there - but the browser is on disk, and it is the one the person means by "the default".
  if (def && !def.executablePath) for (const p of familyPaths(def.label)) add({ label: p, executablePath: p });
  add({ label: 'playwright\'s own Chromium' });
  add({ label: 'the installed Chrome (playwright channel)', channel: 'chrome' });
  add({ label: 'the installed Edge (playwright channel)', channel: 'msedge' });
  const cached = cachedChromium();
  if (cached) add(cached);
  for (const p of knownPaths()) if (existsSync(p)) add({ label: p, executablePath: p });
  if (def && !def.executablePath) out.push({ label: def.label });   // said, but unusable: reported rather than hidden
  return out;
}

/** The known install paths whose browser belongs to the family a ProgId names ('Opera' -> Opera
 *  and Opera GX, 'ChromeHTML' -> Chrome). The bridge for a default whose command key is missing. */
export function familyPaths(progIdLabel = '') {
  const id = String(progIdLabel).toLowerCase();
  const families = [
    ['opera', /opera/i],
    ['chrome', /chrome|chromium|thorium/i],
    ['edge', /edge/i],
    ['brave', /brave/i],
    ['vivaldi', /vivaldi/i],
  ].find(([word]) => id.includes(word));
  if (!families) return [];
  return knownPaths().filter((p) => families[1].test(p) && existsSync(p));
}

/**
 * Launch the first candidate that works.
 * @param {any} chromium playwright's chromium
 * @param {object} opts launch options (headless, args, viewport...)
 * @param {{ onTry?: (label: string, err: Error) => void }} [hooks] `onTry` hears every rung that lost
 * @returns {Promise<{ browser: any, label: string }>}
 */
export async function launchChromium(chromium, opts, { onTry = null } = {}) {
  const tried = [];
  for (const cand of browserCandidates()) {
    if (!cand.executablePath && !cand.channel && cand.label.includes('not a Chromium')) { tried.push(cand.label); continue; }
    const launchOpts = { ...opts };
    if (cand.executablePath) launchOpts.executablePath = cand.executablePath;
    if (cand.channel) launchOpts.channel = cand.channel;
    try {
      const browser = await chromium.launch(launchOpts);
      return { browser, label: cand.label };
    } catch (err) {
      tried.push(`${cand.label}: ${String(err?.message ?? err).trim().split('\n')[0]}`);
      onTry?.(cand.label, err);
    }
  }
  throw new Error('benchmark: no browser on this machine would launch. Tried:\n  '
    + tried.join('\n  ')
    + '\nSet CHROME=<path to chrome.exe|msedge.exe> and run again (any Chromium-family browser will do: the game is WebGL2 + Chrome\'s GL).');
}
