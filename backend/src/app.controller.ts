import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('api')
  apiInfo() {
    return {
      success: true,
      name: 'Wanderson Gandra API',
      version: '2.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        docs: '/api/docs (apenas em desenvolvimento)',
        auth: '/auth/*',
        mail: '/mail/*',
        checklists: '/checklists/*',
        pts: '/pts/*',
        aprs: '/aprs/*',
        users: '/users/*',
        companies: '/companies/*',
      },
      message: '✅ Backend funcionando corretamente!',
    };
  }
}
