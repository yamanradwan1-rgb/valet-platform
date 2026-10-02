import {
  overviewListQuerySchema,
  type OverviewListQuery,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseListQuery(value: unknown): OverviewListQuery {
  const result = overviewListQuerySchema.safeParse(value ?? {});
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

export function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}
