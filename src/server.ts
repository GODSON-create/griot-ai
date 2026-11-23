// ============================================================================
// GRIOT AI — STANDALONE SERVER ENTRY POINT (V1 Local Intelligence & Guided Builder)
// ============================================================================

import { GriotHttpServer } from './api/httpServer.ts';
import { GriotCore } from './core/griotCore.ts';

async function bootstrap(): Promise<void> {
  const core = new GriotCore();
  const localSync = await core.syncLocalOllamaModels();
  const server = new GriotHttpServer(core);
  const port = await server.listen();

  console.log(
    JSON.stringify({
      event: 'griot_ai_core_started',
      phase: 'v1_local_intelligence_and_guided_builder',
      env: core.config.env,
      host: core.config.host,
      port,
      webInterfaceUrl: `http://${core.config.host}:${port}/`,
      modelsRegistered: core.registry.listModels().length,
      localOllamaReachable: localSync.reachable,
      installedLocalModels: localSync.installedModelNames,
      activatedLocalRegistryModels: localSync.activatedRegistryIds,
      timestamp: new Date().toISOString(),
    })
  );

  const shutdown = async () => {
    await server.close();
    core.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Failed to start GRIOT AI Core:', err);
  process.exit(1);
});
