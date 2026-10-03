import { useEmployeePalette } from "../appearance/employee-appearance-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import type { EmployeeNavigationIconProps } from "./employee-icon-types";

function useNavigationColor({
  active = false,
  color,
  inverse = false,
}: EmployeeNavigationIconProps) {
  const p = useEmployeePalette();

  return (
    color ?? (inverse ? p.onAction : active ? p.linkPrimary : p.textSecondary)
  );
}

export function EmployeeHomeIcon({
  size = 22,
  ...props
}: EmployeeNavigationIconProps) {
  const color = useNavigationColor(props);
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 22 22"
      width={size}
    >
      <Path
        d="M3 9L11 3l8 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <Path
        d="M8 20V13h6v7"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export function EmployeeCarIcon({
  size = 22,
  ...props
}: EmployeeNavigationIconProps) {
  const color = useNavigationColor(props);
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 22 22"
      width={size}
    >
      <Path
        d="M4 10l2-4h10l2 4"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
      <Rect
        height={7}
        rx={2}
        stroke={color}
        strokeWidth={1.6}
        width={18}
        x={2}
        y={10}
      />
      <Circle cx={6} cy={17} fill={color} r={1.5} />
      <Circle cx={16} cy={17} fill={color} r={1.5} />
    </Svg>
  );
}

export function EmployeeScanIcon({
  size = 22,
  ...props
}: EmployeeNavigationIconProps) {
  const color = useNavigationColor(props);
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 22 22"
      width={size}
    >
      <Path
        d="M4 7V5a1 1 0 011-1h2M15 4h2a1 1 0 011 1v2M18 15v2a1 1 0 01-1 1h-2M7 18H5a1 1 0 01-1-1v-2"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
      <Path
        d="M6 11h10"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export function EmployeeShiftIcon({
  size = 22,
  ...props
}: EmployeeNavigationIconProps) {
  const color = useNavigationColor(props);
  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 22 22"
      width={size}
    >
      <Circle cx={11} cy={8} r={3.5} stroke={color} strokeWidth={1.6} />
      <Path
        d="M4 19c0-3.866 3.134-7 7-7s7 3.134 7 7"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}
