import { AppShell } from "@valet/ui";

import { appInfo } from "../lib/app-info";

export default function Home() {
  return (
    <AppShell title={appInfo.title}>
      <p>{appInfo.description}</p>
    </AppShell>
  );
}
