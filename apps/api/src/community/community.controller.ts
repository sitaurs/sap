import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import type { Actor } from '../extensions/extension.store.js';
import { revision, uuid } from '../extensions/input.js';
import { CommunityService } from './community.service.js';
import { ReviewService } from './review.service.js';

@Controller('public/incidents')
export class IncidentsController {
  constructor(private readonly community: CommunityService) {}
  @Get(':id') get(@Param('id') id: string) { return this.community.incident(uuid(id)); }
  @Get(':id/timeline') timeline(@Param('id') id: string,@Query() query: Record<string,unknown>) { return this.community.timeline(uuid(id),query); }
  @Get(':id/viewer') @UseGuards(SessionAuthGuard)
  viewer(@Param('id') id: string,@CurrentUser() actor: Actor) { return this.community.viewer(uuid(id),actor); }
  @Put(':id/support') @UseGuards(SessionAuthGuard)
  support(@Param('id') id: string,@CurrentUser() actor: Actor,@Body() body: unknown) { return this.community.support(uuid(id),actor,body); }
  @Put(':id/follow') @UseGuards(SessionAuthGuard)
  follow(@Param('id') id: string,@CurrentUser() actor: Actor,@Body() body: unknown) { return this.community.follow(uuid(id),actor,body); }
  @Post(':id/updates') @HttpCode(201) @UseGuards(SessionAuthGuard)
  update(@Param('id') id: string,@CurrentUser() actor: Actor,@Body() body: unknown,@Headers('idempotency-key') key: string) { return this.community.createUpdate(uuid(id),actor,body,key); }
}

@Controller('users/me') @UseGuards(SessionAuthGuard)
export class MyCommunityController {
  constructor(private readonly community: CommunityService) {}
  @Get('followed-incidents') followed(@CurrentUser() actor: Actor,@Query() query: Record<string,unknown>) { return this.community.followed(actor,query); }
  @Get('community-updates') updates(@CurrentUser() actor: Actor,@Query() query: Record<string,unknown>) { return this.community.myUpdates(actor,query); }
}

@Controller('community-updates') @UseGuards(SessionAuthGuard)
export class CommunityUpdatesController {
  constructor(private readonly community: CommunityService) {}
  @Get(':id') get(@Param('id') id: string,@CurrentUser() actor: Actor) { return this.community.getUpdate(uuid(id),actor); }
  @Patch(':id') patch(@Param('id') id: string,@CurrentUser() actor: Actor,@Body() body: unknown,@Headers('if-match') match: string) { return this.community.patchUpdate(uuid(id),actor,revision(match),body); }
}

@Controller('admin') @UseGuards(SessionAuthGuard,AdminGuard)
export class CommunityAdminController {
  constructor(private readonly community: CommunityService,private readonly reviews: ReviewService) {}
  @Get('community-updates/:id') get(@Param('id') id: string,@CurrentUser() actor: Actor) { return this.community.getUpdate(uuid(id),actor,true); }
  @Post('community-updates/:id/decisions') @HttpCode(200)
  decide(@Param('id') id: string,@CurrentUser() actor: Actor,@Body() body: unknown,@Headers('if-match') match: string,@Headers('idempotency-key') key: string) { return this.community.decideUpdate(uuid(id),actor,revision(match),body,key); }
  @Get('reports/:id/lifecycle') lifecycle(@Param('id') id: string,@CurrentUser() actor: Actor) { return this.community.lifecycle(uuid(id),actor); }
  @Get('reports/:id/reviews') reportReviews(@Param('id') id: string,@CurrentUser() actor: Actor,@Query() query: Record<string,unknown>) { return this.reviews.list(actor,query,uuid(id)); }
  @Get('review-queue') queue(@CurrentUser() actor: Actor,@Query() query: Record<string,unknown>) { return this.reviews.queue(actor,query); }
  @Get('reviews') list(@CurrentUser() actor: Actor,@Query() query: Record<string,unknown>) { return this.reviews.list(actor,query); }
  @Post('reviews') @HttpCode(202)
  request(@CurrentUser() actor: Actor,@Body() body: unknown,@Headers('idempotency-key') key: string) { return this.reviews.request(actor,body,key); }
  @Get('reviews/:id') review(@Param('id') id: string,@CurrentUser() actor: Actor) { return this.reviews.get(actor,uuid(id)); }
}
