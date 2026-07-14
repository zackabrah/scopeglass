import { describe, expect, it } from "vitest";

import { sameFile } from "../../src/file-identity.js";

describe("filesystem identity", () => {
  it("compares bigint device and inode values without lossy number coercion", () => {
    const firstInode = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const secondInode = firstInode + 1n;
    const identity = { dev: 7n, ino: firstInode };

    expect(Number(firstInode)).toBe(Number(secondInode));
    expect(sameFile(identity, { ...identity })).toBe(true);
    expect(sameFile(identity, { dev: 8n, ino: firstInode })).toBe(false);
    expect(sameFile(identity, { dev: 7n, ino: secondInode })).toBe(false);
  });
});
