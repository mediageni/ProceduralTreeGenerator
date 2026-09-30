// Analytics starts after the first preview frame, so it cannot compete with
// the renderer download or module evaluation on a cold or mobile connection.
(() => {
  window.addEventListener(
    "generator-ready",
    () => {
      document.getElementById("preview-loading")?.remove();
      for (const src of [
        "https://www.googletagmanager.com/gtag/js?id=G-14W85R6ERP",
        "https://www.statcounter.com/counter/counter.js",
      ]) {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        document.head.append(script);
      }
    },
    { once: true },
  );
})();
