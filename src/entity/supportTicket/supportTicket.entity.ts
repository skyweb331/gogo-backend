import { ObjectType, Field, Int } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { TicketStatus } from '#src/graphql/enum.js';

@ObjectType({ implements: Entity })
export class SupportTicket extends Entity {
  @Field(() => Int)
  customerId: number;

  @Field(() => String)
  subject: string;

  @Field(() => TicketStatus)
  status: TicketStatus | string;

  @Field(() => Int, { nullable: true })
  assigneeId?: number | null;

  @Field(() => Date, { nullable: true })
  lastMessageAt?: Date | null;
}

@ObjectType()
export class SupportMessage {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  ticketId: number;

  authorId: number;

  @Field(() => String)
  body: string;

  @Field(() => Boolean)
  isStaff: boolean;

  @Field(() => Date)
  createdAt: Date;
}
