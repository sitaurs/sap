import { Body, Controller, Get, Headers, HttpCode, Injectable, Param, Patch, Post, Put, Query, UseGuards, UseInterceptors, type CanActivate, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { requireFeature, type Actor } from '../extensions/extension.store.js';
import { revision } from '../extensions/input.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityResultsService } from './activity-results.service.js';
import { ImpactService } from './impact.service.js';

@Injectable()
export class ActivitiesEnabledGuard implements CanActivate {canActivate():boolean {requireFeature('activities');return true;}}
@Injectable()
export class ExtensionNoStoreInterceptor implements NestInterceptor {
 intercept(context:ExecutionContext,next:CallHandler) {context.switchToHttp().getResponse<{setHeader:(name:string,value:string)=>void}>().setHeader('Cache-Control','no-store');return next.handle();}
}

@Controller('activities')
@UseGuards(ActivitiesEnabledGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class ActivitiesController {
 constructor(private readonly activities:ActivitiesService,private readonly results:ActivityResultsService) {}
 @Get() list(@Query() query:Record<string,unknown>) {return this.activities.list(query);}
 @Get(':id') detail(@Param('id') id:string) {return this.activities.get(id);}
 @Get(':id/viewer') @UseGuards(SessionAuthGuard) viewer(@CurrentUser() actor:Actor,@Param('id') id:string) {return this.activities.viewer(actor,id);}
 @Get(':id/manage') @UseGuards(SessionAuthGuard) manage(@CurrentUser() actor:Actor,@Param('id') id:string) {return this.activities.manage(actor,id);}
 @Patch(':id') @UseGuards(SessionAuthGuard) edit(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Body() body:unknown) {return this.activities.edit(actor,id,revision(match),body);}
 @Post(':id/commands') @HttpCode(200) @UseGuards(SessionAuthGuard) command(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.activities.command(actor,id,revision(match),key,body);}
 @Put(':id/coordinator-acceptance') @UseGuards(SessionAuthGuard) accept(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Body() body:unknown) {return this.activities.coordinatorAcceptance(actor,id,revision(match),body);}
 @Put(':id/membership') @UseGuards(SessionAuthGuard) membership(@CurrentUser() actor:Actor,@Param('id') id:string,@Body() body:unknown) {return this.activities.membership(actor,id,body);}
 @Get(':id/memberships') @UseGuards(SessionAuthGuard) members(@CurrentUser() actor:Actor,@Param('id') id:string,@Query() query:Record<string,unknown>) {return this.activities.members(actor,id,query);}
 @Patch(':id/memberships/:membershipId') @UseGuards(SessionAuthGuard) decideMember(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('membershipId') memberId:string,@Headers('if-match') match:string,@Body() body:unknown) {return this.activities.decideMembership(actor,id,memberId,revision(match),body);}
 @Put(':id/memberships/:membershipId/attendance') @UseGuards(SessionAuthGuard) attendance(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('membershipId') memberId:string,@Headers('if-match') match:string,@Body() body:unknown) {return this.activities.attendance(actor,id,memberId,revision(match),body);}
 @Put(':id/schedule-acknowledgement') @UseGuards(SessionAuthGuard) acknowledge(@CurrentUser() actor:Actor,@Param('id') id:string,@Body() body:unknown) {return this.activities.acknowledge(actor,id,body);}
 @Post(':id/results') @UseGuards(SessionAuthGuard) createResult(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.results.create(actor,id,key,body);}
 @Get(':id/results/:resultId') @UseGuards(SessionAuthGuard) result(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('resultId') resultId:string) {return this.results.get(actor,id,resultId);}
 @Patch(':id/results/:resultId') @UseGuards(SessionAuthGuard) editResult(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('resultId') resultId:string,@Headers('if-match') match:string,@Body() body:unknown) {return this.results.edit(actor,id,resultId,revision(match),body);}
 @Get(':id/source-photo/url') @UseGuards(SessionAuthGuard) sourcePhoto(@CurrentUser() actor:Actor,@Param('id') id:string) {return this.results.sourcePhoto(actor,id);}
 @Get(':id/results/:resultId/media/:mediaId/url') @UseGuards(SessionAuthGuard) media(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('resultId') resultId:string,@Param('mediaId') mediaId:string) {return this.results.privateMedia(actor,id,resultId,mediaId);}
 @Get(':id/public-results') publicResults(@Param('id') id:string,@Query() query:Record<string,unknown>) {return this.results.publicResults(id,query);}
 @Post(':id/measurements') @UseGuards(SessionAuthGuard) createMeasurement(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.results.createMeasurement(actor,id,key,body);}
 @Get(':id/measurements') @UseGuards(SessionAuthGuard) measurements(@CurrentUser() actor:Actor,@Param('id') id:string,@Query() query:Record<string,unknown>) {return this.results.measurements(actor,id,query);}
 @Get(':id/measurements/:measurementId/media/:mediaId/url') @UseGuards(SessionAuthGuard) measurementMedia(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('measurementId') measurementId:string,@Param('mediaId') mediaId:string) {return this.results.measurementMedia(actor,id,measurementId,mediaId);}
}

@Controller('admin')
@UseGuards(ActivitiesEnabledGuard,SessionAuthGuard,AdminGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class ActivitiesAdminController {
 constructor(private readonly activities:ActivitiesService,private readonly results:ActivityResultsService) {}
 @Get('activities') list(@CurrentUser() actor:Actor,@Query() query:Record<string,unknown>) {return this.activities.listManaged(actor,query);}
 @Get('activity-coordinator-candidates') candidates(@CurrentUser() actor:Actor,@Query() query:Record<string,unknown>) {return this.activities.candidates(actor,query);}
 @Post('activities') create(@CurrentUser() actor:Actor,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.activities.create(actor,key,body);}
 @Get('activity-results/:id') result(@CurrentUser() actor:Actor,@Param('id') id:string) {return this.results.adminGet(actor,id);}
 @Post('activity-results/:id/decisions') @HttpCode(200) decision(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.results.decide(actor,id,revision(match),key,body);}
 @Post('measurements/:id/decisions') @HttpCode(200) measurementDecision(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.results.measurementDecision(actor,id,revision(match),key,body);}
 @Patch('measurements/:id') correctMeasurement(@CurrentUser() actor:Actor,@Param('id') id:string,@Headers('if-match') match:string,@Headers('idempotency-key') key:string,@Body() body:unknown) {return this.results.correctMeasurement(actor,id,revision(match),key,body);}
}

@Controller('users/me')
@UseGuards(SessionAuthGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class MyActivitiesController {
 constructor(private readonly activities:ActivitiesService,private readonly impact:ImpactService) {}
 @Get('activities') @UseGuards(ActivitiesEnabledGuard) mine(@CurrentUser() actor:Actor,@Query() query:Record<string,unknown>) {return this.activities.mine(actor,query);}
 @Get('coordinator-assignments') @UseGuards(ActivitiesEnabledGuard) assignments(@CurrentUser() actor:Actor,@Query() query:Record<string,unknown>) {return this.activities.listManaged(actor,query,true);}
 @Get('notifications') notifications(@CurrentUser() actor:Actor,@Query() query:Record<string,unknown>) {return this.impact.notifications(actor,query);}
 @Put('notifications/:id/read') read(@CurrentUser() actor:Actor,@Param('id') id:string,@Body() body:unknown) {return this.impact.read(actor,id,body);}
}
@Controller('impact')
@UseGuards(ActivitiesEnabledGuard)
@UseInterceptors(ExtensionNoStoreInterceptor)
export class ImpactController {
 constructor(private readonly impact:ImpactService) {}
 @Get('summary') summary(@Query() query:Record<string,unknown>) {return this.impact.summary(query);}
}
