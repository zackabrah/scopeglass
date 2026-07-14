import { describe, expect, it } from "vitest";

import { safeDisplayPath, visibleText } from "../../src/sanitize.js";

describe("untrusted display text", () => {
  it("makes terminal line and paragraph separators visible", () => {
    expect(visibleText("safe\u2028::error::forged\u2029next")).toBe(
      "safe\\u{2028}::error::forged\\u{2029}next",
    );
  });

  it("sanitizes separators in display paths after removing host prefixes", () => {
    expect(safeDisplayPath("/private/repo\u2028::error::forged")).toBe(
      "repo\\u{2028}::error::forged",
    );
  });
});
