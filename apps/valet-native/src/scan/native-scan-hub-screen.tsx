import { ScrollView, StyleSheet, Text, View } from "react-native";

import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  launchNativeScanHubTile,
  type NativeScanHubGates,
} from "./native-scan-hub-gates";
import {
  NativeScanHandoffIcon,
  NativeScanKeyIcon,
  NativeScanPlateIcon,
  NativeScanSpotIcon,
} from "./native-scan-hub-icons";
import { getNativeScanHubCopy } from "./native-scan-hub-copy";
import { NativeScanHubTile } from "./native-scan-hub-tile";
import type { ProductionDestination } from "../shell/production-shell-controller";

export const NATIVE_SCAN_HUB_COLUMNS = 2;

export function NativeScanHubScreen(props: {
  readonly gates: NativeScanHubGates;
  readonly locale: FoundationLocale;
  readonly navigate: (destination: ProductionDestination) => void;
  readonly textAlign: "left" | "right";
}) {
  const copy = getNativeScanHubCopy(props.locale);
  const human = employeeTextStyle("human", props.textAlign);
  const launch = (tile: Parameters<typeof launchNativeScanHubTile>[0]) =>
    launchNativeScanHubTile(tile, props.gates, props.navigate);
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      testID="native-scan-hub-screen"
    >
      <Text accessibilityRole="header" style={[styles.title, human]}>
        {copy.scan}
      </Text>
      <Text style={[styles.subtitle, human]}>{copy.subtitle}</Text>
      <View style={styles.grid} testID="native-scan-hub-grid">
        <NativeScanHubTile
          accent={c.blue}
          disabled={!props.gates.licensePlate.available}
          glyph={<NativeScanPlateIcon />}
          label={copy.licensePlate}
          onPress={() => launch("licensePlate")}
          subtitle={copy.licensePlateSubtitle}
          textAlign={props.textAlign}
        />
        <NativeScanHubTile
          accent={c.navy3}
          disabled
          glyph={<NativeScanKeyIcon />}
          label={copy.keySlot}
          subtitle={copy.keySlotDisabled}
          textAlign={props.textAlign}
        />
        <NativeScanHubTile
          accent={c.warning}
          disabled={!props.gates.parkingSpot.available}
          glyph={<NativeScanSpotIcon />}
          label={copy.parkingSpot}
          onPress={() => launch("parkingSpot")}
          subtitle={
            props.gates.parkingSpot.available
              ? copy.parkingResume
              : copy.parkingDisabled
          }
          textAlign={props.textAlign}
        />
        <NativeScanHubTile
          accent={c.success}
          disabled={!props.gates.pickupHandoff.available}
          glyph={<NativeScanHandoffIcon />}
          label={copy.pickupHandoff}
          onPress={() => launch("pickupHandoff")}
          subtitle={
            props.gates.pickupHandoff.available
              ? copy.retrievalResume
              : copy.retrievalDisabled
          }
          textAlign={props.textAlign}
        />
      </View>
    </ScrollView>
  );
}

export const nativeScanHubScreenStyles = StyleSheet.create({
  grid: {
    columnGap: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 16,
  },
  screen: { padding: 20 },
  subtitle: {
    ...type.body,
    color: c.neutral,
    marginBottom: 24,
  },
  title: {
    ...type.pageTitle,
    color: c.navy,
    marginBottom: 4,
  },
});

const styles = nativeScanHubScreenStyles;
