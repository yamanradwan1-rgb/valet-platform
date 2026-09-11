import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { readStaffPushOperationalPolicy } from "./modules/staff-push/staff-push-operational-policy";

async function bootstrap() {
  if (process.env.NODE_ENV === "production") {
    readStaffPushOperationalPolicy(process.env);
  }
  const app = await NestFactory.create(AppModule);
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Valet Platform API")
    .setDescription("Valet platform operational API")
    .setVersion("0.0.0")
    .build();

  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  app.enableShutdownHooks();
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port);
}

void bootstrap();
