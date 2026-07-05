import app from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';

async function bootstrap(): Promise<void> {
  try {
    await connectDb();
    console.log('Prisma connected to SQL Server');
  } catch (error) {
    console.warn('Could not connect to SQL Server — server will start anyway:', error);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`DataAxis Hulp API running on http://localhost:${env.PORT}/api/v1`);
    console.log(`Environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
