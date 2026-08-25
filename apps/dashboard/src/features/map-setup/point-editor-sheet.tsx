"use client";

import { useState } from "react";
import type {
  CreateLocationMapPointRequest,
  LocationMapPoint,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";

import { ListDetailSheet } from "../../components/ui/list-detail-sheet";
import { pointKindLabelKey } from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import type { MapCenter } from "../../lib/maps/map-provider";
import {
  FormActions,
  SelectField,
  SheetError,
  TextField,
  ToggleRow,
} from "./editor-fields";
import { parseCoordinate } from "./map-geometry";
import { buildPointPatch } from "./map-setup-state";

interface PointEditorSheetProps {
  /** null creates a new point; otherwise edits this authoritative snapshot. */
  readonly original: LocationMapPoint | null;
  /** Latest map click while the sheet is open; fills the coordinate fields. */
  readonly pickedCoordinate: MapCenter | null;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onCreate: (request: CreateLocationMapPointRequest) => void;
  readonly onUpdate: (
    pointId: string,
    patch: UpdateLocationMapPointRequest,
  ) => void;
  readonly onClose: () => void;
}

/**
 * Create/edit sheet for map points. Coordinates are parsed without rounding;
 * the values typed (or picked on the map) are the exact numbers sent to the
 * backend. Client validation mirrors contract bounds for usability only —
 * the backend stays authoritative.
 */
export function PointEditorSheet({
  original,
  pickedCoordinate,
  saving,
  errorMessage,
  onCreate,
  onUpdate,
  onClose,
}: PointEditorSheetProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState(original?.code ?? "");
  const [label, setLabel] = useState(original?.label ?? "");
  const [kind, setKind] = useState<LocationMapPoint["kind"]>(
    original?.kind ?? "ENTRANCE",
  );
  const [latitudeText, setLatitudeText] = useState(
    original === null ? "" : String(original.latitude),
  );
  const [longitudeText, setLongitudeText] = useState(
    original === null ? "" : String(original.longitude),
  );
  const [levelLabel, setLevelLabel] = useState(original?.levelLabel ?? "");
  const [active, setActive] = useState(original?.active ?? true);

  // Adopt map-picked coordinates during render (React's "adjust state when a
  // prop changes" pattern) instead of an effect: the fields update with the
  // same render that receives the new coordinate.
  const [adoptedPick, setAdoptedPick] = useState<MapCenter | null>(null);
  if (pickedCoordinate !== adoptedPick) {
    setAdoptedPick(pickedCoordinate);
    if (pickedCoordinate !== null) {
      setLatitudeText(String(pickedCoordinate.latitude));
      setLongitudeText(String(pickedCoordinate.longitude));
    }
  }

  const trimmedCode = code.trim();
  const trimmedLabel = label.trim();
  const latitude = parseCoordinate(latitudeText, "latitude");
  const longitude = parseCoordinate(longitudeText, "longitude");

  const latitudeInvalid =
    latitude === null && latitudeText.trim() !== "" ? true : false;
  const longitudeInvalid =
    longitude === null && longitudeText.trim() !== "" ? true : false;

  const nextLevel = levelLabel.trim() === "" ? null : levelLabel.trim();

  const kindOptions = (
    ["ENTRANCE", "PICKUP", "DROP_OFF"] as const
  ).map((value) => ({
    label: t(pointKindLabelKey(value)),
    value,
  }));

  const fieldsValid =
    trimmedCode.length > 0 &&
    trimmedCode.length <= 64 &&
    trimmedLabel.length > 0 &&
    trimmedLabel.length <= 160 &&
    (nextLevel === null || nextLevel.length <= 64);

  const changedKeys: UpdateLocationMapPointRequest =
    original === null
      ? {}
      : buildPointPatch(original, {
          active,
          code: trimmedCode,
          kind,
          label: trimmedLabel,
          latitude,
          levelLabel: nextLevel,
          longitude,
        });

  const hasChanges = Object.keys(changedKeys).length > 0;

  function handleSubmit(): void {
    if (!fieldsValid || latitude === null || longitude === null) return;
    if (original === null) {
      onCreate({
        active,
        code: trimmedCode,
        kind,
        label: trimmedLabel,
        latitude,
        levelLabel: nextLevel,
        longitude,
      });
      return;
    }
    if (hasChanges) onUpdate(original.id, changedKeys);
  }

  return (
    <ListDetailSheet
      title={
        original === null
          ? t("mapSetup.editor.pointCreateTitle")
          : t("mapSetup.editor.pointEditTitle")
      }
      onClose={onClose}
    >
      <p className="list-scope-hint">{t("mapSetup.editor.pointNote")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
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
          label={t("mapSetup.field.kind")}
          onChange={(value) => setKind(value as LocationMapPoint["kind"])}
          options={kindOptions}
          value={kind}
        />
        <div className="map-setup-coordinate-grid">
          <TextField
            error={latitudeInvalid ? t("mapSetup.validation.latitudeInvalid") : undefined}
            inputMode="decimal"
            label={t("mapSetup.field.latitude")}
            onChange={setLatitudeText}
            value={latitudeText}
          />
          <TextField
            error={
              longitudeInvalid ? t("mapSetup.validation.longitudeInvalid") : undefined
            }
            inputMode="decimal"
            label={t("mapSetup.field.longitude")}
            onChange={setLongitudeText}
            value={longitudeText}
          />
        </div>
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
          disabled={!fieldsValid || latitude === null || longitude === null}
          onCancel={onClose}
          saving={saving}
          savingLabel={t("mapSetup.editor.saving")}
          submitLabel={
            original === null
              ? t("mapSetup.editor.create")
              : t("mapSetup.editor.save")
          }
        />
      </form>
    </ListDetailSheet>
  );
}
