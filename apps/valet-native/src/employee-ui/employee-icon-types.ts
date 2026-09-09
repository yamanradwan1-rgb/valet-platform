export interface EmployeeIconProps {
  readonly color?: string;
  readonly size?: number;
}

export interface EmployeeNavigationIconProps extends EmployeeIconProps {
  readonly active?: boolean;
  readonly inverse?: boolean;
}
