// server-only enforced by Next.js route boundary
import fs from "node:fs/promises";
import zlib from "node:zlib";

// Tiny PNG decoder (just enough for 8-bit RGB/RGBA images we control).
export async function readPng(
  filePath: string,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const buf = await fs.readFile(filePath);
  return decodePng(buf);
}

function decodePng(buf: Buffer): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50)
    throw new Error("not a png");

  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const chunks: Buffer[] = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    pos += 4;
    const type = buf.toString("ascii", pos, pos + 4);
    pos += 4;
    const data = buf.subarray(pos, pos + length);
    pos += length + 4; // skip CRC
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (depth !== 8) throw new Error("only 8-bit png supported");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);

  let rawPos = 0;
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[rawPos++];
    const row = raw.subarray(rawPos, rawPos + stride);
    rawPos += stride;
    const out = applyFilter(filter, row, prev, channels);
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      const j = (y * width + x) * 4;
      rgba[j] = out[i];
      rgba[j + 1] = channels >= 2 ? out[i + 1] : out[i];
      rgba[j + 2] = channels >= 3 ? out[i + 2] : out[i];
      rgba[j + 3] = channels === 4 ? out[i + 3] : 255;
    }
    prev.set(out);
  }
  return { width, height, rgba };
}

function applyFilter(
  type: number,
  row: Uint8Array | Buffer,
  prev: Uint8Array,
  bpp: number,
): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? out[i - bpp] : 0;
    const up = prev[i];
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    let v = row[i];
    switch (type) {
      case 0:
        break;
      case 1:
        v = (v + left) & 0xff;
        break;
      case 2:
        v = (v + up) & 0xff;
        break;
      case 3:
        v = (v + ((left + up) >> 1)) & 0xff;
        break;
      case 4:
        v = (v + paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`unknown filter ${type}`);
    }
    out[i] = v;
  }
  return out;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function downsampleLuma(
  rgba: Uint8Array,
  width: number,
  height: number,
  target: number,
): Float32Array {
  const out = new Float32Array(target * target);
  for (let ty = 0; ty < target; ty++) {
    for (let tx = 0; tx < target; tx++) {
      const x0 = Math.floor((tx * width) / target);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / target));
      const y0 = Math.floor((ty * height) / target);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / target));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          // Rec. 709 luma
          const v =
            (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) /
            255;
          sum += v;
          count++;
        }
      }
      out[ty * target + tx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

export function downsampleRgb(
  rgba: Uint8Array,
  width: number,
  height: number,
  target: number,
): Float32Array {
  const out = new Float32Array(target * target * 3);
  for (let ty = 0; ty < target; ty++) {
    for (let tx = 0; tx < target; tx++) {
      const x0 = Math.floor((tx * width) / target);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / target));
      const y0 = Math.floor((ty * height) / target);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / target));
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          count++;
        }
      }
      const j = (ty * target + tx) * 3;
      out[j] = r / count / 255;
      out[j + 1] = g / count / 255;
      out[j + 2] = b / count / 255;
    }
  }
  return out;
}
