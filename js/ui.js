// DOM control panel. Builds itself, then drives the app through its methods.

import { ARCHETYPES, ARCHETYPE_KEYS, SLIDERS, getDerived } from './params.js';
import { STYLES, STYLE_KEYS } from './styles.js';
import { seedToString } from './rng.js';

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

export function createUI(app) {
  const panel = el('aside', 'panel');

  const head = el('div', 'head');
  head.append(el('h1', null, 'LOW POLY TREE GENERATOR'));
  const seed = el('div', 'seed');
  head.append(seed);
  panel.append(head);

  const dice = el('button', 'dice', '🎲  Generate new tree');
  dice.onclick = () => app.reroll();
  panel.append(dice);

  panel.append(el('label', 'group-label', 'Shape'));
  const typeRow = el('div', 'chips');
  const typeBtns = {};
  for (const k of ARCHETYPE_KEYS) {
    const b = el('button', 'chip', ARCHETYPES[k].label);
    b.onclick = () => app.setArchetype(k);
    typeBtns[k] = b; typeRow.append(b);
  }
  panel.append(typeRow);

  panel.append(el('label', 'group-label', 'Look'));
  const styleRow = el('div', 'chips');
  const styleBtns = {};
  for (const k of STYLE_KEYS) {
    const b = el('button', 'chip', STYLES[k].label);
    b.onclick = () => app.setStyle(k);
    styleBtns[k] = b; styleRow.append(b);
  }
  panel.append(styleRow);

  panel.append(el('label', 'group-label', 'Tune'));
  const sliders = {};
  for (const s of SLIDERS) {
    const row = el('div', 'slider');
    const lab = el('span', 'sl-label', s.label);
    const val = el('span', 'sl-val');
    const top = el('div', 'sl-top'); top.append(lab, val);
    const input = el('input');
    input.type = 'range'; input.min = s.min; input.max = s.max; input.step = s.step;
    input.oninput = () => { app.setSlider(s.key, parseFloat(input.value)); };
    row.append(top, input);
    sliders[s.key] = { input, val, step: s.step, row, kinds: s.kinds };
    panel.append(row);
  }

  panel.append(el('label', 'group-label', 'Paint'));
  const hueRow = el('div', 'slider');
  const swatch = el('span', 'swatch');
  const hTop = el('div', 'sl-top'); hTop.append(el('span', 'sl-label', 'Leaf hue'), swatch);
  const hue = el('input');
  hue.type = 'range'; hue.min = 0; hue.max = 1; hue.step = 0.005;
  hue.oninput = () => app.setHue(parseFloat(hue.value));
  hueRow.append(hTop, hue);
  panel.append(hueRow);

  const actions = el('div', 'actions');
  const glb = el('button', 'act', '↓ GLB');
  const obj = el('button', 'act', '↓ OBJ');
  const gif = el('button', 'gif-save', '↓ Save rotation GIF');
  const share = el('button', 'act', '🔗 Share');
  glb.onclick = () => app.exportGLB();
  obj.onclick = () => app.exportOBJ();
  gif.onclick = async () => {
    gif.disabled = true;
    try {
      await app.exportGIF((done, total) => { gif.textContent = `GIF ${Math.round(done / total * 100)}%`; });
      gif.textContent = 'Saved!';
    } catch (error) {
      console.error('GIF export failed', error);
      gif.textContent = 'Failed';
    } finally {
      setTimeout(() => { gif.textContent = '↓ Save rotation GIF'; gif.disabled = false; }, 1200);
    }
  };
  share.onclick = async () => {
    try { await navigator.clipboard.writeText(app.shareURL()); flash(share, 'Copied!'); }
    catch { history.replaceState(null, '', app.shareURL()); flash(share, 'In URL bar'); }
  };
  actions.append(glb, obj, share);
  panel.append(actions);

  panel.append(el('div', 'hint', 'Drag to rotate · scroll to zoom'));
  document.body.append(panel);
  document.body.append(gif);

  const toggle = el('button', 'collapse', '⚙');
  const mobile = matchMedia('(max-width: 560px)');
  panel.classList.toggle('hidden', mobile.matches);
  mobile.addEventListener('change', (event) => panel.classList.toggle('hidden', event.matches));
  toggle.onclick = () => panel.classList.toggle('hidden');
  document.body.append(toggle);

  function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1100);
  }

  app.sync = function () {
    const p = app.params;
    seed.textContent = '#' + seedToString(p.seed);
    for (const k of ARCHETYPE_KEYS) typeBtns[k].classList.toggle('on', k === p.archetype);
    for (const k of STYLE_KEYS) styleBtns[k].classList.toggle('on', k === app.styleKey);
    const kind = p.kind || 'broadleaf';
    for (const s of SLIDERS) {
      const sl = sliders[s.key];
      sl.row.style.display = (!sl.kinds || sl.kinds.includes(kind)) ? '' : 'none';
      const v = getDerived(p, s.key);
      if (v != null) { sl.input.value = v; sl.val.textContent = s.step >= 1 ? String(Math.round(v)) : (+v).toFixed(2); }
    }
    const fc = p.color.foliage;
    hue.value = fc.h;
    swatch.style.background = `hsl(${fc.h * 360} ${fc.s * 100}% ${fc.l * 100}%)`;
  };
}
