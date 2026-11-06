import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("expo-router", () => ({}));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
}));

const { retrievalSnapshot } =
  await import("./native-retrieval-panel-test-fixture");
const { appearanceRenderer } = await import("./appearance-render-evidence");
const { appearanceNodes } = await import("./appearance-render-tree");

const baselineRef = "1d0f5b3563b876e3bc5e687bad779f9bb8e0b965";

function withoutLocationRow(value: unknown, label: string): unknown {
  if (Array.isArray(value))
    return value
      .filter(
        (entry) =>
          !entry?.props?.children?.some?.(
            (child: { props?: { children?: unknown } }) =>
              child?.props?.children === label,
          ),
      )
      .map((entry) => withoutLocationRow(entry, label));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      withoutLocationRow(entry, label),
    ]),
  );
}

describe.each(["light", "dark"] as const)(
  "Retrieval location in %s",
  (mode) => {
    afterEach(() => vi.useRealTimers());

    it.each(["en", "ar"] as const)(
      "preserves each stage and all four location cases in %s",
      (locale) => {
        vi.useFakeTimers();
        const current = appearanceRenderer(mode);
        const baseline = appearanceRenderer(mode, true, undefined, {
          baselineRef,
        });
        const label = locale === "ar" ? "الموقع" : "Location";
        const missing = locale === "ar" ? "غير محدد" : "Not specified";
        const zoneLabel = locale === "ar" ? "المنطقة" : "Zone";
        const spotLabel = locale === "ar" ? "الموقع" : "Spot";
        for (const phase of ["key-checkout", "retrieving", "ready"] as const) {
          for (const [zone, spot, expected] of [
            ["ZONE-LC", "LC-7", `${zoneLabel} ZONE-LC · ${spotLabel} LC-7`],
            ["ZONE-LC", null, `${zoneLabel} ZONE-LC`],
            [null, "LC-7", `${spotLabel} LC-7`],
            [null, null, missing],
          ] as const) {
            const snapshot = retrievalSnapshot(phase);
            const props = {
              auth: {},
              locale,
              onBack: vi.fn(),
              retrieval: {
                enterKeySlot: vi.fn(),
                confirmKeySlot: vi.fn(),
                startRetrieval: vi.fn(),
                markReady: vi.fn(),
              },
              snapshot: {
                ...snapshot,
                keyConfirmed: true,
                session: {
                  ...snapshot.session!,
                  parking: {
                    ...snapshot.session!.parking,
                    parkingZoneCode: zone,
                    parkingSpotCode: spot,
                  },
                },
                task: snapshot.task
                  ? { ...snapshot.task, parkingZone: zone, parkingSpot: spot }
                  : null,
              },
            };
            const file = "retrieval/native-retrieval-panel";
            const after = current.render(file, "NativeRetrievalPanel", props);
            const nodes = appearanceNodes(after);
            const row = nodes.find(
              (node) =>
                Array.isArray(node.props.children) &&
                node.props.children.some(
                  (child) => child?.props?.children === label,
                ),
            )!;
            expect(row, `${phase}/${zone}/${spot}`).toBeDefined();
            const [rowLabel, rowValue] = row.props.children as ReturnType<
              typeof appearanceNodes
            >;
            expect(rowLabel!.props.children).toBe(label);
            expect(rowValue!.props.children).toBe(expected);
            expect(rowValue!.props.style).toMatchObject({
              textAlign: !zone && !spot && locale === "ar" ? "right" : "left",
              writingDirection:
                !zone && !spot && locale === "ar" ? "rtl" : "ltr",
            });
            expect(rowLabel!.props.style).toMatchObject({
              textAlign: locale === "ar" ? "right" : "left",
              writingDirection: locale === "ar" ? "rtl" : "ltr",
            });
            const before = baseline.render(file, "NativeRetrievalPanel", props);
            expect(
              zone || spot ? after : withoutLocationRow(after, label),
            ).toEqual(before);
            // The neutral fallback keeps exactly the existing Location treatment.
            const complete = current.render(file, "NativeRetrievalPanel", {
              ...props,
              snapshot,
            });
            const completeRow = appearanceNodes(complete).find(
              (node) =>
                Array.isArray(node.props.children) &&
                node.props.children.some(
                  (child) => child?.props?.children === label,
                ),
            )!;
            expect(row.props.style).toEqual(completeRow.props.style);
            const completeValue = (
              completeRow.props.children as ReturnType<typeof appearanceNodes>
            )[1]!;
            expect(rowValue!.props.style).toEqual({
              ...(completeValue.props.style as Record<string, unknown>),
              ...(!zone && !spot && locale === "ar"
                ? { textAlign: "right", writingDirection: "rtl" }
                : {}),
            });
            const interactive = appearanceNodes(
              current.render(file, "NativeRetrievalPanel", props, false, true),
            );
            // Use dictionary labels for action copy so this test follows localization.
            const copy = (
              current.load("retrieval/native-retrieval-copy")
                .getNativeRetrievalCopy as (
                locale: string,
              ) => Record<string, string>
            )(locale);
            const actualLabel =
              phase === "key-checkout"
                ? copy.startRetrieval
                : phase === "retrieving"
                  ? copy.vehicleReady
                  : copy.backToTasks;
            const action = interactive.find(
              (node) =>
                node.type === "Pressable" &&
                node.props.accessibilityLabel === actualLabel,
            )!;
            expect(action.props.disabled).toBe(false);
            (action.props.onPress as () => void)();
            expect(
              phase === "key-checkout"
                ? props.retrieval.startRetrieval
                : phase === "retrieving"
                  ? props.retrieval.markReady
                  : props.onBack,
            ).toHaveBeenCalledOnce();
          }
        }
      },
      15_000,
    );

    it("keeps session-first resolution and per-field Task fallback", () => {
      const renderer = appearanceRenderer(mode);
      const copy = (
        renderer.load("retrieval/native-retrieval-copy")
          .getNativeRetrievalCopy as (locale: string) => unknown
      )("en");
      const snapshot = retrievalSnapshot("retrieving");
      for (const [sessionZone, sessionSpot, expected] of [
        ["SESSION-Z", "SESSION-S", "Zone SESSION-Z · Spot SESSION-S"],
        ["SESSION-Z", null, "Zone SESSION-Z · Spot TASK-S"],
        [null, "SESSION-S", "Zone TASK-Z · Spot SESSION-S"],
        [null, null, "Zone TASK-Z · Spot TASK-S"],
      ] as const) {
        const tree = renderer.render(
          "retrieval/native-retrieval-details",
          "NativeRetrievalDetails",
          {
            copy,
            textAlign: "left",
            snapshot: {
              ...snapshot,
              session: {
                ...snapshot.session!,
                parking: {
                  ...snapshot.session!.parking,
                  parkingZoneCode: sessionZone,
                  parkingSpotCode: sessionSpot,
                },
              },
              task: {
                ...snapshot.task!,
                parkingZone: "TASK-Z",
                parkingSpot: "TASK-S",
              },
            },
          },
        );
        expect(
          appearanceNodes(tree).some(
            (node) => node.props.children === expected,
          ),
        ).toBe(true);
      }
    });
  },
);
