import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { StaffPage } from "../../features/administration/staff/staff-page";

export default function EmployeesRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><StaffPage /></ProtectedDashboardRoute>;
}
