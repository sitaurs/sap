import {Body,Controller,Get,Post,Put,Param,Query,Headers,HttpCode,UseGuards} from '@nestjs/common';
import {SessionAuthGuard} from '../auth/session-auth.guard.js';
import {CurrentUser} from '../auth/current-user.decorator.js';
import type {Actor} from '../extensions/extension.store.js';
import {revision} from '../extensions/input.js';
import {EvidenceService} from './evidence.service.js';
@Controller()
@UseGuards(SessionAuthGuard)
export class EvidenceController{
 constructor(private readonly service:EvidenceService){}
 @Get('media/:mediaId/consents') consents(@CurrentUser() a:Actor,@Param('mediaId') id:string){return this.service.consents(a,id);}
 @Put('media/:mediaId/consents') consent(@CurrentUser() a:Actor,@Param('mediaId') id:string,@Headers('if-match') rev:string,@Body() b:unknown){return this.service.setConsents(a,id,revision(rev),b);}
 @Post('admin/media/:mediaId/renditions') @HttpCode(202) rendition(@CurrentUser() a:Actor,@Param('mediaId') id:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.createRendition(a,id,revision(rev),key,b);}
 @Get('admin/media/:mediaId/renditions') renditions(@CurrentUser() a:Actor,@Param('mediaId') id:string,@Query() q:Record<string,unknown>){return this.service.renditions(a,id,q);}
 @Put('admin/reports/:reportId/media/:mediaId/approvals') approve(@CurrentUser() a:Actor,@Param('reportId') rid:string,@Param('mediaId') mid:string,@Headers('if-match') rev:string,@Headers('idempotency-key') key:string,@Body() b:unknown){return this.service.approve(a,rid,mid,revision(rev),key,b);}
 @Get('admin/reports/:reportId/media/:mediaId/url') reportUrl(@CurrentUser() a:Actor,@Param('reportId') rid:string,@Param('mediaId') mid:string){return this.service.privateUrl(a,'report',rid,mid);}
 @Get('admin/community-updates/:id/media/:mediaId/url') updateUrl(@CurrentUser() a:Actor,@Param('id') id:string,@Param('mediaId') mid:string){return this.service.privateUrl(a,'community_update',id,mid);}
}
