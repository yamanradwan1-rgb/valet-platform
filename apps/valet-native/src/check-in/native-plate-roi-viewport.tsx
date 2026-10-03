import { useCallback } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { CameraView } from "expo-camera";
import type { NativePlateCameraSnapshot } from "./native-plate-camera-controller";
import type { PlateRoiGeometry } from "./native-plate-roi-geometry";
import { employeeColors } from "../employee-ui/employee-tokens";

interface PlateViewportBinding {
  cameraRef(
    value: CameraView | null,
    generation: number,
    mountId: number,
  ): void;
  cameraReady(generation: number, mountId: number): Promise<void>;
  cameraLayout(
    generation: number,
    mountId: number,
    width: number,
    height: number,
  ): void;
  cameraError(generation: number, mountId: number): void;
}

/** Inside the original viewport only: its footprint and surrounding controls stay owned by the screen. */
export function NativePlateRoiViewport({
  snapshot,
  binding,
  geometry,
}: {
  readonly snapshot: NativePlateCameraSnapshot;
  readonly binding: PlateViewportBinding;
  readonly geometry: PlateRoiGeometry | undefined;
}) {
  const { generation, mountId } = snapshot;
  const ref = useCallback(
    (value: CameraView | null) => binding.cameraRef(value, generation, mountId),
    [binding, generation, mountId],
  );
  const currentGeometry =
    geometry?.generation === generation && geometry.mountId === mountId;
  return (
    <View
      key={mountId}
      style={styles.fill}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        binding.cameraLayout(generation, mountId, width, height);
      }}
    >
      <CameraView
        ref={ref}
        facing="back"
        mirror={false}
        mute
        enableTorch={snapshot.torchEnabled}
        pictureSize={snapshot.pictureSize}
        style={styles.fill}
        accessible={false}
        onCameraReady={() => void binding.cameraReady(generation, mountId)}
        onMountError={() => binding.cameraError(generation, mountId)}
      />
      {snapshot.phase === "preview" && currentGeometry ? (
        <View
          testID="plate-roi-guide"
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.guide,
            {
              left: geometry.guide.originX,
              top: geometry.guide.originY,
              width: geometry.guide.width,
              height: geometry.guide.height,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    direction: "ltr",
  },
  guide: {
    position: "absolute",
    borderWidth: 2,
    borderColor: employeeColors.white,
    backgroundColor: "transparent",
    shadowColor: employeeColors.navy,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 1,
    direction: "ltr",
  },
});
