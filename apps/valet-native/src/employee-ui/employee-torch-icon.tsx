import { useEmployeePalette } from "../appearance/employee-appearance-context";
import Svg, { Path } from "react-native-svg";
import type { EmployeeIconProps } from "./employee-icon-types";

export function EmployeeTorchIcon({
  color: colorOverride,
  size = 20,
}: EmployeeIconProps = {}) {
  const p = useEmployeePalette();
  const color = colorOverride ?? p.textPrimary;

  return (
    <Svg
      accessible={false}
      fill="none"
      height={size}
      width={size}
      viewBox="0 0 24 24"
    >
      <Path
        d="M7 3h10v4l-3 4v9h-4v-9L7 7V3zM7 7h10M10 14h4"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
