import {Body,Controller,Get,Post,Put,Patch,Param,Query,Headers,Req,Res,HttpCode,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {SessionAuthGuard} from '../auth/session-auth.guard.js';
import {CurrentUser} from '../auth/current-user.decorator.js';
import type {Actor} from '../extensions/extension.store.js';
import type {SapRequest} from '../platform/http/request-context.js';
import {revision} from '../extensions/input.js';
import {PublicationsService} from './publications.service.js';
@Controller('admin/instagram')
@UseGuards(SessionAuthGuard)
export class PublicationsController{
 constructor(private readonly service:PublicationsService){}
 @Get() overview(@CurrentUser() a:Actor){return this.service.overview(a);}
 @Get('reports') reportSources(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.service.reportSources(a,q);}
 @Get('posts') list(@CurrentUser() a:Actor,@Query() q:Record<string,unknown>){return this.service.list(a,q);}
 @Post('posts') @HttpCode(201) create(@CurrentUser() a:Actor,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.create(a,key,b);}
 @Get('posts/:id') get(@CurrentUser() a:Actor,@Param('id') id:string){return this.service.get(a,id);}
 @Get('posts/:id/preview') preview(@CurrentUser() a:Actor,@Param('id') id:string){return this.service.preview(a,id);}
 @Patch('posts/:id') edit(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Body() b:unknown){return this.service.edit(a,id,revision(rev),b);}
 @Post('posts/:id/approve') @HttpCode(200) approve(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.approve(a,id,revision(rev),key,b);}
 @Post('posts/:id/publish') @HttpCode(202) publish(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.publish(a,id,revision(rev),key,b);}
 @Post('posts/:id/cancel') @HttpCode(200) cancel(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.cancel(a,id,revision(rev),key,b);}
 @Post('posts/:id/retract') @HttpCode(202) retract(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.retract(a,id,revision(rev),key,b);}
 @Get('operations/:id') operation(@CurrentUser() a:Actor,@Param('id') id:string){return this.service.operation(a,id);}
 @Post('operations/:id/retry') @HttpCode(202) retry(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.retry(a,id,key,b);}
 @Post('operations/:id/manual-confirmation') @HttpCode(200) manual(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.manualConfirmation(a,id,key,b);}
 @Put('settings') settings(@CurrentUser() a:Actor,@Headers('if-match') rev:string,@Body() b:unknown){return this.service.settings(a,revision(rev),b);}
 @Get('reports/:reportId/media/:mediaId/url') media(@CurrentUser() a:Actor,@Param('reportId') rid:string,@Param('mediaId') mid:string){return this.service.mediaUrl(a,rid,mid);}
 @Get('account/authorization') authorization(@CurrentUser() a:Actor,@Req() req:SapRequest){return this.service.authorization(a,req.session!.id);}
 @Get('account/callback') async callback(@CurrentUser() a:Actor,@Req() req:SapRequest,@Query() q:Record<string,unknown>,@Res() res:Response){const path=await this.service.callback(a,req.session!.id,q);res.setHeader('Cache-Control','no-store');res.redirect(302,path);}
 @Post('account/disconnect') @HttpCode(202) disconnect(@CurrentUser() a:Actor,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.disconnect(a,key,b);}
}
@Controller('admin/reports')
@UseGuards(SessionAuthGuard)
export class PublicationLifecycleController{
 constructor(private readonly service:PublicationsService){}
 @Get(':id/publications') publications(@CurrentUser() a:Actor,@Param('id') id:string,@Query() q:Record<string,unknown>){return this.service.list(a,q,id);}
 @Post(':id/withdraw') @HttpCode(202) withdraw(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.withdraw(a,id,revision(rev),key,b);}
 @Post(':id/restore-publication') @HttpCode(200) restore(@CurrentUser() a:Actor,@Param('id') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.restore(a,id,revision(rev),key,b);}
}
/** Meta receives a short-lived poster URL; request carries no SAP user session. */
@Controller('publication-assets')
export class PublicationAssetsController{
 constructor(private readonly service:PublicationsService){}
 @Get(':id') async asset(@Param('id') id:string,@Query('token') token:string,@Res() res:Response){const url=await this.service.delivery(id,token);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.redirect(302,url);}
}
