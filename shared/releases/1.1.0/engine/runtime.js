import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { ENGINE_VERSION, STATE_VERSION } from "./version.js";
import {
  initialState,
  normalizeState,
  clone,
  StateHistory,
  retainLocks,
  encodeConfig,
  clamp,
} from "./state.js";
import { randomSeed, seedToString, makeRng } from "./rng.js";
import { PALETTES, applyPalette, paletteEnvironment } from "./palettes.js";
import { disposeTree, disposeMaterials } from "./lifecycle.js";
import { glbBlob, objFiles, download } from "./exporter.js";
import { exportRotationGIF } from "./gif-export.js";
import { makeZIP } from "./zip.js";
import { WorkspaceStore } from "./persistence.js";
import { createUI } from "./ui.js";

export async function startGenerator(adapter) {
  let renderer;
  try {
    return await initialize(adapter, (value) => (renderer = value));
  } catch (error) {
    renderer?.dispose();
    const notice = document.createElement("div");
    notice.className = "fatal-error";
    notice.setAttribute("role", "alert");
    const title = document.createElement("h1");
    title.textContent = "The preview could not start";
    const message = document.createElement("p");
    message.textContent = /WebGL|context/i.test(error.message)
      ? "3D rendering is unavailable in this browser. Enable graphics acceleration or try another browser."
      : error.message;
    const retry = document.createElement("a");
    retry.href = location.pathname;
    retry.textContent = "Open a fresh generator";
    notice.append(title, message, retry);
    document.body.append(notice);
    console.error(error);
  }
}
async function initialize(adapter, onRenderer) {
  const canvas = document.getElementById("c"),
    stage = document.createElement("main");
  stage.id = "stage";
  stage.setAttribute("aria-label", `${adapter.label} 3D preview`);
  canvas.before(stage);
  stage.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  onRenderer(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(
      adapter.camera.fov,
      1,
      adapter.camera.near,
      adapter.camera.far,
    );
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = !new URLSearchParams(location.search).has("still");
  controls.autoRotateSpeed = adapter.camera.speed ?? 1.2;
  controls.minDistance = adapter.camera.min;
  controls.maxDistance = adapter.camera.max;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    app.sync();
  });
  const store = new WorkspaceStore(
      document.documentElement.dataset.workspaceApi || null,
    ),
    data = await store.init();
  const saved = data.generators?.[adapter.id];
  const historyState = new StateHistory(
    initialState(adapter, location.search, saved?.state),
  );
  let model = null,
    rig = null,
    disposed = false,
    contextLost = false;
  let lastTime = performance.now(),
    elapsed = 0,
    activeLook = null,
    activePalette = null;
  const app = {
    adapter,
    version: ENGINE_VERSION,
    busy: false,
    progress: "",
    notice: "",
    entries: [],
    store,
    get state() {
      return clone(historyState.current);
    },
    get params() {
      return historyState.current.params;
    },
    get styleKey() {
      return historyState.current.look;
    },
    get paletteKey() {
      return historyState.current.palette;
    },
    get locks() {
      return historyState.current.locks;
    },
    get model() {
      return model;
    },
    get car() {
      return model;
    },
    get canUndo() {
      return !!historyState.past.length;
    },
    get canRedo() {
      return !!historyState.future.length;
    },
    sync() {},
    beginEdit() {
      if (!app.busy) historyState.begin();
    },
    endEdit() {
      historyState.end();
      app.sync();
    },
    setStyle(key) {
      if (adapter.styles[key] && !app.locked("look"))
        change((state) => (state.look = key));
    },
    setPalette(key) {
      if (PALETTES[key] && !app.locked("palette"))
        change((state) => (state.palette = key));
    },
    setSlider(key, value) {
      const spec = adapter.sliders.find((s) => s.key === key);
      if (spec && Number.isFinite(value) && !app.locked(key))
        change((state) =>
          adapter.setDerived(
            state.params,
            key,
            clamp(value, spec.min, spec.max),
          ),
        );
    },
    setOption(key, value) {
      if (adapter.options?.some((s) => s.key === key) && !app.locked(key))
        change((state) => {
          state.params[key] = value;
        }, true);
    },
    setHue(value) {
      if (!Number.isFinite(value) || app.locked("color")) return;
      change((state) => {
        const color = adapter.colorKey
          ? state.params.color[adapter.colorKey]
          : state.params.color;
        color.h = clamp(value, 0, 1);
        if (!app.locked("palette")) state.palette = "original";
      });
    },
    locked(key) {
      return app.locks.includes(key);
    },
    toggleLock(key) {
      change(
        (state) => {
          state.locks = state.locks.includes(key)
            ? state.locks.filter((s) => s !== key)
            : [...state.locks, key];
        },
        false,
        false,
      );
    },
    reroll() {
      if (app.busy) return;
      const type = app.locked("archetype") ? app.params.archetype : null;
      commit(variation(randomSeed(), type), true);
    },
    setArchetype(key) {
      if (!adapter.archetypes[key] || app.locked("archetype") || app.busy)
        return;
      commit(variation(app.params.seed, key), true);
    },
    loadConfig(config) {
      if (app.busy) return;
      commit(normalizeState(adapter, config), true);
    },
    undo() {
      if (!app.busy && historyState.undo()) refresh(true);
    },
    redo() {
      if (!app.busy && historyState.redo()) refresh(true);
    },
    shareURL() {
      const url = new URL(location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("c", encodeConfig(app.state));
      return url.href;
    },
    reframe() {
      if (!app.busy) frameCamera();
    },
    toggleRotation() {
      if (app.busy) return;
      controls.autoRotate = !controls.autoRotate;
      app.sync();
    },
    get rotating() {
      return controls.autoRotate;
    },
    addFavorite() {
      addEntry(app.state, true);
    },
    addVariants(count = 4) {
      if (app.busy) return;
      if (app.entries.length + count > 48)
        throw new Error(
          "Collections can contain up to 48 models. Remove an item before adding more.",
        );
      const rng = makeRng(app.params.seed ^ 0xa341316c);
      for (let i = 0; i < count; i++)
        addEntry(
          variation(Math.floor(rng() * 4294967296), app.params.archetype),
          false,
        );
    },
    useEntry(id) {
      const entry = app.entries.find((s) => s.id === id);
      if (entry) app.loadConfig(entry.state);
    },
    removeEntry(id) {
      if (app.busy) return;
      app.entries = app.entries.filter((s) => s.id !== id);
      persist();
      app.sync();
    },
    async exportGLB() {
      return operation(async () =>
        download(await glbBlob(model), `${filename()}.glb`),
      );
    },
    async exportOBJ() {
      return operation(async () => {
        const files = objFiles(model, filename());
        for (const file of files)
          download(new Blob([file.data], { type: "text/plain" }), file.name);
        return files;
      });
    },
    async exportGIF(onProgress) {
      return operation(() =>
        exportRotationGIF({
          scene,
          camera,
          controls,
          renderer,
          filename: `${adapter.path}-${seedToString(app.params.seed)}.gif`,
          onProgress: (done, total) => {
            app.progress = `GIF ${done}/${total}`;
            app.sync();
            onProgress?.(done, total);
          },
          renderLoop: renderFrame,
        }),
      );
    },
    async exportCollection(format = "glb") {
      if (!app.entries.length)
        throw new Error("Add models to the collection first.");
      return operation(async () => {
        const files = [],
          entries = clone(app.entries);
        for (let i = 0; i < entries.length; i++) {
          app.progress = `Collection ${i + 1}/${entries.length}`;
          app.sync();
          const entry = entries[i],
            snapshot = build(entry.state),
            name = `${String(i + 1).padStart(2, "0")}-${adapter.id}-${seedToString(entry.state.params.seed)}`;
          try {
            if (format === "glb")
              files.push({
                name: `${name}.glb`,
                data: await glbBlob(snapshot),
              });
            else files.push(...objFiles(snapshot, name));
          } finally {
            disposeTree(snapshot);
          }
          await new Promise(requestAnimationFrame);
        }
        files.push({
          name: "collection.json",
          data: JSON.stringify(
            { engine: ENGINE_VERSION, generator: adapter.id, entries },
            null,
            2,
          ),
        });
        files.push({
          name: "README.txt",
          data: "MediaGeni 3D collection\nModel geometry and material colors are included. OBJ models need their accompanying MTL files.\ncollection.json contains the exact configurations.\nhttps://3d.mediageni.com/\n",
        });
        return download(await makeZIP(files), `${adapter.id}-collection.zip`);
      });
    },
    async flushStorage() {
      await store.flush();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      ui.dispose();
      controls.dispose();
      disposeTree(model);
      disposeTree(rig);
      for (const style of Object.values(adapter.styles))
        if (style.background?.isTexture) style.background.dispose();
      renderer.dispose();
      store.dispose();
      delete window.__app;
      delete window.__rig;
    },
  };
  for (const entry of saved?.entries ?? []) {
    try {
      app.entries.push({
        ...entry,
        state: normalizeState(adapter, entry.state),
      });
    } catch {
      /* ignore unsupported saved entries */
    }
  }
  function filename() {
    return `${adapter.filePrefix}-${seedToString(app.params.seed)}`;
  }
  function variation(seed, type) {
    const params = adapter.paramsFromSeed(seed, type);
    return retainLocks(adapter, app.state, {
      ...app.state,
      params: adapter.enrich ? adapter.enrich(params) : params,
    });
  }
  function addEntry(state, favorite) {
    if (app.busy) return;
    if (app.entries.length >= 48)
      throw new Error("Collections can contain up to 48 models.");
    app.entries.push({
      id: crypto.randomUUID(),
      title: `${adapter.archetypes[state.params.archetype].label} #${seedToString(state.params.seed)}`,
      favorite,
      state: clone(state),
    });
    persist();
    app.sync();
  }
  function persist() {
    store.queue(adapter.id, app.state, app.entries);
  }
  function commit(state, reframe = false) {
    if (app.busy) return;
    historyState.end();
    if (historyState.set(normalizeState(adapter, state))) refresh(reframe);
  }
  function change(callback, reframe = false, rebuildModel = true) {
    if (app.busy) return;
    const next = app.state;
    callback(next);
    if (historyState.set(normalizeState(adapter, next)))
      refresh(reframe, rebuildModel);
  }
  function refresh(reframe = false, rebuildModel = true) {
    if (rebuildModel) {
      applyStyle();
      rebuild(reframe);
    }
    updateURL();
    persist();
    app.sync();
  }
  function updateURL() {
    const url = new URL(location.href);
    url.searchParams.delete("seed");
    url.searchParams.delete("type");
    url.searchParams.delete("look");
    url.searchParams.delete("palette");
    url.searchParams.set("c", encodeConfig(app.state));
    window.history.replaceState(null, "", url);
  }
  function build(state) {
    const style = adapter.styles[state.look],
      materials = applyPalette(
        adapter.materials(style, state.params),
        adapter.paletteSlots,
        state.palette,
        state.params.seed,
      );
    let root;
    try {
      root = adapter.build(state.params, materials, state);
      root.updateMatrixWorld(true);
      const used = new Set();
      root.traverse((node) => {
        for (const m of node.material
          ? Array.isArray(node.material)
            ? node.material
            : [node.material]
          : [])
          used.add(m);
      });
      for (const m of Object.values(materials).flat())
        if (m?.isMaterial && !used.has(m)) m.dispose();
      return root;
    } catch (error) {
      disposeTree(root);
      disposeMaterials(materials);
      throw error;
    }
  }
  function applyStyle() {
    if (rig && activeLook === app.styleKey && activePalette === app.paletteKey)
      return;
    activeLook = app.styleKey;
    activePalette = app.paletteKey;
    const style = adapter.styles[app.styleKey];
    scene.background = style.background;
    scene.fog = style.fog ?? null;
    renderer.toneMappingExposure = style.exposure ?? 1;
    if (rig) {
      scene.remove(rig);
      disposeTree(rig);
    }
    rig = style.rig();
    scene.add(rig);
    paletteEnvironment(scene, rig, app.paletteKey, adapter.id === "boat");
  }
  function rebuild(reframe = false) {
    const next = build(app.state);
    if (model) {
      scene.remove(model);
      disposeTree(model);
    }
    model = next;
    scene.add(model);
    if (reframe) frameCamera();
  }
  function frameCamera() {
    if (!model) return;
    const bounds = new THREE.Box3().setFromObject(model),
      size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(
        ...adapter.camera.direction,
      ).normalize(),
      radius = size.length() / 2,
      fov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance =
      (radius /
        Math.sin(Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect)))) *
      1.08;
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.maxDistance = Math.max(adapter.camera.max, distance * 3);
    camera.near = Math.max(0.01, radius / 1000);
    camera.far = Math.max(adapter.camera.far, distance * 6);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function resize() {
    if (disposed) return;
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!app.busy) frameCamera();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  const ui = createUI(app);
  store.onStatus = () => app.sync();
  applyStyle();
  resize();
  rebuild(true);
  updateURL();
  persist();
  app.sync();
  function renderFrame() {
    if (disposed || contextLost || document.hidden) return;
    const now = performance.now(),
      dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    elapsed += dt;
    adapter.styles[app.styleKey].tick?.(rig, dt, model, elapsed);
    controls.update();
    renderer.render(scene, camera);
  }
  function visibility() {
    lastTime = performance.now();
    if (!app.busy && !contextLost)
      renderer.setAnimationLoop(document.hidden ? null : renderFrame);
  }
  function pagehide() {
    store.flush();
    renderer.setAnimationLoop(null);
  }
  function lost(event) {
    event.preventDefault();
    contextLost = true;
    renderer.setAnimationLoop(null);
    app.notice =
      "3D rendering paused. Waiting for the graphics context to recover.";
    app.sync();
  }
  function restored() {
    contextLost = false;
    app.notice = "";
    activeLook = null;
    applyStyle();
    rebuild();
    renderer.setAnimationLoop(renderFrame);
    app.sync();
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  async function operation(fn) {
    if (app.busy) throw new Error("An export is already running.");
    historyState.end();
    app.busy = true;
    app.progress = "Preparing export";
    app.sync();
    try {
      return await fn();
    } finally {
      app.busy = false;
      app.progress = "";
      visibility();
      app.sync();
    }
  }
  renderer.setAnimationLoop(renderFrame);
  window.__app = app;
  window.__rig = { camera, controls, scene, renderer };
  return app;
}
