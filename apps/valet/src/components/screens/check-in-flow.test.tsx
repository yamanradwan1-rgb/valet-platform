import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CheckInFlow } from "./check-in-flow";
import {
  CheckInCustomerPhoneStep,
  CheckInVehicleConditionStep,
} from "./check-in/check-in-intake-steps";
import { CheckInParkingTaskStep } from "./check-in/check-in-late-steps";
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
        plateCountry="JO"
        plateNumber=""
        onCapturedContinue={vi.fn()}
        onChangePlateCountry={vi.fn()}
        onChangePlateNumber={vi.fn()}
        onNoPlate={vi.fn()}
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
        plateCountry="JO"
        plateNumber=""
        onCapturedContinue={vi.fn()}
        onChangePlateCountry={vi.fn()}
        onChangePlateNumber={vi.fn()}
        onNoPlate={vi.fn()}
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

  it("renders CheckInParkingTaskStep with no Key Slot presence at all", () => {
    // DEC-068 review fix: Key Slot has NO presence in the pre-parking
    // experience — neither an assigned code nor a "Not assigned" placeholder.
    // Its first UI appearance is the post-parking deposit/scan step.
    const taskMarkup = renderToStaticMarkup(
      <CheckInParkingTaskStep
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onStartParking={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(taskMarkup).toContain("Parking Task");
    expect(taskMarkup).toContain("Start Parking");
    expect(taskMarkup).not.toContain("B-214");
    expect(taskMarkup).not.toContain("Key Slot");
    expect(taskMarkup).not.toContain("Not assigned");
    expect(taskMarkup).not.toContain('<bdi dir="ltr">Not assigned</bdi>');
  });
});
