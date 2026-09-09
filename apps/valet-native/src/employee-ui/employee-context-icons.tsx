import Svg, { Circle, Path } from "react-native-svg";

import type { EmployeeIconProps } from "./employee-icon-types";
import { employeeColors as c } from "./employee-tokens";

export function EmployeeLocationPinIcon({
  color = c.white,
  size = 14,
}: EmployeeIconProps = {}) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 14 14"
      width={size}
    >
      <Path d="M7 7a2 2 0 100-4 2 2 0 000 4z" fill={color} />
      <Path
        d="M7 1C4.24 1 2 3.24 2 6c0 3.75 5 7 5 7s5-3.25 5-7c0-2.76-2.24-5-5-5z"
        fill="none"
        stroke={color}
        strokeWidth={1.25}
      />
    </Svg>
  );
}

export function EmployeeKeyIcon({
  color = c.white,
  size = 14,
}: EmployeeIconProps = {}) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 14 14"
      width={size}
    >
      <Circle cx={5} cy={6} r={3.5} stroke={color} strokeWidth={1.25} />
      <Path
        d="M8 6h4M11 6v2"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.25}
      />
    </Svg>
  );
}

export function EmployeeCameraSquareIcon({
  color = c.navy,
  size = 28,
}: EmployeeIconProps = {}) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 28 28"
      width={size}
    >
      <Path
        d="M24 22H4a2 2 0 01-2-2V10a2 2 0 012-2h3.5l2-3h9l2 3H24a2 2 0 012 2v10a2 2 0 01-2 2z"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      <Circle cx={14} cy={15} r={4} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function EmployeeAlertIcon({
  color = c.danger,
  size = 32,
}: EmployeeIconProps = {}) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <Path
        d="M16 10v9M16 23v.5"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.5}
      />
      <Path
        d="M13.5 4.5l-11 19A3 3 0 005 28h22a3 3 0 002.5-4.5l-11-19a3 3 0 00-5 0z"
        fill="none"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  );
}

export function EmployeeSearchIcon({
  color = c.muted,
  size = 16,
}: EmployeeIconProps = {}) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <Circle cx={7} cy={7} r={5.5} stroke={color} strokeWidth={1.25} />
      <Path
        d="M11.5 11.5L14 14"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.25}
      />
    </Svg>
  );
}
