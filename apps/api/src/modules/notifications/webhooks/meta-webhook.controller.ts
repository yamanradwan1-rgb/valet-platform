import {
  BadRequestException, Controller, ForbiddenException, Get, Headers,
  HttpCode, HttpException, Inject, Post, Query, Req, ServiceUnavailableException,
} from "@nestjs/common";
import type { PostgresPool } from "../../../common/database/postgres";
import {
  MAX_META_WEBHOOK_BYTES, verifyMetaSignature, verifyMetaSubscription,
} from "./meta-webhook-signature";
import { OUTBOUND_WEBHOOK_POOL } from "./meta-webhook-database";
import { normalizeMetaStatusPayload } from "./meta-webhook-events";
import { applyMetaEvents, canReconcileMetaWebhooks } from "./meta-webhook-delivery";

@Controller("v1/webhooks/meta/whatsapp")
export class MetaWhatsAppWebhookController {
  constructor(@Inject(OUTBOUND_WEBHOOK_POOL) private readonly pool: PostgresPool | null) {}

  private assertReady() {
    // The send kill switch can be OFF while old delivery facts remain receivable.
    // Completely disabled/unprovisioned receiver must never enroll a Meta webhook.
    if (!this.pool || !canReconcileMetaWebhooks(process.env) ||
        !process.env.META_WHATSAPP_APP_SECRET ||
        process.env.META_WHATSAPP_APP_SECRET.length < 16 ||
        !process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
        process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN.length < 16) {
      throw new ServiceUnavailableException("WEBHOOK_NOT_CONFIGURED");
    }
  }

  @Get()
  getChallenge(@Query() query: Record<string, unknown>) {
    this.assertReady();
    const answer = verifyMetaSubscription(
      query["hub.mode"], query["hub.verify_token"], query["hub.challenge"],
      process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    );
    if (answer === null) throw new ForbiddenException();
    return answer;
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: { readonly rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature: string | undefined,
  ) {
    const raw = request.rawBody;
    if (raw && raw.length > MAX_META_WEBHOOK_BYTES)
      throw new HttpException("WEBHOOK_TOO_LARGE", 413);
    if (!verifyMetaSignature(raw, signature, process.env.META_WHATSAPP_APP_SECRET)) {
      throw new ForbiddenException();
    }
    this.assertReady();
    let events;
    try {
      events = normalizeMetaStatusPayload(JSON.parse(raw!.toString("utf8")));
    } catch {
      throw new BadRequestException("WEBHOOK_INVALID");
    }
    try {
      if (!this.pool) throw new Error("META_WEBHOOK_NOT_CONFIGURED");
      await applyMetaEvents(this.pool, events, process.env);
    } catch {
      // Never acknowledge authenticated delivery evidence before durable commit.
      throw new ServiceUnavailableException("WEBHOOK_PERSISTENCE_UNAVAILABLE");
    }
    return { received: true };
  }
}
