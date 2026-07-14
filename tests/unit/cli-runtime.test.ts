import { afterEach, describe, expect, it } from "vitest";

import { terminalColorEnabled } from "../../src/cli/runtime.js";

const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const hadNoColor = Object.hasOwn(process.env, "NO_COLOR");
const originalNoColor = process.env["NO_COLOR"];

function setIsTty(value: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalIsTty === undefined) {
    Reflect.deleteProperty(process.stdout, "isTTY");
  } else {
    Object.defineProperty(process.stdout, "isTTY", originalIsTty);
  }

  if (hadNoColor) {
    process.env["NO_COLOR"] = originalNoColor;
  } else {
    delete process.env["NO_COLOR"];
  }
});

describe("terminal color boundary", () => {
  it("requires an explicit request on a TTY and honors NO_COLOR", () => {
    delete process.env["NO_COLOR"];
    setIsTty(true);
    expect(terminalColorEnabled(false)).toBe(false);
    expect(terminalColorEnabled(true)).toBe(true);

    setIsTty(false);
    expect(terminalColorEnabled(true)).toBe(false);

    setIsTty(true);
    process.env["NO_COLOR"] = "";
    expect(terminalColorEnabled(true)).toBe(false);
  });
});
