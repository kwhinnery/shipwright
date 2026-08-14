window.__shipwrightWebMcpTools = {};

Object.defineProperty(document, "modelContext", {
  configurable: true,
  value: {
    registerTool(tool, options) {
      window.__shipwrightWebMcpTools[tool.name] = tool;
      options?.signal?.addEventListener(
        "abort",
        () => {
          if (window.__shipwrightWebMcpTools[tool.name] === tool) {
            delete window.__shipwrightWebMcpTools[tool.name];
          }
        },
        { once: true },
      );
      return Promise.resolve();
    },
  },
});
