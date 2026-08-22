import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CheckInFlow } from "./check-in-flow";
import {
  CheckInCustomerPhoneStep,
  CheckInVehicleConditionStep,
} from "./check-in/check-in-intake-steps";
import {
  CheckInKeyAssignedStep,
  CheckInKeyScanStep,
  CheckInParkingTaskStep,
} from "./check-in/check-in-key-steps";
import {
  CheckInManualPlateStep,
  CheckInPlateConfirmStep,
  CheckInPlateScanStep,
} from "./check-in/check-in-plate-steps";

describe("CheckInFlow Component Steps", () => {
  it("renders CheckInFlow root component in live mode without simulation buttons", () => {
    const markup = renderToStaticMarkup(<CheckInFlow mode="live" nav={vi.fn()} />);
    expect(markup).toContain("Scan Plate");
    expect(markup).not.toContain("Simulate Plate Detection");
    expect(markup).toContain("Enter manually");
  });

  it("renders CheckInPlateScanStep in prototype mode with simulation", () => {
    const markup = renderToStaticMarkup(
      <CheckInPlateScanStep
        mode="prototype"
        scanDone={false}
        onSimulateScan={vi.fn()}
        onManualEntry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Scan Plate");
    expect(markup).toContain("Simulate Plate Detection");
    expect(markup).toContain("Enter manually");
  });

  it("renders CheckInPlateScanStep in live mode without simulation", () => {
    const markup = renderToStaticMarkup(
      <CheckInPlateScanStep
        mode="live"
        scanDone={false}
        onManualEntry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Scan Plate");
    expect(markup).not.toContain("Simulate Plate Detection");
    expect(markup).toContain("Enter manually");
  });

  it("renders CheckInManualPlateStep with country options", () => {
    const markup = renderToStaticMarkup(
      <CheckInManualPlateStep
        plateNumber="12-34567"
        plateCountry="JO"
        onChangePlateNumber={vi.fn()}
        onChangePlateCountry={vi.fn()}
        onNoPlate={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Enter Plate");
    expect(markup).toContain("License Plate");
    expect(markup).toContain("Jordan (JO)");
    expect(markup).toContain("No plate / unreadable plate");
  });

  it("renders CheckInPlateConfirmStep with detected plate vs manual entry truthfulness", () => {
    const detectedMarkup = renderToStaticMarkup(
      <CheckInPlateConfirmStep
        isManualEntry={false}
        plateNumber="12-34567"
        plateCountry="JO"
        make="Porsche"
        model="Taycan"
        color="White"
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(detectedMarkup).toContain("Detected");
    expect(detectedMarkup).toContain("High confidence · JO plate");

    const manualMarkup = renderToStaticMarkup(
      <CheckInPlateConfirmStep
        isManualEntry={true}
        plateNumber="12-34567"
        plateCountry="JO"
        make="Porsche"
        model="Taycan"
        color="White"
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(manualMarkup).toContain("Manual Entry");
    expect(manualMarkup).toContain("Entered plate · JO plate");
    expect(manualMarkup).not.toContain("High confidence");
  });

  it("renders CheckInCustomerPhoneStep", () => {
    const markup = renderToStaticMarkup(
      <CheckInCustomerPhoneStep
        phone="79 123 4567"
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onChangePhone={vi.fn()}
        onContinue={vi.fn()}
        onNoPhone={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Customer Contact");
    expect(markup).toContain("Mobile Number");
    expect(markup).toContain("+962");
    expect(markup).toContain("No phone available");
  });

  it("renders CheckInVehicleConditionStep with condition options", () => {
    const markup = renderToStaticMarkup(
      <CheckInVehicleConditionStep
        condition="No visible issue"
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onSelectCondition={vi.fn()}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Vehicle Condition");
    expect(markup).toContain("No visible issue");
    expect(markup).toContain("Existing damage");
    expect(markup).toContain("Needs review");
  });

  it("renders CheckInKeyScanStep live mode without simulation button", () => {
    const liveMarkup = renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="live"
        keyScanDone={false}
        keySlotCode=""
        onAssignKey={vi.fn()}
        onBack={vi.fn()}
        onChangeKeySlotCode={vi.fn()}
        onManualEntry={vi.fn()}
        onScanAnother={vi.fn()}
      />,
    );
    expect(liveMarkup).toContain("Assign Key");
    expect(liveMarkup).not.toContain("Simulate Key QR Scan");
    expect(liveMarkup).toContain("Enter key slot manually");

    const protoMarkup = renderToStaticMarkup(
      <CheckInKeyScanStep
        mode="prototype"
        keyScanDone={false}
        keySlotCode=""
        onAssignKey={vi.fn()}
        onBack={vi.fn()}
        onChangeKeySlotCode={vi.fn()}
        onManualEntry={vi.fn()}
        onScanAnother={vi.fn()}
        onSimulateScan={vi.fn()}
      />,
    );
    expect(protoMarkup).toContain("Simulate Key QR Scan");
  });

  it("renders CheckInKeyAssignedStep and CheckInParkingTaskStep", () => {
    const assignedMarkup = renderToStaticMarkup(
      <CheckInKeyAssignedStep
        keySlotCode="B-214"
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onCreateParkingTask={vi.fn()}
      />,
    );
    expect(assignedMarkup).toContain("Key B-214 assigned");
    expect(assignedMarkup).toContain("Create Parking Task");

    const taskMarkup = renderToStaticMarkup(
      <CheckInParkingTaskStep
        keySlotCode="B-214"
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onStartParking={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(taskMarkup).toContain("Parking Task");
    expect(taskMarkup).toContain("B-214");
    expect(taskMarkup).toContain("Start Parking");
  });
});
