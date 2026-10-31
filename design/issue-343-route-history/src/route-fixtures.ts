import type { Scenario } from './route-copy';

// Entirely fabricated local demonstration observations. Never presented as real journeys.
export interface Sample {
  latitude: number;
  longitude: number;
  capturedAt: string;
  segment: number;
}

const positions = [
  [31.95512, 35.90982], [31.95521, 35.90984], [31.95531, 35.90986],
  [31.95543, 35.90987], [31.95551, 35.90996], [31.95554, 35.91010],
  [31.95553, 35.91028], [31.95554, 35.91046], [31.95559, 35.91063],
  [31.95572, 35.91072], [31.95588, 35.91073], [31.95604, 35.91074],
  [31.95618, 35.91075], [31.95627, 35.91069], [31.95630, 35.91055],
  [31.95631, 35.91039], [31.95635, 35.91023], [31.95645, 35.91016],
  [31.95656, 35.91016], [31.95663, 35.91024], [31.95664, 35.91038],
  [31.95664, 35.91053], [31.95665, 35.91067], [31.95666, 35.91080],
] as const;

export function createRouteFixture(scenario: Scenario, retrieval: boolean): Sample[] {
  let route: readonly (readonly number[])[] = retrieval ? [...positions].reverse() : positions;
  if (scenario === 'empty') return [];
  if (scenario === 'single') route = route.slice(0, 1);
  if (scenario === 'short') route = route.slice(0, 2);
  if (scenario === 'sparse') route = route.filter((_, i) => i % 7 === 0 || i === route.length - 1);
  const base = new Date(retrieval ? '2026-10-31T15:42:05+03:00' : '2026-10-31T14:24:05+03:00').getTime();
  if (scenario === 'long') {
    // A generated synthetic observation set, not simplification/interpolation of production GPS.
    return Array.from({ length: 2000 }, (_, i) => ({
      latitude: 31.955 + i * 0.000001 + Math.sin(i / 200) * 0.00017,
      longitude: 35.910 + Math.sin(i / 260) * 0.00045,
      capturedAt: new Date(base + i * 1000).toISOString(), segment: 0,
    }));
  }
  return route.map((point, i) => ({
    latitude: point[0]! + (scenario === 'noisy' && i % 4 === 0 ? 0.00012 : 0),
    longitude: point[1]! + (scenario === 'noisy' && i % 5 === 0 ? -0.00009 : 0),
    capturedAt: new Date(base + i * 10000).toISOString(),
    segment: scenario === 'partial' && i >= 12 ? 1 : 0,
  }));
}
