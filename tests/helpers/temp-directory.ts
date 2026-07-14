import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TempDirectory {
  path: string;
  cleanup(): Promise<void>;
  mkdir(relativePath: string): Promise<string>;
  write(relativePath: string, contents: string | Uint8Array): Promise<string>;
}

export async function createTempDirectory(): Promise<TempDirectory> {
  const directory = await mkdtemp(path.join(tmpdir(), "scopeglass-test-"));

  return {
    path: directory,
    async cleanup() {
      await rm(directory, { force: true, recursive: true });
    },
    async mkdir(relativePath) {
      const destination = path.join(directory, relativePath);
      await mkdir(destination, { recursive: true });
      return destination;
    },
    async write(relativePath, contents) {
      const destination = path.join(directory, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents);
      return destination;
    },
  };
}
