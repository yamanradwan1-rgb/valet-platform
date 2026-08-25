"use client";

import { FoundationPlaceholder } from "../../../components/ui/foundation-placeholder";

export default function Page() {
  return (
    <div className="page-shell">
      <FoundationPlaceholder
        titleKey="page.financial.title"
        descriptionKey="page.financial.description"
      />
    </div>
  );
}
