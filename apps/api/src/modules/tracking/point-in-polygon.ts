export interface GeoPoint {
  readonly latitude: string;
  readonly longitude: string;
}

interface FixedPoint {
  readonly x: bigint;
  readonly y: bigint;
}

function fixed(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const scaled =
    BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  return negative ? -scaled : scaled;
}

function point(value: GeoPoint): FixedPoint {
  return { x: fixed(value.longitude), y: fixed(value.latitude) };
}

function onSegment(target: FixedPoint, first: FixedPoint, second: FixedPoint) {
  const cross =
    (target.x - first.x) * (second.y - first.y) -
    (target.y - first.y) * (second.x - first.x);
  return (
    cross === 0n &&
    target.x >= (first.x < second.x ? first.x : second.x) &&
    target.x <= (first.x > second.x ? first.x : second.x) &&
    target.y >= (first.y < second.y ? first.y : second.y) &&
    target.y <= (first.y > second.y ? first.y : second.y)
  );
}

export function pointInPolygon(
  targetValue: GeoPoint,
  vertexValues: readonly GeoPoint[],
): boolean {
  if (vertexValues.length < 3) return false;
  const target = point(targetValue);
  const vertices = vertexValues.map(point);
  let inside = false;
  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index]!;
    const second = vertices[(index + 1) % vertices.length]!;
    if (onSegment(target, first, second)) return true;
    if (first.y > target.y === second.y > target.y) continue;
    const denominator = second.y - first.y;
    const left = (target.x - first.x) * denominator;
    const right = (target.y - first.y) * (second.x - first.x);
    if (denominator > 0n ? right > left : right < left) inside = !inside;
  }
  return inside;
}
