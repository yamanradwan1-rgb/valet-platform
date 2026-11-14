export const staffPublicResetStyle = `
:root {
  color-scheme: light;
  --background: #f5f7fb;
  --card: #fff;
  --text: #182238;
  --muted: #5a6780;
  --edge: #dbe1ec;
  --blue: #174ca4;
  --button-blue: #174ca4;
  --blue-hover: #123d86;
  --focus: #2563eb;
  --error: #b42318;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --background: #101625;
  --card: #1b2538;
  --text: #f1f5ff;
  --muted: #b5c3d8;
  --edge: #3c4a61;
  --blue: #86b4ff;
  --button-blue: #24529a;
  --blue-hover: #3161b3;
  --focus: #8cb7ff;
  --error: #fda29b;
}
* { box-sizing: border-box; }
html { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; min-height: 100vh; background: var(--background); color: var(--text); }
main { display: grid; min-height: 100vh; padding: 1.5rem; place-items: center; }
article { width: min(100%, 29rem); padding: clamp(1.25rem, 5vw, 2rem); border: 1px solid var(--edge); border-radius: 1rem; background: var(--card); box-shadow: 0 1rem 3rem rgb(14 23 48 / 8%); }
.tools { display: flex; justify-content: flex-end; gap: .65rem; }
.brand { margin: 1.25rem 0 .3rem; color: var(--blue); font-size: .76rem; font-weight: 750; letter-spacing: .2em; }
h1 { margin: .3rem 0 .75rem; font-size: clamp(1.45rem, 5vw, 1.9rem); line-height: 1.3; }
p { line-height: 1.6; }
.muted { color: var(--muted); }
form { margin-top: 1.35rem; }
.field { margin: 1rem 0; }
label { display: block; font-weight: 650; margin-bottom: .4rem; }
input { width: 100%; min-height: 2.75rem; padding: .6rem .75rem; background: var(--card); color: var(--text); border: 1px solid var(--edge); border-radius: .5rem; font: inherit; }
button, .sign-in { cursor: pointer; min-height: 2.75rem; padding: .6rem .9rem; border: 1px solid var(--edge); border-radius: .5rem; background: var(--card); color: var(--text); font: inherit; text-align: center; }
button.primary { width: 100%; border-color: var(--button-blue); color: #fff; background: var(--button-blue); font-weight: 650; }
button.primary:hover { background: var(--blue-hover); }
button:disabled { cursor: default; opacity: .65; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
#reset-feedback { min-height: 1.5rem; color: var(--error); }
#reset-complete { padding-top: 1rem; }
.sign-in { display: inline-block; text-decoration: none; color: var(--blue); }
[hidden] { display: none !important; }
@media (max-width: 420px) { main { padding: .75rem; } article { border-radius: .75rem; } }
@media (prefers-reduced-motion: no-preference) { button { transition: background-color .14s ease; } }
`;
