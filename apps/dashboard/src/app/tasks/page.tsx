import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { TasksPage } from "../../features/operations/tasks/tasks-page";

export default function TasksRoute() {
  return <ProtectedDashboardRoute accessRequirement="EMERGENCY_TASKS"><TasksPage /></ProtectedDashboardRoute>;
}
