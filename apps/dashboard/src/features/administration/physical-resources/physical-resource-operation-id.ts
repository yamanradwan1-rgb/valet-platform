const operationIds = new Map<string, string>();

function key(
  identityGeneration: number,
  locationId: string,
  kind: "key-slot" | "parking-spot",
  requestKey: string,
) {
  return `${identityGeneration}:${locationId}:${kind}:${requestKey}`;
}

export function physicalResourceOperationId(
  identityGeneration: number,
  locationId: string,
  kind: "key-slot" | "parking-spot",
  requestKey: string,
) {
  const mapKey = key(identityGeneration, locationId, kind, requestKey);
  const existing = operationIds.get(mapKey);
  if (existing !== undefined) return existing;
  const operationId = crypto.randomUUID();
  operationIds.set(mapKey, operationId);
  return operationId;
}

export function clearPhysicalResourceOperationId(
  identityGeneration: number,
  locationId: string,
  kind: "key-slot" | "parking-spot",
  requestKey: string,
) {
  operationIds.delete(key(identityGeneration, locationId, kind, requestKey));
}

export function clearOtherIdentityPhysicalResourceOperations(
  identityGeneration: number,
) {
  for (const mapKey of operationIds.keys()) {
    if (!mapKey.startsWith(`${identityGeneration}:`)) operationIds.delete(mapKey);
  }
}
