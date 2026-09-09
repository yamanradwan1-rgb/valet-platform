import { Pressable, Text, View } from "react-native";
import type {
  EmployeeCheckInConditionSelection,
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInConditionCopy } from "./native-check-in-condition-copy";
import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInError,
  CheckInErrorNotice,
  type NativeTextAlign,
  VehicleCard,
} from "./native-check-in-primitives";
import { checkInTextStyle } from "./native-check-in-presentation";
import { checkInStyles as s } from "./native-check-in-styles";
import { EmployeeCheckIcon } from "../employee-ui/employee-icons";

export interface ConditionStepProps {
  readonly conditionCopy: NativeCheckInConditionCopy;
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}

const OPTIONS: ReadonlyArray<{
  readonly label: keyof Pick<
    NativeCheckInConditionCopy,
    "existingDamage" | "needsReview" | "noVisibleIssue"
  >;
  readonly value: EmployeeCheckInConditionSelection;
}> = [
  { label: "noVisibleIssue", value: "No visible issue" },
  { label: "existingDamage", value: "Existing damage" },
  { label: "needsReview", value: "Needs review" },
];

/**
 * Employee Web parity for the Vehicle Condition step: the same three
 * options with the same selected-state treatment, a truthful policy notice,
 * and one dominant Continue action when Native can complete the step.
 * Selection drives the portable session; the server stays authoritative.
 */
export function NativeCheckInConditionStep({
  conditionCopy: c,
  copy,
  session,
  snapshot,
  textAlign,
}: ConditionStepProps) {
  const continuation = snapshot.continuation;
  const active = snapshot.active;
  if (active === null) return null;
  const selected = continuation.conditionSelection;
  const submitting = continuation.mode === "submitting";
  const ambiguous = continuation.mode === "ambiguous";
  const photoRequired = isPhotoRequiredError(snapshot);
  const failure = conditionErrorMessage(c, snapshot);
  return (
    <>
      {ambiguous ? (
        <CheckInErrorNotice
          textAlign={textAlign}
          title={c.conditionUnknownTitle}
        >
          {c.conditionUnknown}
        </CheckInErrorNotice>
      ) : null}
      <VehicleCard
        fallback={copy.vehicle}
        textAlign={textAlign}
        vehicle={active.vehicle}
      />
      <View style={s.options}>
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          const label = c[option.label];
          return (
            <Pressable
              accessibilityLabel={`${label}${isSelected ? `, ${c.selected}` : ""}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              disabled={submitting || photoRequired}
              key={option.value}
              onPress={
                photoRequired
                  ? undefined
                  : () => session.setConditionSelection(option.value)
              }
              style={[
                s.option,
                isSelected && s.optionSelected,
                (submitting || photoRequired) && s.optionDisabled,
              ]}
            >
              <View
                accessibilityElementsHidden
                style={[s.optionCircle, isSelected && s.optionCircleSelected]}
              >
                {isSelected ? <EmployeeCheckIcon inverse /> : null}
              </View>
              <Text
                style={[
                  s.optionLabel,
                  isSelected && s.optionLabelSelected,
                  checkInTextStyle("human", textAlign),
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!photoRequired ? (
        <View style={s.policyNotice}>
          <Text
            style={[
              s.policyNoticeText,
              checkInTextStyle("human", textAlign),
              { textAlign: "center" },
            ]}
          >
            {c.photoPolicyNotice}
          </Text>
        </View>
      ) : null}
      {failure ? (
        <CheckInError textAlign={textAlign}>{failure}</CheckInError>
      ) : null}
      {photoRequired ? null : ambiguous ? (
        <CheckInButton
          label={copy.checkServer}
          onPress={() => void session.retryConditionRecovery()}
        />
      ) : (
        <CheckInButton
          busy={submitting}
          disabled={submitting}
          label={submitting ? c.completingCondition : copy.continueLabel}
          onPress={() => void session.submitConditionCompletion()}
        />
      )}
    </>
  );
}

function isPhotoRequiredError(snapshot: EmployeeCheckInSnapshot): boolean {
  return (
    snapshot.error?.code === "CHECK_IN_CONDITION_PHOTO_REQUIRED" ||
    snapshot.error?.code === "PHOTO_REQUIREMENT_NOT_SATISFIED"
  );
}

function conditionErrorMessage(
  c: NativeCheckInConditionCopy,
  snapshot: EmployeeCheckInSnapshot,
): string | null {
  const code = snapshot.error?.code;
  if (!code) return null;
  if (isPhotoRequiredError(snapshot)) return c.photoRequired;
  if (code === "VERSION_CONFLICT" || code === "INVALID_STATE_TRANSITION") {
    return c.conflictBody;
  }
  if (code === "CONDITION_COMPLETION_UNRESOLVED") return c.conditionUnknown;
  return c.genericFailure;
}
