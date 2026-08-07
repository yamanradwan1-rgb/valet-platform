import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Valet Platform API")
    .setDescription("Phase 0 API scaffold")
    .setVersion("0.0.0")
    .build();

  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port);
}

void bootstrap();
