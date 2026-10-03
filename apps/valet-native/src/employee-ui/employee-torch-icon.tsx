import Svg, { Path } from "react-native-svg";
import type { EmployeeIconProps } from "./employee-icon-types";
import { employeeColors } from "./employee-tokens";

export function EmployeeTorchIcon({
  color = employeeColors.navy,
  size = 20,
}: EmployeeIconProps = {}) {
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
