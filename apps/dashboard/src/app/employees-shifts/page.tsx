import { redirect } from "next/navigation";

/**
 * Historical `/employees-shifts` path redirects to the accepted final-D1
 * route `/active-shifts`.
 */
export default function EmployeesShiftsRedirect() {
  redirect("/active-shifts");
}
