"use client";

import type {
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";

import type { MapCenter } from "../../lib/maps/map-provider";
import { AreaCreateSheet } from "./area-create-sheet";
import { AreaFieldsSheet } from "./area-fields-sheet";
import { PointEditorSheet } from "./point-editor-sheet";
import { VerticesSheet } from "./vertices-sheet";
import type { ReplaceLocationMapAreaVerticesRequest } from "@valet/contracts";
import type { CreateLocationMapAreaRequest } from "@valet/contracts";
import type { CreateLocationMapPointRequest } from "@valet/contracts";
import type { UpdateLocationMapAreaRequest } from "@valet/contracts";
import type { UpdateLocationMapPointRequest } from "@valet/contracts";

export type EditorState =
  | { readonly type: "point.create" }
  | { readonly type: "point.edit"; readonly point: LocationMapPoint }
  | { readonly type: "area.create" }
  | { readonly type: "area.fields"; readonly area: LocationMapArea }
  | { readonly type: "area.vertices"; readonly area: LocationMapArea };

export interface MapSetupSheetsProps {
  readonly editor: EditorState | null;
  readonly points: readonly LocationMapPoint[];
  readonly areas: readonly LocationMapArea[];
  readonly pickedCoordinate: MapCenter | null;
  readonly pendingOperation: string | null;
  readonly sheetError: string | null;
  readonly onClose: () => void;
  readonly onCreatePoint: (request: CreateLocationMapPointRequest) => void;
  readonly onUpdatePoint: (
    pointId: string,
    patch: UpdateLocationMapPointRequest,
  ) => void;
  readonly onCreateArea: (request: CreateLocationMapAreaRequest) => void;
  readonly onUpdateArea: (
    areaId: string,
    patch: UpdateLocationMapAreaRequest,
  ) => void;
  readonly onReplaceVertices: (
    areaId: string,
    request: ReplaceLocationMapAreaVerticesRequest,
  ) => void;
}

/**
 * Mounts the open editor sheet for the current editor state. Sheets keep
 * their own form drafts; they resolve fresh authoritative snapshots for
 * display while mutations target the captured id.
 */
export function MapSetupSheets(props: MapSetupSheetsProps) {
  const { editor } = props;
  if (editor === null) return null;

  const findPoint = (id: string): LocationMapPoint | undefined =>
    props.points.find((point) => point.id === id);
  const findArea = (id: string): LocationMapArea | undefined =>
    props.areas.find((area) => area.id === id);

  switch (editor.type) {
    case "point.create":
      return (
        <PointEditorSheet
          errorMessage={props.sheetError}
          onClose={props.onClose}
          onCreate={props.onCreatePoint}
          onUpdate={() => undefined}
          original={null}
          pickedCoordinate={props.pickedCoordinate}
          saving={props.pendingOperation === "point.create"}
        />
      );
    case "point.edit":
      return (
        <PointEditorSheet
          errorMessage={props.sheetError}
          onClose={props.onClose}
          onCreate={() => undefined}
          onUpdate={props.onUpdatePoint}
          original={findPoint(editor.point.id) ?? editor.point}
          pickedCoordinate={props.pickedCoordinate}
          saving={props.pendingOperation === "point.update"}
        />
      );
    case "area.create":
      return (
        <AreaCreateSheet
          errorMessage={props.sheetError}
          onClose={props.onClose}
          onCreate={props.onCreateArea}
          saving={props.pendingOperation === "area.create"}
        />
      );
    case "area.fields":
      return (
        <AreaFieldsSheet
          errorMessage={props.sheetError}
          onClose={props.onClose}
          onUpdate={props.onUpdateArea}
          original={findArea(editor.area.id) ?? editor.area}
          saving={props.pendingOperation === "area.update"}
        />
      );
    case "area.vertices":
      return (
        <VerticesSheet
          area={findArea(editor.area.id) ?? editor.area}
          errorMessage={props.sheetError}
          onClose={props.onClose}
          onReplace={props.onReplaceVertices}
          saving={props.pendingOperation === "area.vertices"}
        />
      );
  }
}
