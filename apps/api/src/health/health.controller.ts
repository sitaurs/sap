import { Controller, Get, Header, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process-only probe for restart policies; remote dependencies are irrelevant to liveness. */
  @Header('Cache-Control', 'no-store')
  @Get('live')
  getLiveness() {
    return this.health.liveness();
  }

  /** Operational probe with safe per-dependency states; only DB gates safe read traffic. */
  @Header('Cache-Control', 'no-store')
  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.readiness();
    if (!result.ready) response.status(503);
    return result;
  }

  /** Backwards-compatible published endpoint. Detailed dependency state lives at /health/ready. */
  @Get()
  async getHealth() {
    const result = await this.health.check();
    // Redis and object-storage outages degrade affected features but do not
    // remove safe DB-backed reads from the load balancer.
    if (!result.dbOk) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable.',
      });
    }
    return { status: result.status, contractVersion: result.contractVersion };
  }
}
