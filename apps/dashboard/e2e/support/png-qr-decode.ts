import { inflateSync } from "node:zlib";

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(
  raw: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number,
) {
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[inputOffset++];
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel]! : 0;
      const up = y > 0 ? output[previousOffset + x]! : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? output[previousOffset + x - bytesPerPixel]!
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth(left, up, upperLeft)
                  : Number.NaN;
      if (Number.isNaN(predictor)) throw new Error("Unsupported PNG filter.");
      output[rowOffset + x] = (value + predictor) & 0xff;
    }
  }
  return output;
}

export function decodeQrFromPng(bytes: Buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) {
    throw new Error("Not a PNG image.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (data[12] !== 0) throw new Error("Interlaced PNG is unsupported.");
    } else if (type === "IDAT") chunks.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || ![0, 2, 6].includes(colorType)) {
    throw new Error("Unsupported PNG pixel format.");
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const pixels = unfilter(
    inflateSync(Buffer.concat(chunks)),
    width,
    height,
    bytesPerPixel,
  );
  const luminances = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * bytesPerPixel;
    if (bytesPerPixel === 1) luminances[pixel] = pixels[index]!;
    else {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      luminances[pixel] = (red + green * 2 + blue) >> 2;
    }
  }
  const source = new RGBLuminanceSource(luminances, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  return new MultiFormatReader().decode(bitmap, hints).getText();
}
