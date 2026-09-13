import { NativeProductionShell } from "@/shell/native-production-shell";
import { productionRouteIntentFromParam } from "@/shell/production-shell-controller";
import { useLocalSearchParams } from "expo-router";
import { installNativePhysicalDiagnosticsPersistence } from "@/diagnostics/native-physical-diagnostics-persistence";

void installNativePhysicalDiagnosticsPersistence();

export default function IndexRoute() {
  const params = useLocalSearchParams<{ intent?: string | string[] }>();
  const coldIntent = productionRouteIntentFromParam(params.intent);
  return (
    <NativeProductionShell
      coldIntent={coldIntent}
      key={coldIntent?.destination ?? "root"}
    />
  );
}
