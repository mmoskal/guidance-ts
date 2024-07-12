export function assert(cond: boolean, msg?: string): void {
  if (!cond) {
    throw new Error(msg ?? "Assertion failed");
  }
}

export function panic(msg?: string): never {
  throw new Error("Panic: " + msg);
}
