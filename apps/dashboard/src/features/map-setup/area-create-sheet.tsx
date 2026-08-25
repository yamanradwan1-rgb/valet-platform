"use client";

import { useMemo, useState } from "react";
import type { CreateLocationMapAreaRequest } from "@valet/contracts";

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
import {
  MAX_VERTICES,
  MIN_VERTICES,
  parseVertexList,
} from "./map-geometry";

interface AreaCreateSheetProps {
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onCreate: (request: CreateLocationMapAreaRequest) => void;
  readonly onClose: () => void;
}

/**
 * Create sheet for polygon areas. The vertex textarea is the single source of
 * geometry: lines are parsed in typed order and sent verbatim — no sorting,
 * no closing vertex, no inference.
 */
export function AreaCreateSheet({
  saving,
  errorMessage,
  onCreate,
  onClose,
}: AreaCreateSheetProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<CreateLocationMapAreaRequest["purpose"]>(
    "PARKING",
  );
  const [levelLabel, setLevelLabel] = useState("");
  const [active, setActive] = useState(true);
  const [vertexText, setVertexText] = useState("");

  const trimmedCode = code.trim();
  const trimmedLabel = label.trim();
  const nextLevel = levelLabel.trim() === "" ? null : levelLabel.trim();

  const parsedVertices = useMemo(() => parseVertexList(vertexText), [vertexText]);
  const vertexFormatError =
    parsedVertices === null && vertexText.trim() !== "";
  const vertexCount =
    parsedVertices === null ? 0 : parsedVertices.length;
  const vertexCountError =
    parsedVertices !== null &&
    (parsedVertices.length < MIN_VERTICES ||
      parsedVertices.length > MAX_VERTICES);

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

  const canSubmit =
    fieldsValid &&
    parsedVertices !== null &&
    parsedVertices.length >= MIN_VERTICES &&
    parsedVertices.length <= MAX_VERTICES;

  return (
    <ListDetailSheet
      title={t("mapSetup.editor.areaCreateTitle")}
      onClose={onClose}
    >
      <p className="list-scope-hint">{t("mapSetup.editor.areaCreateNote")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || parsedVertices === null) return;
          onCreate({
            active,
            code: trimmedCode,
            label: trimmedLabel,
            levelLabel: nextLevel,
            // New areas start unlinked: the backend has no dashboard-facing
            // parking-zone discovery endpoint, so no value can be truthfully
            // chosen here. Linking happens through parking-zone tooling.
            parkingZoneId: null,
            purpose,
            vertices: parsedVertices.map((vertex) => ({
              latitude: vertex.latitude,
              longitude: vertex.longitude,
            })),
          });
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
            setPurpose(value as CreateLocationMapAreaRequest["purpose"])
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
          <label>
            {t("mapSetup.field.vertices")} ·{" "}
            {t("mapSetup.editor.verticesFormat")}
            <textarea
              className="form-input map-setup-vertex-textarea"
              onChange={(event) => setVertexText(event.target.value)}
              rows={7}
              spellCheck={false}
              value={vertexText}
            />
          </label>
          <p className="list-scope-hint">
            {t("mapSetup.editor.currentVertexCount")}:{" "}
            <span className="tabular-nums">{vertexCount}</span>
          </p>
          {(vertexFormatError || vertexCountError) && (
            <p className="form-error">
              {vertexFormatError
                ? t("mapSetup.validation.verticesFormat")
                : parsedVertices !== null &&
                    parsedVertices.length < MIN_VERTICES
                  ? t("mapSetup.validation.verticesMinimum")
                  : t("mapSetup.validation.verticesMaximum")}
            </p>
          )}
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
          disabled={!canSubmit}
          onCancel={onClose}
          saving={saving}
          savingLabel={t("mapSetup.editor.saving")}
          submitLabel={t("mapSetup.editor.create")}
        />
      </form>
    </ListDetailSheet>
  );
}
