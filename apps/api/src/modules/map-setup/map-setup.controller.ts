import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createLocationMapAreaRequestSchema,
  createLocationMapPointRequestSchema,
  locationMapAreaListResponseSchema,
  locationMapAreaSchema,
  locationMapPointListResponseSchema,
  locationMapPointSchema,
  parkingZoneSelectorListSchema,
  physicalResourceListQuerySchema,
  replaceLocationMapAreaVerticesRequestSchema,
  updateLocationMapAreaRequestSchema,
  updateLocationMapPointRequestSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { MapSetupService } from "./map-setup.service";

interface Schema<T> {
  safeParse(value: unknown):
    | { readonly data: T; readonly success: true }
    | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/locations/:locationId/map")
export class MapSetupController {
  constructor(
    private readonly service: MapSetupService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(request: ApiRequest, authorization?: string) {
    const headers = request.rawHeaders;
    let count = 0;
    if (headers === undefined || headers.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < headers.length; index += 2) {
      if (headers[index]?.toLowerCase() === "authorization") count += 1;
    }
    if (count !== 1) throw new UnauthorizedException();
    return (await this.principals.resolve(authorization)).userId;
  }

  private scope(request: ApiRequest, authorization: string | undefined, locationId: string) {
    return this.userId(request, authorization).then((authenticatedUserId) => ({
      authenticatedUserId,
      locationId: uuid(locationId),
    }));
  }

  @Get("points")
  listPoints(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run("MAP_SETUP_POINT_LIST", request, async () =>
      locationMapPointListResponseSchema.parse({
        points: await this.service.listPoints(
          await this.scope(request, authorization, locationId),
        ),
      }),
    );
  }

  @Post("points")
  createPoint(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("MAP_SETUP_POINT_CREATE", request, async () =>
      locationMapPointSchema.parse(
        await this.service.createPoint({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(createLocationMapPointRequestSchema, body),
        }),
      ),
    );
  }

  @Patch("points/:pointId")
  updatePoint(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("pointId") pointId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("MAP_SETUP_POINT_UPDATE", request, async () =>
      locationMapPointSchema.parse(
        await this.service.updatePoint({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(updateLocationMapPointRequestSchema, body),
          pointId: uuid(pointId),
        }),
      ),
    );
  }

  @Get("areas")
  listAreas(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run("MAP_SETUP_AREA_LIST", request, async () =>
      locationMapAreaListResponseSchema.parse({
        areas: await this.service.listAreas(
          await this.scope(request, authorization, locationId),
        ),
      }),
    );
  }

  @Get("parking-zones")
  listParkingZones(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("MAP_SETUP_PARKING_ZONE_LIST", request, async () =>
      parkingZoneSelectorListSchema.parse(
        await this.service.listParkingZones({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(physicalResourceListQuerySchema, query ?? {}),
        }),
      ),
    );
  }

  @Post("areas")
  createArea(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("MAP_SETUP_AREA_CREATE", request, async () =>
      locationMapAreaSchema.parse(
        await this.service.createArea({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(createLocationMapAreaRequestSchema, body),
        }),
      ),
    );
  }

  @Patch("areas/:areaId")
  updateArea(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("areaId") areaId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("MAP_SETUP_AREA_UPDATE", request, async () =>
      locationMapAreaSchema.parse(
        await this.service.updateArea({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(updateLocationMapAreaRequestSchema, body),
          areaId: uuid(areaId),
        }),
      ),
    );
  }

  @Put("areas/:areaId/vertices")
  replaceVertices(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("areaId") areaId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("MAP_SETUP_AREA_VERTICES_REPLACE", request, async () =>
      locationMapAreaSchema.parse(
        await this.service.replaceVertices({
          ...(await this.scope(request, authorization, locationId)),
          ...parse(replaceLocationMapAreaVerticesRequestSchema, body),
          areaId: uuid(areaId),
        }),
      ),
    );
  }
}
