import { redirect, RedirectType } from "next/navigation";

export default function IntegrationsRoute() {
  redirect("/policies?tab=services", RedirectType.replace);
}
