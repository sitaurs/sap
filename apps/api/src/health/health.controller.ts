import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async getHealth() {
    const result = await this.health.check();
    // Only a DB outage fails readiness (503). Auxiliary degradation stays 200 so
    // load balancers keep serving reads while scans/uploads recover.
    if (!result.dbOk) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable.',
      });
    }
    return { status: result.status, contractVersion: result.contractVersion };
  }
}
