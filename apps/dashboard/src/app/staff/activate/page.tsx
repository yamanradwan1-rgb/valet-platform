import type { Metadata } from "next";
import { StaffActivationPage } from "../../../features/administration/staff/staff-activation-page";

export const metadata: Metadata = {
  title: "VAYLET — Activate",
  referrer: "no-referrer",
};

export default function Page() {
  return <StaffActivationPage />;
}
