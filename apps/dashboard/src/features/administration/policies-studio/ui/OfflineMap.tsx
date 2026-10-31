import type { StudioZone as Zone } from "./studio-types";
import type { Locale } from "./catalog";

export function OfflineMap({
  zones,
  selected,
  onPick,
  locale,
  editable,
}: {
  zones: readonly Zone[];
  selected: Zone | null;
  onPick: (latitude: number, longitude: number) => void;
  locale: Locale;
  editable: boolean;
}) {
  const ar = locale === "ar";
  const center = {
    lat:
      selected && Number.isFinite(selected.latitude)
        ? selected.latitude
        : 31.95,
    lng:
      selected && Number.isFinite(selected.longitude)
        ? selected.longitude
        : 35.91,
  };
  const x = (lon: number) => 300 + (lon - center.lng) * 65000;
  const y = (lat: number) => 150 - (lat - center.lat) * 65000;
  return (
    <div className="ps-offline-map">
      <div className="ps-map-caption">
        <span>
          {ar
            ? "مخطط مناطق توضيحي · غير مقياسي"
            : "Illustrative zone plan · not to scale"}
        </span>
        <bdi>
          {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
        </bdi>
      </div>
      <svg
        viewBox="0 0 600 300"
        role="img"
        aria-label={
          ar
            ? "رسم توضيحي لمناطق الحضور"
            : "Illustrative attendance zone diagram"
        }
        onClick={(event) => {
          if (!editable) return;
          const point = event.currentTarget.createSVGPoint();
          point.x = event.clientX;
          point.y = event.clientY;
          const matrix = event.currentTarget.getScreenCTM()?.inverse();
          if (!matrix) return;
          const local = point.matrixTransform(matrix);
          onPick(
            center.lat - (local.y - 150) / 65000,
            center.lng + (local.x - 300) / 65000,
          );
        }}
      >
        <defs>
          <pattern
            id="ps-grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 30 0 L 0 0 0 30" fill="none" className="ps-map-grid" />
          </pattern>
        </defs>
        <rect width="600" height="300" fill="url(#ps-grid)" />
        <path
          d="M-10 205H190Q220 205 220 175V-10M220 145H610"
          className="ps-map-road"
        />
        <rect
          x="275"
          y="35"
          width="180"
          height="65"
          rx="8"
          className="ps-map-building"
        />
        <rect
          x="40"
          y="45"
          width="125"
          height="90"
          rx="8"
          className="ps-map-building"
        />
        <rect
          x="290"
          y="213"
          width="220"
          height="60"
          rx="8"
          className="ps-map-building"
        />
        <text x="365" y="73" className="ps-map-label">
          {ar ? "مبنى" : "Building"}
        </text>
        <text x="104" y="94" className="ps-map-label">
          {ar ? "ساحة" : "Court"}
        </text>
        {zones
          .filter((zone) => zone.id !== selected?.id)
          .map((zone) => (
            <g key={zone.id} opacity={zone.status === "DISABLED" ? 0.4 : 0.7}>
              <circle
                cx={x(zone.longitude)}
                cy={y(zone.latitude)}
                r={Math.min(110, zone.radius * 0.58)}
                className="ps-map-zone"
              />
              <circle
                cx={x(zone.longitude)}
                cy={y(zone.latitude)}
                r="5"
                className="ps-map-point"
              />
            </g>
          ))}
        {selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && (
          <g>
            <circle
              cx={x(selected.longitude)}
              cy={y(selected.latitude)}
              r={Math.min(125, selected.radius * 0.58)}
              className="ps-map-zone ps-map-draft"
            />
            <circle
              cx={x(selected.longitude)}
              cy={y(selected.latitude)}
              r="7"
              className="ps-map-point"
            />
            <circle
              cx={x(selected.longitude)}
              cy={y(selected.latitude)}
              r="12"
              className="ps-map-point-halo"
            />
          </g>
        )}
        <text x="555" y="28" className="ps-map-label">
          N ↑
        </text>
      </svg>
      {editable ? (
        <div
          className="ps-map-moves"
          role="group"
          aria-label={ar ? "تحريك مركز المنطقة" : "Move zone center"}
        >
          {[
            [0.0001, 0, "↑"],
            [0, -0.0001, "←"],
            [-0.0001, 0, "↓"],
            [0, 0.0001, "→"],
          ].map(([lat, lon, label]) => (
            <button
              key={label}
              type="button"
              aria-label={`${ar ? "تحريك النقطة" : "Move point"} ${label}`}
              onClick={() =>
                onPick(
                  (selected?.latitude ?? 31.95) + Number(lat),
                  (selected?.longitude ?? 35.91) + Number(lon),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <p>
        {ar
          ? "المباني توضيحية وليست خريطة جغرافية. أدخل الإحداثيات أو احصل عليها من المتصفح وتحقق منها قبل الحفظ؛ الدائرة لا تقيس المسافة الفعلية."
          : "Building outlines are illustrative, not a geographic map. Enter or retrieve coordinates and verify them before saving; circles do not measure real distance."}
      </p>
    </div>
  );
}
