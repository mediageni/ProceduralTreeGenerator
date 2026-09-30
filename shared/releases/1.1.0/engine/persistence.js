export class WorkspaceStore {
  constructor(api) {
    this.api = api;
    this.data = { generators: {} };
    this.mode = api ? "loading" : "session";
    this.pending = null;
    this.running = null;
    this.timer = null;
    this.onStatus = () => {};
    this.controller = new AbortController();
  }
  async init() {
    if (!this.api) return this.data;
    try {
      const url = new URL(this.api, location.href),
        token = new URLSearchParams(location.search).get("workspace");
      if (token) url.searchParams.set("workspace", token);
      const response = await fetch(url, {
        credentials: "same-origin",
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(8000),
        ]),
      });
      if (!response.ok) throw new Error("Automatic storage is not available.");
      this.data = await response.json();
      this.mode = "saved";
    } catch {
      this.mode = "session";
    }
    this.onStatus();
    return this.data;
  }
  queue(generator, state, entries) {
    if (!this.api || this.mode === "session") return;
    this.pending = {
      generator,
      state: structuredClone(state),
      entries: structuredClone(entries),
    };
    this.mode = "saving";
    this.onStatus();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.pending) return this.flush();
      return;
    }
    if (!this.pending) return;
    const payload = this.pending;
    this.pending = null;
    this.running = (async () => {
      try {
        const response = await fetch(this.api, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: JSON.stringify(payload).length < 60000,
          signal: this.controller.signal,
        });
        if (!response.ok) throw new Error("Automatic save failed.");
        this.mode = "saved";
      } catch {
        this.mode = "error";
        this.pending ??= payload;
      } finally {
        this.running = null;
        this.onStatus();
      }
    })();
    await this.running;
    if (this.pending && this.mode !== "error") return this.flush();
  }
  link() {
    if (!this.data.workspace) return null;
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("workspace", this.data.workspace);
    return url.href;
  }
  dispose() {
    clearTimeout(this.timer);
    this.controller.abort();
  }
}
