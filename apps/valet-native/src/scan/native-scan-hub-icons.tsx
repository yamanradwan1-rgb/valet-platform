import Svg, { Circle, Path, Rect } from "react-native-svg";

import { employeeColors as c } from "../employee-ui/employee-tokens";

const glyphProps = {
  accessible: false,
  fill: "none",
  height: 26,
  viewBox: "0 0 26 26",
  width: 26,
} as const;

export function NativeScanPlateIcon() {
  return (
    <Svg {...glyphProps}>
      <Rect
        x={2.5}
        y={7}
        width={21}
        height={12}
        rx={2.5}
        stroke={c.white}
        strokeWidth={1.6}
      />
      <Path
        d="M7 13h3.5M15.5 13H19M13 10.5v5"
        stroke={c.white}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export function NativeScanKeyIcon() {
  return (
    <Svg {...glyphProps}>
      <Circle cx={9} cy={14} r={5} stroke={c.white} strokeWidth={1.6} />
      <Path
        d="M14 14h9M19.5 14v4M23 14v3"
        stroke={c.white}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export function NativeScanSpotIcon() {
  return (
    <Svg {...glyphProps}>
      <Path
        d="M13 23.5S5.5 17.6 5.5 11a7.5 7.5 0 0115 0c0 6.6-7.5 12.5-7.5 12.5z"
        stroke={c.white}
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <Circle cx={13} cy={10.8} r={2.6} fill={c.white} />
    </Svg>
  );
}

export function NativeScanHandoffIcon() {
  return (
    <Svg {...glyphProps}>
      <Path
        d="M5.5 9.5h14m0 0l-3.5-3.5m3.5 3.5L16 13"
        stroke={c.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <Path
        d="M20.5 16.5h-14m0 0L10 13m-3.5 3.5L10 20"
        stroke={c.white}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}
