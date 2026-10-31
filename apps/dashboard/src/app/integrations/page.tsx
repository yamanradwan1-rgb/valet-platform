import { redirect, RedirectType } from "next/navigation";

export default function IntegrationsRoute() {
  redirect("/policies", RedirectType.replace);
}
