import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Pressable, Text, View } from "react-native";
import type {
  ConditionPhotoSnapshot,
  EmployeeConditionPhotoSession,
  EmployeeCheckInConditionSelection,
  EmployeeLocale,
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
import { checkInStylesTheme as sTheme } from "./native-check-in-styles";
import { EmployeeCheckIcon } from "../employee-ui/employee-icons";
import { NativeConditionPhotoStatus } from "./native-condition-photo-status";
import type { NativeConditionPhotoFiles } from "./native-condition-photo-files";

export interface ConditionStepProps {
  readonly conditionCopy: NativeCheckInConditionCopy;
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
  readonly locale: EmployeeLocale;
  readonly photo: EmployeeConditionPhotoSession;
  readonly photoSnapshot: ConditionPhotoSnapshot;
  readonly files: NativeConditionPhotoFiles;
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
  locale,
  photo,
  photoSnapshot,
  files,
}: ConditionStepProps) {
  const s = useEmployeeStyles(sTheme);

  const continuation = snapshot.continuation;
  const active = snapshot.active;
  if (active === null) return null;
  const selected = continuation.conditionSelection;
  const submitting = continuation.mode === "submitting";
  const ambiguous = continuation.mode === "ambiguous";
  const photoRequired = isPhotoRequiredError(snapshot);
  const photoBlocked = (photoSnapshot.required === true || photoRequired) &&
    !photoSnapshot.qualifying;
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
              disabled={submitting || (photoRequired && !photoSnapshot.qualifying)}
              key={option.value}
              onPress={
                photoRequired && !photoSnapshot.qualifying ? undefined :
                  () => session.setConditionSelection(option.value)
              }
              style={[
                s.option,
                isSelected && s.optionSelected,
                (submitting || (photoRequired && !photoSnapshot.qualifying)) && s.optionDisabled,
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
      <NativeConditionPhotoStatus files={files} locale={locale}
        photo={photo} snapshot={photoSnapshot} />
      {failure ? (
        <CheckInError textAlign={textAlign}>{failure}</CheckInError>
      ) : null}
      {photoRequired && !photoSnapshot.qualifying ? null : ambiguous ? (
        <CheckInButton
          label={copy.checkServer}
          onPress={() => void session.retryConditionRecovery()}
        />
      ) : (
        <CheckInButton
          busy={submitting}
          disabled={submitting || photoBlocked}
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
