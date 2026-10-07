import { IsEnum, IsInt, IsOptional, Length } from 'class-validator';
import { ArgsType, Field, InputType, Int, ObjectType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { TicketStatus } from '#src/graphql/enum.js';

import { SupportTicket } from './supportTicket.entity.js';

@ArgsType()
export class SupportTicketQueryArgs extends QueryArgsBase {}

@ObjectType()
export class SupportTicketsResponse extends PaginatedResponse {
  @Field(() => [SupportTicket], { nullable: true })
  supportTickets?: SupportTicket[];
}

@InputType()
export class CreateSupportTicketInput {
  @Field(() => String)
  @Length(3, 160, { message: 'Subject must be 3 to 160 characters' })
  subject: string;

  @Field(() => String)
  @Length(1, 5000, { message: 'Message must be 1 to 5000 characters' })
  body: string;
}

@InputType()
export class ReplySupportTicketInput {
  @Field(() => Int)
  @IsInt()
  ticketId: number;

  @Field(() => String)
  @Length(1, 5000, { message: 'Message must be 1 to 5000 characters' })
  body: string;
}

@InputType()
export class UpdateSupportTicketInput {
  @Field(() => Int)
  @IsInt()
  id: number;

  @Field(() => TicketStatus, { nullable: true })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  /** Staff user id; null unassigns */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  assigneeId?: number | null;
}
