/** Byte-exact PNG comparison without masks or tolerance. */
async function panePixels(sharp, bytes) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function diffPanes(sharp, sourcePng, candidatePng) {
  const source = await panePixels(sharp, sourcePng);
  const candidate = await panePixels(sharp, candidatePng);
  if (source.width !== candidate.width || source.height !== candidate.height) {
    return {
      differences: null,
      pixels: null,
      diffPng: null,
      geometryEqual: false,
    };
  }
  const output = Buffer.alloc(source.data.length);
  let differences = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(
        source.data[offset + channel] - candidate.data[offset + channel],
      );
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      changed ||= delta !== 0;
    }
    if (changed) {
      differences++;
      output[offset] = 255;
      output[offset + 3] = 255;
    }
  }
  const diffPng = await sharp(output, {
    raw: { width: source.width, height: source.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    differences,
    pixels: source.width * source.height,
    maxChannelDelta,
    geometryEqual: true,
    diffPng,
  };
}
