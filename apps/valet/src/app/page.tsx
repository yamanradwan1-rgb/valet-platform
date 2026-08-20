import type { JSX } from "react";

import { EmployeeApp } from "../components/employee-app";
import { StaffAuthProvider } from "../lib/auth/staff-auth-context";

export default function Home(): JSX.Element {
  return (
    <StaffAuthProvider>
      <EmployeeApp />
    </StaffAuthProvider>
  );
}
