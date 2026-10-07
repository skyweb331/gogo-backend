import { ObjectType, Field, ArgsType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';

import { WebhookEvent } from './webhookEvent.entity.js';

@ArgsType()
export class WebhookEventQueryArgs extends QueryArgsBase {}

@ObjectType()
export class WebhookEventsResponse extends PaginatedResponse {
  @Field(() => [WebhookEvent], { nullable: true })
  webhookEvents?: WebhookEvent[];
}
