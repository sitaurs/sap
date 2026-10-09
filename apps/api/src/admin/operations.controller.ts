import { Body, Controller, Get, Headers, Param, Post, Put, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentSession, CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import type { Actor } from '../extensions/extension.store.js';
import type { AuthenticatedSession } from '../platform/http/request-context.js';
import { revision } from '../extensions/input.js';
import { ExtensionNoStoreInterceptor } from '../activities/activities.controller.js';
import { AdminGuard } from './admin.guard.js';
import { OperationsService } from './operations.service.js';

@Controller('admin')
@UseGuards(SessionAuthGuard,AdminGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class OperationsAdminController {
 constructor(private readonly operations:OperationsService) {}
 @Get('users') users(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.operations.users(a,q);}
 @Put('users/:id/role') role(@CurrentUser() a:Actor,@CurrentSession() s:AuthenticatedSession,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.operations.role(a,s,id,key,b);}
 @Get('report-operations') reports(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.operations.reports(a,q);}
 @Put('reports/:id/assignment') assign(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.operations.assign(a,id,revision(match),key,b);}
 @Post('reports/:id/evidence-requests') requestEvidence(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.operations.requestEvidence(a,id,key,b);}
 @Get('reports/pending-map') map(@CurrentUser() a:Actor){return this.operations.pendingMap(a);}
 @Get('reports/export.csv') async csv(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>,@Res() response:Response){const csv=await this.operations.exportCsv(a,q);response.setHeader('Content-Type','text/csv; charset=utf-8');response.setHeader('Content-Disposition','attachment; filename="sap-reports.csv"');response.setHeader('X-Content-Type-Options','nosniff');response.send(csv);}
 @Get('area-localities') localities(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.operations.localities(a,q);}
 @Put('areas/:cellId/locality') saveLocality(@CurrentUser() a:Actor,@Param('cellId') cellId:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.operations.saveLocality(a,cellId,key,b);}
}
@Controller('users/me')
@UseGuards(SessionAuthGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class OperationsUserController {
 constructor(private readonly operations:OperationsService) {}
 @Get('report-notification-preferences') preference(@CurrentUser() a:Actor){return this.operations.emailPreference(a);}
 @Put('report-notification-preferences') savePreference(@CurrentUser() a:Actor,@Body() b:unknown){return this.operations.emailPreference(a,b);}
 @Get('report-assignments') assignments(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.operations.reports(a,q,true);}
 @Put('report-assignments/:id/progress') progress(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.operations.progress(a,id,revision(match),key,b);}
}
@Controller('areas')
@UseInterceptors(ExtensionNoStoreInterceptor)
export class OperationsAreaController {
 constructor(private readonly operations:OperationsService) {}
 @Get(':cellId/locality') locality(@Param('cellId') cellId:string){return this.operations.locality(cellId);}
}
@Controller('area-localities')
@UseInterceptors(ExtensionNoStoreInterceptor)
export class OperationsPublicLocalitiesController {
 constructor(private readonly operations:OperationsService) {}
 @Get() list(@Query() query:Record<string,unknown>){return this.operations.publicLocalities(query);}
}
