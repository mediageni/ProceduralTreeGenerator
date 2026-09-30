# Tree Generator

Generate deterministic low poly 3D models, tune their parameters, try shared world palettes, and export GLB, OBJ with MTL, GIF, or a ZIP collection.

[Open the live generator](https://3d.mediageni.com/procedural-tree-generator/)

Run locally with a static HTTP server (for example, `python3 -m http.server 8000`) and open http://localhost:8000/. No build or external JavaScript service is required.

This standalone copy uses engine 1.1.0. Its runtime is generated from the canonical MediaGeni 3D engine; edit the canonical source when contributing changes.

On this static copy, settings and favorites last for the current page session. Model share links preserve complete configurations. The live site supports automatic workspace storage and recovery links.

OBJ downloads include an accompanying MTL file; keep both files together when importing. ZIP collections include their configurations in collection.json.

Source is MIT licensed. Bundled Three.js r169 and gifenc 1.0.3 retain their license files in the vendor directory.
