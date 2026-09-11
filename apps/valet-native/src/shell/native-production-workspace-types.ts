import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeHandoffSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
  EmployeeVehicleDirectorySnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativePushSnapshot } from "../notifications/native-push-types";
import type { NativeRetrievalAttentionItem } from "../tasks/native-retrieval-attention";
import type { NativeContextualPresentation } from "./use-native-contextual-route";
import type {
  ProductionDestination,
  ProductionShellState,
} from "./production-shell-controller";

type ActiveShell = Extract<ProductionShellState, { readonly kind: "active" }>;

export interface NativeProductionWorkspaceProps {
  readonly authSnapshot: NativeAuthSnapshot;
  readonly confirmParking: EmployeeConfirmParkedSnapshot;
  readonly connectivityOnline?: boolean | undefined;
  readonly contextual: NativeContextualPresentation;
  readonly handoff: EmployeeHandoffSnapshot;
  readonly locale: FoundationLocale;
  readonly navigate: (destination: ProductionDestination) => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly push: {
    readonly requestPermission: () => Promise<void>;
    readonly snapshot: NativePushSnapshot;
  };
  readonly retrieval: EmployeeRetrievalSnapshot;
  readonly release: EmployeeReleaseSnapshot;
  readonly retrievalAttention: {
    readonly attention: readonly NativeRetrievalAttentionItem[];
    readonly dismiss: (item: NativeRetrievalAttentionItem) => void;
    readonly openCurrentTaskQueue: () => void;
  };
  readonly runtime: NativeEmployeeRuntime;
  readonly shell: ActiveShell;
  readonly vehicleDirectory: EmployeeVehicleDirectorySnapshot;
}
