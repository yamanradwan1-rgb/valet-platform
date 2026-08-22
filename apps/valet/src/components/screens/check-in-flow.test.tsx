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
  it("renders CheckInFlow root component", () => {
    const markup = renderToStaticMarkup(<CheckInFlow nav={vi.fn()} />);
    expect(markup).toContain("Scan Plate");
  });

  it("renders CheckInPlateScanStep", () => {
    const markup = renderToStaticMarkup(
      <CheckInPlateScanStep
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

  it("renders CheckInPlateConfirmStep with detected plate", () => {
    const markup = renderToStaticMarkup(
      <CheckInPlateConfirmStep
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
    expect(markup).toContain("Confirm Plate");
    expect(markup).toContain("12-34567");
    expect(markup).toContain("Porsche Taycan");
    expect(markup).toContain("White");
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
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Customer Contact");
    expect(markup).toContain("Mobile Number");
    expect(markup).toContain("+962");
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

  it("renders CheckInKeyScanStep with key slot input", () => {
    const markup = renderToStaticMarkup(
      <CheckInKeyScanStep
        keyScanDone={true}
        keySlotCode="B-214"
        make="Porsche"
        model="Taycan"
        color="White"
        plate="12-34567"
        onChangeKeySlotCode={vi.fn()}
        onSimulateScan={vi.fn()}
        onManualEntry={vi.fn()}
        onAssignKey={vi.fn()}
        onScanAnother={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(markup).toContain("Assign Key");
    expect(markup).toContain("Key Slot");
    expect(markup).toContain("B-214");
    expect(markup).toContain("Available");
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
