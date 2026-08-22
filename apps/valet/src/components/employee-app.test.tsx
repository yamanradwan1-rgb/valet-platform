import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeApp } from "./employee-app";
import { CheckInFlow } from "./screens/check-in-flow";
import { IncidentFlow } from "./screens/incident-flow";
import { ParkingFlow } from "./screens/parking-flow";
import { RetrievalFlow } from "./screens/retrieval-flow";
import { ScanHubScreen } from "./screens/scan-hub-screen";
import { ShiftStartScreen } from "./screens/shift-start-screen";
import { ShiftSummaryScreen } from "./screens/shift-summary-screen";
import { TaskQueueScreen } from "./screens/task-queue-screen";
import { VehiclesListScreen } from "./screens/vehicles-list-screen";
import { AppHeader } from "./shell/app-header";
import { BottomNav } from "./shell/bottom-nav";
import { OfflineBanner } from "./ui/employee-primitives";
import { StaffAuthProvider } from "../lib/auth/staff-auth-context";
import { StaffAuthClient } from "../lib/auth/staff-auth-client";

describe("EmployeeApp & Screen Component Baseline", () => {
  it("renders ShiftStartScreen as the initial state of explicit prototype mode", () => {
    const markup = renderToStaticMarkup(<EmployeeApp mode="prototype" />);
    expect(markup).toContain("Start Shift");
    expect(markup).toContain("Mohammed Khalil");
    expect(markup).toContain("Four Seasons Amman");
    expect(markup).toContain("Main Entrance");
    expect(markup).toContain("/brand/VAYLET_Logo_Dark_Background.png");
  });

  it("never renders the prototype persona or shift actions while auth is initializing in production mode", () => {
    const markup = renderToStaticMarkup(<EmployeeApp />);
    expect(markup).toContain("Checking staff session");
    expect(markup).not.toContain("Mohammed Khalil");
    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("Start Shift");
    expect(markup).not.toContain("Change Location");
  });

  it("renders ShiftStartScreen with all actions and branding", () => {
    const onStart = vi.fn();
    const markup = renderToStaticMarkup(<ShiftStartScreen onStart={onStart} />);
    expect(markup).toContain("Welcome back");
    expect(markup).toContain("Mohammed Khalil");
    expect(markup).toContain("Four Seasons Amman");
    expect(markup).toContain("Start Shift");
    expect(markup).toContain("Change Location");
  });

  it("renders TaskQueueScreen with priority task and queue list", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<TaskQueueScreen nav={nav} />);
    expect(markup).toContain("Tasks");
    expect(markup).toContain("New Vehicle");
    expect(markup).toContain("Shift active");
    expect(markup).toContain("02:14");
    expect(markup).toContain("Accept Task");
    expect(markup).toContain("Toyota Camry");
    expect(markup).toContain("Mercedes E-Class");
    expect(markup).toContain("Audi Q7");
  });

  it("renders CheckInFlow initial plate-scan step", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<CheckInFlow mode="prototype" nav={nav} />);
    expect(markup).toContain("Scan Plate");
    expect(markup).toContain("Simulate Plate Detection");
    expect(markup).toContain("Enter manually");
  });

  it("renders ParkingFlow in-progress view", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<ParkingFlow mode="prototype" nav={nav} />);
    expect(markup).toContain("Parking Vehicle");
    expect(markup).toContain("Park Vehicle");
    expect(markup).toContain("Report Issue");
    expect(markup).toContain("Parking area");
  });

  it("renders RetrievalFlow task view", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<RetrievalFlow nav={nav} />);
    expect(markup).toContain("Retrieval Task");
    expect(markup).toContain("BMW X5");
    expect(markup).toContain("Accept Task");
    expect(markup).toContain("Zone B · Spot B-17");
  });

  it("renders IncidentFlow type selector view", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<IncidentFlow nav={nav} />);
    expect(markup).toContain("Report Incident");
    expect(markup).toContain("Select incident type");
    expect(markup).toContain("Vehicle damage");
    expect(markup).toContain("Key missing");
    expect(markup).toContain("Unauthorized exit");
  });

  it("renders VehiclesListScreen with filters and vehicle cards", () => {
    const markup = renderToStaticMarkup(<VehiclesListScreen />);
    expect(markup).toContain("Vehicles");
    expect(markup).toContain("Search plate or vehicle...");
    expect(markup).toContain("BMW X5");
    expect(markup).toContain("Range Rover Sport");
    expect(markup).toContain("Zone B · B-17");
  });

  it("renders ScanHubScreen with 4 operational scan tiles", () => {
    const nav = vi.fn();
    const markup = renderToStaticMarkup(<ScanHubScreen nav={nav} />);
    expect(markup).toContain("Scan");
    expect(markup).toContain("License Plate");
    expect(markup).toContain("Key QR");
    expect(markup).toContain("Parking Spot");
    expect(markup).toContain("Pickup QR");
  });

  it("renders ShiftSummaryScreen with operational KPIs", () => {
    const markup = renderToStaticMarkup(<ShiftSummaryScreen />);
    expect(markup).toContain("Shift Summary");
    expect(markup).toContain("Check-ins");
    expect(markup).toContain("Parking tasks");
    expect(markup).toContain("Retrievals");
    expect(markup).toContain("Handoffs");
    expect(markup).toContain("Incidents");
    expect(markup).toContain("End Shift");
  });

  it("renders AppHeader and BottomNav shell elements", () => {
    const headerMarkup = renderToStaticMarkup(<AppHeader />);
    expect(headerMarkup).toContain("Four Seasons Amman");
    expect(headerMarkup).toContain("Main Entrance");
    expect(headerMarkup).toContain("MK");
    expect(headerMarkup).toContain("/brand/VAYLET_Logo_Light_Background.png");

    const onTab = vi.fn();
    const navMarkup = renderToStaticMarkup(
      <BottomNav active="home" onTab={onTab} />,
    );
    expect(navMarkup).toContain("Tasks");
    expect(navMarkup).toContain("Vehicles");
    expect(navMarkup).toContain("Scan");
    expect(navMarkup).toContain("Shift");
  });

  it("renders OfflineBanner with sync guarantee notice", () => {
    const markup = renderToStaticMarkup(<OfflineBanner />);
    expect(markup).toContain("Actions will sync when connection returns");
  });

  it("fails closed to the truthful access gate instead of prototype shift-start when unauthenticated", () => {
    const authClient = new StaffAuthClient();
    vi.spyOn(authClient, "getSession").mockReturnValue(null);
    vi.spyOn(authClient, "tryRefresh").mockResolvedValue(null);

    const markup = renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <EmployeeApp />
      </StaffAuthProvider>,
    );

    // Synchronous SSR state is initializing: truthful loading gate only.
    expect(markup).toContain("Checking staff session");
    expect(markup).not.toContain("Welcome back");
    expect(markup).not.toContain("Start Shift");
    expect(markup).not.toContain("Mohammed Khalil");
    expect(markup).not.toContain("BMW X5");
  });
});
