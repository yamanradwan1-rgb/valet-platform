import type {
  EmployeeRetrievalSession,
  EmployeeRetrievalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import { ScrollView, Text, View } from "react-native";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import {
  EmployeeBadge,
  EmployeeProgress,
} from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeRetrievalCopy } from "./native-retrieval-copy";
import {
  NativeRetrievalKeyCheckout,
  NativeRetrievalReady,
  NativeRetrievalRecover,
  NativeRetrievalRetrieving,
} from "./native-retrieval-stage-content";
import { nativeRetrievalStyles as s } from "./native-retrieval-styles";
import { retrievalVehicle } from "./native-retrieval-details";

/** MOB-013 ends at READY; handoff/release UI is intentionally absent. */
export function NativeRetrievalPanel({
  auth,
  locale,
  onBack,
  onReportIssue,
  retrieval,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly onReportIssue?: ((sessionId: string) => void) | undefined;
  readonly retrieval: EmployeeRetrievalSession;
  readonly snapshot: EmployeeRetrievalSnapshot;
}) {
  const copy = getNativeRetrievalCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  const busy = ["submitting-start", "submitting-ready", "reconciling"].includes(
    snapshot.phase,
  );
  const retrieving =
    snapshot.phase === "retrieving" || snapshot.phase === "submitting-ready";

  return (
    <>
      {retrieving ? (
        <View style={[s.header, { direction }]}>
          <EmployeeBadge
            label={copy.retrievalBadge}
            textAlign={textAlign}
            variant="primary"
          />
          <Text style={[s.heading, employeeTextStyle("human", textAlign)]}>
            {copy.retrievingLabel}{" "}
            {retrievalVehicle(snapshot, copy.vehicle).heading}
          </Text>
        </View>
      ) : (
        <EmployeeBackHeader
          accessibilityLabel={copy.back}
          direction={direction}
          disabled={busy}
          onBack={onBack}
          textAlign={textAlign}
          title={
            snapshot.phase === "key-checkout" ||
            snapshot.phase === "submitting-start"
              ? copy.keyTitle
              : copy.taskTitle
          }
        />
      )}
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "loading" || snapshot.phase === "reconciling" ? (
          <EmployeeProgress
            label={
              snapshot.phase === "loading" ? copy.loading : copy.checkState
            }
            textAlign={textAlign}
          />
        ) : snapshot.phase === "ambiguous" ? (
          <NativeRetrievalRecover
            body={copy.unknownBody}
            copy={copy}
            onCheck={() => void retrieval.checkServerState()}
            textAlign={textAlign}
            title={copy.unknownTitle}
          />
        ) : snapshot.phase === "unavailable" ||
          snapshot.phase === "inactive" ? (
          <NativeRetrievalRecover
            body={copy.unavailableBody}
            copy={copy}
            onBack={onBack}
            onCheck={() => void retrieval.checkServerState()}
            textAlign={textAlign}
            title={copy.unavailableTitle}
          />
        ) : snapshot.phase === "conflict" || snapshot.phase === "assigned" ? (
          <NativeRetrievalRecover
            body={copy.conflictBody}
            copy={copy}
            onBack={onBack}
            onCheck={() => void retrieval.checkServerState()}
            textAlign={textAlign}
            title={copy.conflictTitle}
          />
        ) : snapshot.phase === "key-checkout" ||
          snapshot.phase === "submitting-start" ? (
          <NativeRetrievalKeyCheckout
            auth={auth}
            copy={copy}
            locale={locale}
            retrieval={retrieval}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        ) : snapshot.phase === "retrieving" ||
          snapshot.phase === "submitting-ready" ? (
          <NativeRetrievalRetrieving
            copy={copy}
            locale={locale}
            retrieval={retrieval}
            snapshot={snapshot}
            textAlign={textAlign}
            onReportIssue={
              onReportIssue && snapshot.session
                ? () => onReportIssue(snapshot.session!.sessionId)
                : undefined
            }
          />
        ) : (
          <NativeRetrievalReady
            copy={copy}
            onBack={onBack}
            snapshot={snapshot}
            textAlign={textAlign}
          />
        )}
      </ScrollView>
    </>
  );
}
