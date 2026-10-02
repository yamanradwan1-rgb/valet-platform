import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeOperationalScope } from "@valet/employee-client";

import {
  mountStrip,
  resetStripFixture,
  setStripAppState,
  stripLifecycle,
  style,
  type StripProps,
} from "./native-shift-strip-render-fixture";
import { employeeColors } from "../src/employee-ui/employee-tokens";

const scope: EmployeeOperationalScope = {
  locationCode: "AMM-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-04T08:00:00.000Z",
};
const props: StripProps = {
  activeLabel: "Shift active",
  locale: "en",
  scope,
  textAlign: "left",
};
let mounted: ReturnType<typeof mountStrip> | undefined;

beforeEach(() => {
  resetStripFixture();
  vi.useFakeTimers();
  vi.setSystemTime("2026-09-04T10:05:00.000Z");
});
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
});

describe("Native Task live active-shift strip", () => {
  it("derives duration from authoritative start and announces the same fields", () => {
    mounted = mountStrip(props);
    expect(mounted.text()).toBe("Shift active · 2h 5m · Amman Hotel");
    const strip = mounted.nodes()[0]!;
    expect(strip.props.accessible).toBe(true);
    expect(strip.props.accessibilityLabel).toBe(
      "Shift active, 2h 5m, Amman Hotel",
    );
    expect(strip.props).not.toHaveProperty("accessibilityLiveRegion");
    for (const hidden of [
      scope.shiftId,
      scope.membershipId,
      scope.organizationId,
      scope.locationId,
      scope.organizationName,
      scope.role,
    ]) {
      expect(mounted.text()).not.toContain(hidden);
      expect(String(strip.props.accessibilityLabel)).not.toContain(hidden);
    }
  });

  it("updates automatically at the next elapsed minute boundary", () => {
    vi.setSystemTime("2026-09-04T10:05:59.000Z");
    mounted = mountStrip(props);
    vi.advanceTimersByTime(999);
    expect(mounted.text()).toContain("2h 5m");
    vi.advanceTimersByTime(1);
    expect(mounted.text()).toContain("2h 6m");
    vi.advanceTimersByTime(60_000);
    expect(mounted.text()).toContain("2h 7m");
    expect(mounted.nodes()[0]!.props.accessibilityLabel).toContain("2h 7m");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("clamps a future authoritative start to zero", () => {
    mounted = mountStrip({
      ...props,
      scope: { ...scope, shiftStartedAt: "2026-09-04T11:00:00.000Z" },
    });
    expect(mounted.text()).toContain("0h 0m");
  });

  it.each(["background", "inactive"] as const)(
    "pauses in %s and recomputes immediately on foreground",
    (state) => {
      mounted = mountStrip(props);
      setStripAppState(state);
      expect(vi.getTimerCount()).toBe(0);
      vi.setSystemTime("2026-09-04T10:35:00.000Z");
      expect(mounted.text()).toContain("2h 5m");
      setStripAppState("active");
      expect(mounted.text()).toContain("2h 35m");
      expect(vi.getTimerCount()).toBe(1);
      setStripAppState("active");
      expect(vi.getTimerCount()).toBe(1);
    },
  );

  it("does not schedule background work when mounted outside the foreground", () => {
    setStripAppState("background");
    mounted = mountStrip(props);
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime("2026-09-04T11:05:00.000Z");
    setStripAppState("active");
    expect(mounted.text()).toContain("3h 5m");
  });

  it("uses a new authoritative start immediately and retires the old subscription", () => {
    mounted = mountStrip(props);
    mounted.update({
      ...props,
      scope: { ...scope, shiftStartedAt: "2026-09-04T10:00:30.000Z" },
    });
    expect(mounted.text()).toContain("0h 4m");
    expect(stripLifecycle.remove).toHaveBeenCalledOnce();
    expect(stripLifecycle.listeners.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(30_000);
    expect(mounted.text()).toContain("0h 5m");
  });

  it("changes locale immediately using the existing Arabic units", () => {
    mounted = mountStrip(props);
    mounted.update({
      ...props,
      activeLabel: "المناوبة نشطة",
      locale: "ar",
      textAlign: "right",
    });
    expect(mounted.text()).toBe("المناوبة نشطة · 2 س 5 د · Amman Hotel");
    expect(mounted.nodes()[0]!.props.accessibilityLabel).toBe(
      "المناوبة نشطة, 2 س 5 د, Amman Hotel",
    );
    for (const text of mounted.nodes().filter((node) => node.type === "Text")) {
      expect(style(text.props.style)).toMatchObject({
        textAlign: "right",
        writingDirection: "rtl",
      });
    }
    expect(vi.getTimerCount()).toBe(1);
    mounted.update(props);
    expect(mounted.text()).toContain("2h 5m");
  });

  it.each(["active", "background"] as const)(
    "cleans timers/listeners on unmount from %s",
    (state) => {
      mounted = mountStrip(props);
      setStripAppState(state);
      mounted.unmount();
      mounted = undefined;
      expect(stripLifecycle.remove).toHaveBeenCalledOnce();
      expect(stripLifecycle.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      setStripAppState("active");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["en", "ar"] as const)(
    "preserves the exact strip composition/styles in %s",
    (locale) => {
      mounted = mountStrip({
        ...props,
        locale,
        textAlign: locale === "ar" ? "right" : "left",
      });
      const [strip, indicator, line, primary, secondary] = mounted.nodes();
      expect(style(strip!.props.style)).toEqual({
        alignItems: "center",
        backgroundColor: employeeColors.navy3,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
      });
      expect(style(indicator!.props.style)).toEqual({
        backgroundColor: employeeColors.success,
        borderRadius: 999,
        height: 8,
        width: 8,
      });
      expect(indicator!.props.accessible).toBe(false);
      expect(style(line!.props.style)).toEqual({
        alignItems: "center",
        flex: 1,
        flexDirection: "row",
        minWidth: 0,
      });
      expect(style(primary!.props.style)).toMatchObject({
        color: employeeColors.white,
        fontFamily: "Plus Jakarta Sans",
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 16,
      });
      expect(style(secondary!.props.style)).toMatchObject({
        color: employeeColors.muted,
        flexShrink: 1,
        fontFamily: "Plus Jakarta Sans",
        fontSize: 12,
        fontWeight: "400",
        lineHeight: 16,
      });
      expect(primary!.props.numberOfLines).toBe(1);
      expect(secondary!.props.numberOfLines).toBe(1);
      expect(
        mounted.nodes().filter((node) => node.type === "Text"),
      ).toHaveLength(2);
    },
  );
});
