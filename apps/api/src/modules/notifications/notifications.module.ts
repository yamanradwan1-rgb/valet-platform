import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { WhatsAppSettingsController } from "./whatsapp-settings-controller";
import { WhatsAppSettingsService } from "./whatsapp-settings-service";
import { WhatsAppSandboxBindingService } from "./whatsapp-sandbox-binding-service";
import { WhatsAppSandboxConsentService } from "./whatsapp-sandbox-consent-service";
import { MetaWhatsAppWebhookController } from "./webhooks/meta-webhook.controller";
import { OutboundWebhookDatabaseModule } from "./webhooks/meta-webhook-database";

@Module({
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule,
    OutboundWebhookDatabaseModule],
  controllers: [WhatsAppSettingsController, MetaWhatsAppWebhookController],
  providers: [WhatsAppSettingsService, WhatsAppSandboxBindingService,
    WhatsAppSandboxConsentService],
})
export class NotificationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes(
      WhatsAppSettingsController, MetaWhatsAppWebhookController,
    );
  }
}
