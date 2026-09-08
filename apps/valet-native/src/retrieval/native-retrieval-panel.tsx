import type {
  EmployeeRetrievalSession,
  EmployeeRetrievalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import { ScrollView } from "react-native";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeProgress } from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeRetrievalCopy } from "./native-retrieval-copy";
import {
  NativeRetrievalKeyCheckout,
  NativeRetrievalReady,
  NativeRetrievalRecover,
  NativeRetrievalRetrieving,
} from "./native-retrieval-stage-content";
import { nativeRetrievalStyles as s } from "./native-retrieval-styles";

/** MOB-013 ends at READY; handoff/release UI is intentionally absent. */
export function NativeRetrievalPanel({
  auth,
  locale,
  onBack,
  retrieval,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly locale: FoundationLocale;
  readonly onBack: () => void;
  readonly retrieval: EmployeeRetrievalSession;
  readonly snapshot: EmployeeRetrievalSnapshot;
}) {
  const copy = getNativeRetrievalCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  const busy = ["submitting-start", "submitting-ready", "reconciling"].includes(
    snapshot.phase,
  );

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        disabled={busy}
        onBack={onBack}
        textAlign={textAlign}
        title={copy.taskTitle}
      />
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
            retrieval={retrieval}
            snapshot={snapshot}
            textAlign={textAlign}
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
