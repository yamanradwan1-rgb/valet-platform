import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import {
  useEmployeeAppearance,
  useEmployeeStyles,
} from "../../appearance/employee-appearance-context";
import type { EmployeeAppearanceMode } from "../../appearance/employee-palette";
import { NativeCheckInParkingTaskStep } from "../../check-in/native-check-in-parking-task-step";
import { getNativeCheckInCopy } from "../../check-in/native-check-in-copy";
import { CheckInHeader } from "../../check-in/native-check-in-primitives";
import { checkInStylesTheme } from "../../check-in/native-check-in-styles";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../../employee-ui/employee-frame";
import type { FoundationLocale } from "../../foundation/foundation-locale";
import { NativeActiveHeaderUtilities } from "../../shell/native-active-header-utilities";
import { NativeProductionNavigation } from "../../shell/native-production-navigation";
import {
  whatsAppPrototypeScope,
  whatsAppPrototypeSnapshot,
} from "./native-whatsapp-prototype-fixture";
import { NativeWhatsAppPrototypeButton } from "./native-whatsapp-prototype-button";
import {
  nextWhatsAppDemoState,
  type WhatsAppDemoState,
} from "./native-whatsapp-prototype-state";

const noOperation = () => {};

/** Isolated display fixture. Never construct the production shell/runtime here. */
export function NativeWhatsAppPrototypeScreen(props: PrototypeProps) {
  const { ready } = useEmployeeAppearance();
  return __DEV__ && ready ? <PrototypeScreen {...props} /> : null;
}

interface PrototypeProps {
  readonly baseline: boolean;
  readonly initialState: WhatsAppDemoState;
  readonly locale: FoundationLocale;
  readonly theme: EmployeeAppearanceMode;
  readonly onBack: () => void;
}

function PrototypeScreen({
  baseline,
  initialState,
  locale,
  theme,
  onBack,
}: PrototypeProps) {
  const { palette, select } = useEmployeeAppearance();
  const originalTheme = useRef(palette.mode);
  useEffect(() => {
    const previous = originalTheme.current;
    select(theme);
    return () => select(previous);
  }, [theme, select]);
  const styles = useEmployeeStyles(checkInStylesTheme);
  const copy = getNativeCheckInCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  const [state, setState] = useState(initialState);
  const choice = `${initialState}:${locale}:${theme}:${baseline}`;
  const [previousChoice, setPreviousChoice] = useState(choice);
  // React discards this stale render and immediately renders the finite choice.
  if (previousChoice !== choice) {
    setPreviousChoice(choice);
    setState(initialState);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keep the preview session mounted so its original appearance survives query
  // changes. Reset only local demo work when a finite preview choice changes.
  useEffect(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, [choice]);
  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );
  const advance = () => {
    if (timer.current !== undefined) return;
    const next = nextWhatsAppDemoState(state);
    setState(next);
    // This local animation illustrates queueing, never a backend response.
    if (next === "loading") {
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setState("queued");
      }, 900);
    }
  };

  return (
    <EmployeeFrame direction={direction}>
      <EmployeeAppHeader
        scope={whatsAppPrototypeScope}
        textAlign={textAlign}
        utilities={
          <NativeActiveHeaderUtilities
            locale={locale}
            onRequestNotificationPermission={async () => {}}
            onSelectLocale={noOperation}
            pushSnapshot={{
              attentionIntentIds: [],
              channelAvailable: true,
              permission: "unavailable",
              registration: "idle",
            }}
            scope={whatsAppPrototypeScope}
          />
        }
      />
      <View style={{ flex: 1, minHeight: 0 }}>
        <CheckInHeader
          back={copy.back}
          direction={direction}
          onBack={onBack}
          textAlign={textAlign}
          title={copy.parkingTask}
        />
        <ScrollView
          contentContainerStyle={[styles.body, { direction }]}
          keyboardShouldPersistTaps="handled"
        >
          <NativeCheckInParkingTaskStep
            copy={copy}
            error={false}
            locale={locale}
            onOpenGuestAccess={noOperation}
            onStart={noOperation}
            snapshot={whatsAppPrototypeSnapshot}
            starting={false}
            textAlign={textAlign}
            whatsAppPrototype={
              baseline ? undefined : (
                <NativeWhatsAppPrototypeButton
                  locale={locale}
                  onAdvance={advance}
                  state={state}
                />
              )
            }
          />
        </ScrollView>
      </View>
      <NativeProductionNavigation
        activeDestination="check-in"
        locale={locale}
        onNavigate={noOperation}
        pinned
      />
    </EmployeeFrame>
  );
}
