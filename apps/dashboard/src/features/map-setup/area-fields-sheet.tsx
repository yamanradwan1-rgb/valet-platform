"use client";

import { useState } from "react";
import type {
  LocationMapArea,
  UpdateLocationMapAreaRequest,
} from "@valet/contracts";

import { ListDetailSheet } from "../../components/ui/list-detail-sheet";
import { areaPurposeLabelKey } from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import {
  FormActions,
  SelectField,
  SheetError,
  TextField,
  ToggleRow,
} from "./editor-fields";
import { buildAreaPatch } from "./map-setup-state";

interface AreaFieldsSheetProps {
  readonly original: LocationMapArea;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onUpdate: (
    areaId: string,
    patch: UpdateLocationMapAreaRequest,
  ) => void;
  readonly onClose: () => void;
}

/**
 * Area METADATA editor.
 *
 * Vertices deliberately have no field here: the backend keeps metadata
 * updates and vertex replacement as separate operations and this sheet
 * preserves that boundary.
 *
 * parkingZoneId is shown READ-ONLY when present: the backend has no
 * dashboard-facing parking-zone discovery endpoint, so this surface never
 * asks users to guess or paste an arbitrary UUID and never silently alters
 * an existing reference. Unrelated edits preserve it verbatim (the patch is
 * changed-fields-only). Creation starts unlinked (null).
 */
export function AreaFieldsSheet({
  original,
  saving,
  errorMessage,
  onUpdate,
  onClose,
}: AreaFieldsSheetProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState(original.code);
  const [label, setLabel] = useState(original.label);
  const [purpose, setPurpose] = useState<LocationMapArea["purpose"]>(
    original.purpose,
  );
  const [levelLabel, setLevelLabel] = useState(original.levelLabel ?? "");
  const [active, setActive] = useState(original.active);

  const trimmedCode = code.trim();
  const trimmedLabel = label.trim();
  const nextLevel = levelLabel.trim() === "" ? null : levelLabel.trim();

  const purposeOptions = (
    ["PARKING", "OVERFLOW", "STAGING", "RESTRICTED"] as const
  ).map((value) => ({
    label: t(areaPurposeLabelKey(value)),
    value,
  }));

  const fieldsValid =
    trimmedCode.length > 0 &&
    trimmedCode.length <= 64 &&
    trimmedLabel.length > 0 &&
    trimmedLabel.length <= 160 &&
    (nextLevel === null || nextLevel.length <= 64);

  // The authoritative parkingZoneId is passed through untouched: with no
  // discovery source this editor cannot invent a replacement value, so the
  // diff builder can never include it.
  const patch = buildAreaPatch(original, {
    active,
    code: trimmedCode,
    label: trimmedLabel,
    levelLabel: nextLevel,
    parkingZoneId: original.parkingZoneId,
    purpose,
  });
  const hasChanges = Object.keys(patch).length > 0;

  return (
    <ListDetailSheet
      title={t("mapSetup.editor.areaFieldsTitle")}
      onClose={onClose}
    >
      <p className="list-scope-hint">{t("mapSetup.editor.areaFieldsNote")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (fieldsValid && hasChanges) {
            onUpdate(original.id, patch);
          }
        }}
      >
        <TextField
          error={
            trimmedCode.length === 0
              ? t("mapSetup.validation.codeRequired")
              : trimmedCode.length > 64
                ? t("mapSetup.validation.codeTooLong")
                : undefined
          }
          label={t("mapSetup.field.code")}
          onChange={setCode}
          value={code}
        />
        <TextField
          error={
            trimmedLabel.length === 0
              ? t("mapSetup.validation.labelRequired")
              : trimmedLabel.length > 160
                ? t("mapSetup.validation.labelTooLong")
                : undefined
          }
          label={t("mapSetup.field.label")}
          onChange={setLabel}
          value={label}
        />
        <SelectField
          label={t("mapSetup.field.purpose")}
          onChange={(value) =>
            setPurpose(value as LocationMapArea["purpose"])
          }
          options={purposeOptions}
          value={purpose}
        />
        <TextField
          error={
            nextLevel !== null && nextLevel.length > 64
              ? t("mapSetup.validation.levelTooLong")
              : undefined
          }
          inputMode="text"
          label={t("mapSetup.field.levelLabelOptional")}
          onChange={setLevelLabel}
          value={levelLabel}
        />
        <div className="form-field">
          <p className="detail-field-label">
            {t("mapSetup.field.parkingZoneId")}
          </p>
          <p className="detail-field-value is-mono">
            {original.parkingZoneId ?? "—"}
          </p>
          <p className="list-scope-hint">
            {t("mapSetup.field.parkingZoneHint")}
          </p>
        </div>
        <ToggleRow
          activeLabel={t("mapSetup.state.active")}
          inactiveLabel={t("mapSetup.state.inactive")}
          label={t("mapSetup.field.active")}
          onChange={setActive}
          value={active}
        />
        <SheetError message={errorMessage} />
        <FormActions
          cancelLabel={t("mapSetup.action.cancel")}
          disabled={!fieldsValid || !hasChanges}
          onCancel={onClose}
          saving={saving}
          savingLabel={t("mapSetup.editor.saving")}
          submitLabel={t("mapSetup.editor.save")}
        />
      </form>
    </ListDetailSheet>
  );
}
