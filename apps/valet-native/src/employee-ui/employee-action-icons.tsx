import { useEmployeePalette } from "../appearance/employee-appearance-context";
import Svg, { Circle, Path } from "react-native-svg";

import type { EmployeeIconProps } from "./employee-icon-types";

export function EmployeeSettingsIcon({
  color: colorOverride,
  size = 24,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.textPrimary;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <Path
        d="M9.5 3h5l.6 2.4 1.1.6 2.4-.7 2.5 4.4-1.8 1.7v1.2l1.8 1.7-2.5 4.4-2.4-.7-1.1.6-.6 2.4h-5l-.6-2.4-1.1-.6-2.4.7-2.5-4.4 1.8-1.7v-1.2L2.9 9.7l2.5-4.4 2.4.7 1.1-.6L9.5 3z"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.75} />
    </Svg>
  );
}

export function EmployeeChevronLeftIcon({
  color: colorOverride,
  size = 24,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.textPrimary;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
    </Svg>
  );
}

export function EmployeeChevronRightIcon({
  color: colorOverride,
  size = 16,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.textMuted;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <Path
        d="M6 4l4 4-4 4"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export function EmployeePlusIcon({
  color: colorOverride,
  size = 14,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.onAction;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 14 14"
      width={size}
    >
      <Path
        d="M7 2v10M2 7h10"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

export function EmployeeCheckSmallIcon({
  color: colorOverride,
  size = 12,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.onAction;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 12 12"
      width={size}
    >
      <Path
        d="M2 6l3 3 5-5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
    </Svg>
  );
}

export function EmployeeBigCheckIcon({
  color: colorOverride,
  size = 36,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.onAction;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      viewBox="0 0 36 36"
      width={size}
    >
      <Path
        d="M6 18l8 8L30 10"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  );
}

/** @deprecated Use EmployeeChevronLeftIcon for Web-authoritative direction. */
export function EmployeeBackIcon({
  color: colorOverride,
  size = 24,
}: EmployeeIconProps & { readonly direction: "ltr" | "rtl" }) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.textPrimary;

  return <EmployeeChevronLeftIcon color={color} size={size} />;
}

/** @deprecated Use EmployeeCheckSmallIcon with an explicit color. */
export function EmployeeCheckIcon({
  color,
  inverse = false,
  size = 12,
}: EmployeeIconProps & { readonly inverse?: boolean } = {}) {
  const p = useEmployeePalette();

  return (
    <EmployeeCheckSmallIcon
      color={color ?? (inverse ? p.onAction : p.textPrimary)}
      size={size}
    />
  );
}
