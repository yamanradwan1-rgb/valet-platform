type Node = { type: unknown; props: Record<string, unknown> };
export function resolveAppearanceTree(
  value: unknown,
  omitAppearance = false,
  interactive = false,
): unknown {
  if (Array.isArray(value))
    return value.flatMap((v) => {
      const result = resolveAppearanceTree(v, omitAppearance, interactive);
      return result == null ? [] : [result];
    });
  if (value == null) return null;
  if (typeof value !== "object") return value;
  const node = value as Node;
  if (!("props" in node))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => typeof v !== "function")
        .map(([k, v]) => [
          k,
          resolveAppearanceTree(v, omitAppearance, interactive),
        ]),
    );
  if (typeof node.type === "function") {
    if (
      omitAppearance &&
      node.type.name === "Section" &&
      ["Appearance", "المظهر"].includes(String(node.props.title))
    )
      return null;
    return resolveAppearanceTree(
      node.type(node.props),
      omitAppearance,
      interactive,
    );
  }
  const props: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(node.props)) {
    if (key === "children")
      props[key] = resolveAppearanceTree(entry, omitAppearance, interactive);
    else if (key === "style" || key === "contentContainerStyle") {
      const styles =
        typeof entry === "function" ? entry({ pressed: false }) : entry;
      props[key] = Object.assign(
        {},
        ...[styles].flat(Infinity).filter(Boolean),
      );
    } else if (typeof entry !== "function" && key !== "ref")
      props[key] = resolveAppearanceTree(entry, omitAppearance, interactive);
    else if (interactive && /^on/.test(key)) props[key] = entry;
  }
  return { type: String(node.type), props };
}

export function appearanceGeometry(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(appearanceGeometry);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/color/i.test(key) && !["fill", "stroke", "source"].includes(key),
      )
      .map(([key, entry]) => [key, appearanceGeometry(entry)]),
  );
}

export function uncoloredAppearanceText(
  value: unknown,
  inherited = false,
): string[] {
  if (Array.isArray(value))
    return value.flatMap((v) => uncoloredAppearanceText(v, inherited));
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as {
    type: string;
    props: { style?: { color?: string }; children?: unknown };
  };
  const isText = node.type === "Text";
  const colored = isText && (Boolean(node.props.style?.color) || inherited);
  return [
    ...(isText && !colored ? [JSON.stringify(node.props.children)] : []),
    ...uncoloredAppearanceText(
      node.props.children,
      node.type === "Fragment" ? inherited : isText && colored,
    ),
  ];
}

export function appearanceNodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(appearanceNodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...appearanceNodes(node.props.children)];
}
