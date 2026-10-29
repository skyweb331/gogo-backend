import { ObjectType, Field, ID } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { TicketStatus } from '#src/graphql/enum.js';

@ObjectType({ implements: Entity })
export class SupportTicket extends Entity {
  @Field(() => String, { description: 'Customer-facing code, e.g. SUP-7K3M9QX2' })
  reference: string;

  @Field(() => ID)
  customerId: string;

  @Field(() => String)
  subject: string;

  @Field(() => TicketStatus)
  status: TicketStatus | string;

  @Field(() => ID, { nullable: true })
  assigneeId?: string | null;

  @Field(() => Date, { nullable: true })
  lastMessageAt?: Date | null;
}

@ObjectType()
export class SupportMessage {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  ticketId: string;

  authorId: string;

  @Field(() => String)
  body: string;

  @Field(() => Boolean)
  isStaff: boolean;

  @Field(() => Date)
  createdAt: Date;
}
