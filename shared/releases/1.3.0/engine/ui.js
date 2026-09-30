import { ENGINE_VERSION, GENERATORS } from "./version.js";
import { PALETTES } from "./palettes.js";
import { seedToString } from "./rng.js";
import { FINISHES } from "./finish.js";
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
export function createUI(app) {
  const adapter = app.adapter,
    panel = element("aside", "panel");
  panel.id = "controls";
  panel.setAttribute("aria-label", `${adapter.label} generator controls`);
  const controls = [],
    lockButtons = [],
    listeners = [];
  const status = element("p", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const header = element("div", "head"),
    title = element("h1", null, `${adapter.label} Generator`),
    seed = element("span", "seed");
  header.append(title, seed);
  panel.append(header);
  function report(error) {
    app.notice = error.message || "This action could not finish.";
    app.sync();
  }
  function button(text, action, className = "act") {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", async () => {
      try {
        app.notice = "";
        await action();
      } catch (error) {
        report(error);
      }
    });
    controls.push({ node });
    return node;
  }
  function lock(key, label) {
    const node = button("Hold", () => app.toggleLock(key), "lock");
    node.setAttribute("aria-label", `Lock ${label}`);
    lockButtons.push({ key, node });
    return node;
  }
  function heading(label, key) {
    const row = element("div", "section-heading");
    row.append(element("h2", null, label));
    if (key) row.append(lock(key, label));
    panel.append(row);
  }
  const generate = button(
    `Generate new ${adapter.noun}`,
    () => app.reroll(),
    "dice",
  );
  panel.append(generate);
  const history = element("div", "toolbar");
  const undo = button("Undo", () => app.undo()),
    redo = button("Redo", () => app.redo()),
    frame = button("Frame", () => app.reframe()),
    rotate = button("Pause", () => app.toggleRotation());
  history.append(undo, redo, frame, rotate);
  panel.append(history);
  heading(adapter.typeLabel || "Type", "archetype");
  const types = element("div", "chips"),
    typeButtons = {};
  for (const [key, type] of Object.entries(adapter.archetypes)) {
    const node = button(type.label, () => app.setArchetype(key), "chip");
    controls[controls.length - 1].key = "archetype";
    typeButtons[key] = node;
    types.append(node);
  }
  panel.append(types);
  heading("Look", "look");
  const looks = element("div", "chips"),
    lookButtons = {};
  for (const [key, look] of Object.entries(adapter.styles)) {
    const node = button(look.label, () => app.setStyle(key), "chip");
    controls[controls.length - 1].key = "look";
    lookButtons[key] = node;
    looks.append(node);
  }
  panel.append(looks);
  heading("World palette", "palette");
  const palettes = element("div", "chips"),
    paletteButtons = {};
  for (const [key, palette] of Object.entries(PALETTES)) {
    const node = button(palette.label, () => app.setPalette(key), "chip");
    controls[controls.length - 1].key = "palette";
    paletteButtons[key] = node;
    palettes.append(node);
  }
  panel.append(palettes);
  heading("Shape finish", "finish");
  const finishes = element("div", "chips"),
    finishButtons = {};
  for (const [key, finish] of Object.entries(FINISHES)) {
    const node = button(finish.label, () => app.setFinish(key), "chip");
    controls[controls.length - 1].key = "finish";
    finishButtons[key] = node;
    finishes.append(node);
  }
  panel.append(finishes);
  const fields = element("details", "tuning");
  fields.append(element("summary", null, "Shape & parameter locks"));
  const fieldBody = element("div", "details-body");
  fields.append(fieldBody);
  panel.append(fields);
  const sliders = [];
  function groupedInput(input) {
    input.addEventListener("pointerdown", () => app.beginEdit());
    input.addEventListener("keydown", (event) => {
      if (event.key.startsWith("Arrow")) app.beginEdit();
    });
    input.addEventListener("change", () => app.endEdit());
    input.addEventListener("blur", () => app.endEdit());
  }
  for (const spec of adapter.sliders) {
    const row = element("div", "slider"),
      top = element("div", "sl-top"),
      label = element("label", "sl-label", spec.label),
      value = element("output", "sl-val"),
      input = element("input");
    input.id = `parameter-${spec.key}`;
    label.htmlFor = input.id;
    input.type = "range";
    input.min = spec.min;
    input.max = spec.max;
    input.step = spec.step;
    input.addEventListener("input", () =>
      app.setSlider(spec.key, Number(input.value)),
    );
    groupedInput(input);
    top.append(label, value, lock(spec.key, spec.label));
    row.append(top, input);
    fieldBody.append(row);
    controls.push({ node: input, key: spec.key });
    sliders.push({ row, input, value, spec });
  }
  const options = [];
  if (adapter.options?.length) {
    const section = element("details", "tuning");
    section.open = true;
    section.append(
      element("summary", null, adapter.optionsLabel || "Architecture & parts"),
    );
    const body = element("div", "details-body");
    section.append(body);
    panel.append(section);
    for (const spec of adapter.options) {
      const row = element("div", "option-row"),
        label = element("label", null, spec.label),
        input = element(spec.values ? "select" : "input");
      input.id = `option-${spec.key}`;
      label.htmlFor = input.id;
      if (spec.values)
        for (const choice of spec.values) {
          const option = element("option", null, choice.label);
          option.value = String(choice.value);
          input.append(option);
        }
      else input.type = "checkbox";
      input.addEventListener("change", () => {
        const choice = spec.values?.find(
          (item) => String(item.value) === input.value,
        );
        app.setOption(spec.key, spec.values ? choice.value : input.checked);
      });
      row.append(label, input, lock(spec.key, spec.label));
      body.append(row);
      controls.push({ node: input, key: spec.key, available: spec.available });
      options.push({ row, input, spec });
    }
  }
  heading("Custom color", "color");
  const hueRow = element("div", "slider"),
    hueTop = element("div", "sl-top"),
    hueLabel = element("label", "sl-label", adapter.colorLabel || "Hue"),
    swatch = element("span", "swatch"),
    hue = element("input");
  hue.id = "parameter-color";
  hueLabel.htmlFor = hue.id;
  hue.type = "range";
  hue.min = 0;
  hue.max = 1;
  hue.step = 0.005;
  hue.addEventListener("input", () => app.setHue(Number(hue.value)));
  groupedInput(hue);
  controls.push({ node: hue, key: "color" });
  hueTop.append(hueLabel, swatch);
  hueRow.append(hueTop, hue);
  panel.append(hueRow);
  const exports = element("div", "actions");
  exports.append(
    button("GLB", () => app.exportGLB()),
    button("OBJ + MTL", () => app.exportOBJ()),
    button("GIF", () => app.exportGIF()),
    button("Share model", async () => {
      const url = app.shareURL();
      try {
        await navigator.clipboard.writeText(url);
        app.notice = "Model link copied.";
      } catch {
        linkBox.value = url;
        linkBox.hidden = false;
        linkBox.select();
        app.notice = "Copy the model link below.";
      }
      app.sync();
    }),
  );
  panel.append(exports);
  const linkBox = element("input", "share-link");
  linkBox.type = "text";
  linkBox.readOnly = true;
  linkBox.hidden = true;
  linkBox.setAttribute("aria-label", "Link to copy");
  panel.append(linkBox);
  const library = element("details", "tuning");
  library.append(element("summary", null, "Favorites & collection"));
  const body = element("div", "details-body");
  library.append(body);
  const libraryActions = element("div", "library-actions");
  libraryActions.append(
    button("Favorite this model", () => app.addFavorite()),
    button("Add 4 variations", () => app.addVariants()),
  );
  body.append(libraryActions);
  const collectionList = element("div", "collection-list");
  body.append(collectionList);
  const batch = element("div", "batch-actions"),
    format = element("select");
  format.setAttribute("aria-label", "Collection export format");
  for (const [value, label] of [
    ["glb", "GLB models"],
    ["obj", "OBJ + MTL models"],
  ]) {
    const option = element("option", null, label);
    option.value = value;
    format.append(option);
  }
  controls.push({ node: format });
  const zip = button("Download ZIP", () => app.exportCollection(format.value));
  batch.append(format, zip);
  body.append(batch);
  panel.append(library);
  const storage = element("p", "storage-note"),
    workspace = button("Copy workspace link", async () => {
      const link = app.store.link();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        app.notice = "Workspace link copied. It reopens your saved models.";
      } catch {
        linkBox.value = link;
        linkBox.hidden = false;
        linkBox.select();
        app.notice = "Copy this workspace link to reopen saved models.";
      }
      app.sync();
    }),
    retry = button("Retry automatic save", async () => {
      await app.flushStorage();
    });
  panel.append(storage, workspace, retry, status);
  panel.append(
    element(
      "p",
      "hint",
      "Drag to orbit. Pinch or scroll to zoom. OBJ needs its MTL file.",
    ),
  );
  document.body.append(panel);
  const toggle = button(
    "Controls",
    () => {
      panel.classList.toggle("hidden");
      toggle.setAttribute(
        "aria-expanded",
        String(!panel.classList.contains("hidden")),
      );
    },
    "collapse",
  );
  toggle.setAttribute("aria-controls", panel.id);
  document.body.append(toggle);
  const mobile = matchMedia("(max-width: 600px)");
  function adapt() {
    panel.classList.toggle("hidden", mobile.matches);
    toggle.setAttribute("aria-expanded", String(!mobile.matches));
  }
  mobile.addEventListener("change", adapt);
  adapt();
  document.querySelector(".generator-nav")?.remove();
  document.querySelector(".generator-version")?.remove();
  const navigation = element("nav", "generator-nav");
  navigation.setAttribute("aria-label", "3D generators");
  const menu = element("details"),
    summary = element("summary", null, "Switch generator"),
    links = element("div", "generator-menu");
  menu.append(summary, links);
  for (const generator of GENERATORS) {
    const link = element("a", null, generator.label);
    link.href = `https://3d.mediageni.com/${generator.path}/`;
    if (generator.id === adapter.id) link.setAttribute("aria-current", "page");
    links.append(link);
  }
  const all = element("a", "all-generators", "All generators");
  all.href = "https://3d.mediageni.com/";
  links.append(all);
  navigation.append(menu);
  document.body.append(navigation);
  const version = element("div", "generator-version", `v${ENGINE_VERSION}`);
  version.setAttribute("aria-label", `Engine version ${ENGINE_VERSION}`);
  document.body.append(version);
  const keyboard = (event) => {
    if (
      event.target.matches("input,select,textarea") ||
      (!event.ctrlKey && !event.metaKey)
    )
      return;
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? app.redo() : app.undo();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      app.redo();
    }
  };
  document.addEventListener("keydown", keyboard);
  let entrySignature = "";
  app.sync = () => {
    for (const [key, node] of Object.entries(finishButtons)) {
      node.classList.toggle("on", key === app.finishKey);
      node.setAttribute("aria-pressed", String(key === app.finishKey));
    }
    seed.textContent = `#${seedToString(app.params.seed)}`;
    for (const control of controls)
      control.node.disabled =
        app.busy ||
        (control.key && app.locked(control.key)) ||
        (control.available && !control.available(app.params));
    undo.disabled = app.busy || !app.canUndo;
    redo.disabled = app.busy || !app.canRedo;
    rotate.textContent = app.rotating ? "Pause" : "Rotate";
    rotate.setAttribute("aria-pressed", String(app.rotating));
    for (const { key, node } of lockButtons) {
      node.textContent = app.locked(key) ? "Held" : "Hold";
      node.classList.toggle("on", app.locked(key));
      node.setAttribute("aria-pressed", String(app.locked(key)));
    }
    for (const [key, node] of Object.entries(typeButtons)) {
      node.classList.toggle("on", key === app.params.archetype);
      node.setAttribute("aria-pressed", String(key === app.params.archetype));
    }
    for (const [key, node] of Object.entries(lookButtons)) {
      node.classList.toggle("on", key === app.styleKey);
      node.setAttribute("aria-pressed", String(key === app.styleKey));
    }
    for (const [key, node] of Object.entries(paletteButtons)) {
      node.classList.toggle("on", key === app.paletteKey);
      node.setAttribute("aria-pressed", String(key === app.paletteKey));
    }
    for (const { row, input, value, spec } of sliders) {
      row.hidden = !!(
        (spec.kinds && !spec.kinds.includes(app.params.kind)) ||
        (spec.forms && !spec.forms.includes(app.params.form))
      );
      const v = adapter.getDerived(app.params, spec.key);
      input.value = v;
      value.textContent =
        spec.step >= 1
          ? String(Math.round(v))
          : Number(v).toFixed(spec.step < 0.01 ? 3 : 2);
    }
    for (const { row, input, spec } of options) {
      if (spec.values) input.value = String(app.params[spec.key]);
      else input.checked = app.params[spec.key];
      row.classList.toggle(
        "unavailable",
        !!spec.available && !spec.available(app.params),
      );
    }
    const color = adapter.colorKey
      ? app.params.color[adapter.colorKey]
      : app.params.color;
    hue.value = color.h;
    swatch.style.background = `hsl(${color.h * 360} ${color.s * 100}% ${color.l * 100}%)`;
    const signature = JSON.stringify(
      app.entries.map((s) => [s.id, s.title, s.favorite]),
    );
    if (signature !== entrySignature) {
      entrySignature = signature;
      collectionList.replaceChildren();
      for (const entry of app.entries) {
        const row = element("div", "collection-item"),
          load = element(
            "button",
            "collection-load",
            `${entry.favorite ? "★ " : ""}${entry.title}`,
          );
        load.type = "button";
        load.addEventListener("click", () => app.useEntry(entry.id));
        const remove = element("button", "collection-remove", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${entry.title}`);
        remove.addEventListener("click", () => app.removeEntry(entry.id));
        row.append(load, remove);
        collectionList.append(row);
      }
    }
    for (const node of collectionList.querySelectorAll("button"))
      node.disabled = app.busy;
    zip.disabled = app.busy || !app.entries.length;
    library.querySelector("summary").textContent =
      `Favorites & collection (${app.entries.length})`;
    status.textContent = app.progress || app.notice;
    const mode = app.store.mode;
    storage.textContent =
      mode === "saved"
        ? "Automatically saved on this site. Keep your workspace link to reopen after clearing cookies or on another device."
        : mode === "saving"
          ? "Saving your workspace…"
          : mode === "error"
            ? "Automatic save failed. Current changes are in this session; retry to store them."
            : "Session only on this copy. Model links and downloads remain available; favorites do not survive closing this page.";
    workspace.hidden = !app.store.link();
    retry.hidden = mode !== "error";
  };
  return {
    dispose() {
      mobile.removeEventListener("change", adapt);
      document.removeEventListener("keydown", keyboard);
      panel.remove();
      toggle.remove();
      navigation.remove();
      version.remove();
      for (const dispose of listeners) dispose();
      app.sync = () => {};
    },
  };
}
