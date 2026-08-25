"use client";

import { useMemo, useState } from "react";
import type {
  LocationMapArea,
  ReplaceLocationMapAreaVerticesRequest,
} from "@valet/contracts";

import { ListDetailSheet } from "../../components/ui/list-detail-sheet";
import { useTranslation } from "../../i18n/locale-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { FormActions, SheetError } from "./editor-fields";
import {
  MAX_VERTICES,
  MIN_VERTICES,
  formatVertexList,
  orderVertices,
  parseVertexList,
} from "./map-geometry";

interface VerticesSheetProps {
  readonly area: LocationMapArea;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onReplace: (
    areaId: string,
    request: ReplaceLocationMapAreaVerticesRequest,
  ) => void;
  readonly onClose: () => void;
}

/**
 * Full vertex replacement for one area. The textarea is prefilled from the
 * authoritative stored order; the typed order is sent verbatim to the exact
 * backend operation. A failed replacement leaves both backend and local state
 * untouched — the prior geometry stays authoritative.
 */
export function VerticesSheet({
  area,
  saving,
  errorMessage,
  onReplace,
  onClose,
}: VerticesSheetProps) {
  const { t } = useTranslation();
  const [vertexText, setVertexText] = useState(() =>
    formatVertexList(orderVertices(area.vertices)),
  );
  const [confirming, setConfirming] = useState(false);

  const parsedVertices = useMemo(() => parseVertexList(vertexText), [vertexText]);
  const vertexFormatError =
    parsedVertices === null && vertexText.trim() !== "";
  const vertexCount = parsedVertices === null ? 0 : parsedVertices.length;
  const countChanged = vertexCount !== area.vertices.length;

  const canSubmit =
    parsedVertices !== null &&
    parsedVertices.length >= MIN_VERTICES &&
    parsedVertices.length <= MAX_VERTICES;

  function requestConfirmation(): void {
    if (canSubmit) setConfirming(true);
  }

  return (
    <ListDetailSheet title={t("mapSetup.editor.verticesTitle")} onClose={onClose}>
      <p className="list-scope-hint">{t("mapSetup.editor.verticesNote")}</p>
      <div className="map-setup-context-row">
        <span className="cell-primary">{area.label}</span>
        <span className="cell-id">{area.code}</span>
        <span>
          {t("mapSetup.field.vertices")}:{" "}
          <span className="tabular-nums">
            {area.vertices.length}
            {countChanged ? ` → ${vertexCount}` : ""}
          </span>{" "}
          {t("mapSetup.state.verticesCountSuffix")}
        </span>
      </div>
      <div className="form-field">
        <label>
          {t("mapSetup.field.vertices")} ·{" "}
          {t("mapSetup.editor.verticesFormat")}
          <textarea
            className="form-input map-setup-vertex-textarea"
            onChange={(event) => setVertexText(event.target.value)}
            rows={9}
            spellCheck={false}
            value={vertexText}
          />
        </label>
        {(vertexFormatError || !canSubmit) && (
          <p className="form-error">
            {vertexFormatError
              ? t("mapSetup.validation.verticesFormat")
              : t("mapSetup.validation.verticesMinimum")}
          </p>
        )}
      </div>
      <SheetError message={errorMessage} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          requestConfirmation();
        }}
      >
        <FormActions
          cancelLabel={t("mapSetup.action.cancel")}
          disabled={!canSubmit}
          onCancel={onClose}
          saving={saving}
          savingLabel={t("mapSetup.editor.saving")}
          submitLabel={t("mapSetup.action.replaceVertices")}
        />
      </form>
      {confirming && canSubmit && parsedVertices !== null && (
        <ConfirmDialog
          busy={saving}
          body={t("mapSetup.confirm.replaceBody")}
          title={t("mapSetup.confirm.replaceTitle")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            if (!canSubmit || parsedVertices === null) return;
            onReplace(area.id, {
              vertices: parsedVertices.map((vertex) => ({
                latitude: vertex.latitude,
                longitude: vertex.longitude,
              })),
            });
          }}
        />
      )}
    </ListDetailSheet>
  );
}
