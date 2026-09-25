import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async getHealth(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.check();
    response.status(result.data.status === 'ok' ? 200 : 503);
    return result;
  }
}
