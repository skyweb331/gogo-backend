import { Service } from 'typedi';
import { Arg, Args, Authorized, Ctx, ID, Info, Mutation, Query, Resolver } from 'type-graphql';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';

import { WebhookEvent } from './webhookEvent.entity.js';
import { WebhookEventQueryArgs, WebhookEventsResponse } from './webhookEvent.type.js';
import { WebhookEventService } from './webhookEvent.service.js';

@Service()
@Resolver(() => WebhookEvent)
export class WebhookEventResolver {
  constructor(private readonly service: WebhookEventService) {}

  @Authorized([UserRole.Support])
  @Query(() => WebhookEventsResponse)
  async webhookEvents(
    @Args() query: WebhookEventQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<WebhookEventsResponse> {
    const fields = graphqlFields(info);
    const [total, webhookEvents] = await Promise.all([
      'total' in fields ? this.service.count(query) : undefined,
      'webhookEvents' in fields ? this.service.list(query) : undefined,
    ]);
    return { total, webhookEvents };
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => WebhookEvent)
  async replayWebhookEvent(
    @Arg('id', () => ID) id: string,
    @Ctx() ctx: Context
  ): Promise<WebhookEvent> {
    return this.service.replay(id, ctx);
  }
}
