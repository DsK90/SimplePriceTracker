import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: origins?.length ? origins : true,
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
