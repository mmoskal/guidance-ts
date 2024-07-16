export function assert(cond: boolean, msg?: string): void {
  if (!cond) {
    throw new Error(msg ?? "Assertion failed");
  }
}

export function panic(msg?: string): never {
  throw new Error("Panic: " + msg);
}

export function uint8arrayFromHex(hex: string): Uint8Array {
  if (hex === undefined) return undefined;
  return new Uint8Array(
    hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
}

export function uint8ArrayConcat(chunks: Uint8Array[]) {
  let numbytes = 0;
  for (let c of chunks) numbytes += c.length;
  let r = new Uint8Array(numbytes);
  let ptr = 0;
  for (let c of chunks) {
    r.set(c, ptr);
    ptr += c.length;
  }
  return r;
}

export function utf8decode(bytes: ArrayLike<number>): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] < 0x80) {
      out += String.fromCharCode(bytes[i]);
      i++;
    } else if (bytes[i] < 0xe0) {
      out += String.fromCharCode(
        ((bytes[i] & 0x1f) << 6) | (bytes[i + 1] & 0x3f)
      );
      i += 2;
    } else if (bytes[i] < 0xf0) {
      out += String.fromCharCode(
        ((bytes[i] & 0x0f) << 12) |
          ((bytes[i + 1] & 0x3f) << 6) |
          (bytes[i + 2] & 0x3f)
      );
      i += 3;
    } else {
      throw new Error("utf8decode: invalid utf8");
    }
  }
  return out;
}
