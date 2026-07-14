export interface FileIdentity {
  dev: bigint;
  ino: bigint;
}

export function sameFile(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
