import { afterEach, describe, expect, it } from "vitest";

import { escapeScriptClose, loadMermaidSource, setMermaidSourceForTests } from "../shared/mermaid.ts";

describe("escapeScriptClose", () => {
  it("neutralizes literal closing script tags", () => {
    expect(escapeScriptClose("a</script>b")).toBe("a<\\/script>b");
  });

  it("leaves source without closing tags untouched", () => {
    expect(escapeScriptClose("const x = 1;")).toBe("const x = 1;");
  });
});

describe("loadMermaidSource", () => {
  afterEach(() => {
    setMermaidSourceForTests(undefined);
  });

  it("returns the overridden source once set", () => {
    setMermaidSourceForTests("stub</script>source");
    expect(loadMermaidSource()).toBe("stub<\\/script>source");
    expect(loadMermaidSource()).toBe("stub<\\/script>source"); // cached
  });

  it("loads the vendored bundle after the cache is cleared", () => {
    setMermaidSourceForTests(undefined);
    const source = loadMermaidSource();
    expect(source).toBeDefined();
    expect(source).toContain("mermaid");
    expect(source!.length).toBeGreaterThan(1_000_000);
  });
});
