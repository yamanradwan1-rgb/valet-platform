import { redirect } from "next/navigation";

/** Legacy bookmarked Dashboard route; canonical surface is Active Shifts. */
export default function EmployeesShiftsRedirectPage() {
  redirect("/active-shifts");
}
