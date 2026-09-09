import Svg, { Path } from "react-native-svg";

import type { EmployeeIconProps } from "./employee-icon-types";
import { employeeColors as c } from "./employee-tokens";

export function EmployeeChevronLeftIcon({
  color = c.navy,
  size = 24,
}: EmployeeIconProps = {}) {
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
  color = c.white,
  size = 12,
}: EmployeeIconProps = {}) {
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
  color = c.white,
  size = 36,
}: EmployeeIconProps = {}) {
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
  color = c.navy,
  size = 24,
}: EmployeeIconProps & { readonly direction: "ltr" | "rtl" }) {
  return <EmployeeChevronLeftIcon color={color} size={size} />;
}

/** @deprecated Use EmployeeCheckSmallIcon with an explicit color. */
export function EmployeeCheckIcon({
  color,
  inverse = false,
  size = 12,
}: EmployeeIconProps & { readonly inverse?: boolean } = {}) {
  return (
    <EmployeeCheckSmallIcon
      color={color ?? (inverse ? c.white : c.navy)}
      size={size}
    />
  );
}
