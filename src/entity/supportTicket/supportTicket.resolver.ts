import { Service } from 'typedi';
import {
  Arg,
  Args,
  Authorized,
  Ctx,
  FieldResolver,
  Info,
  ID,
  Mutation,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';
import {
  CustomerScope,
  RequireCustomer,
  StaffOnlyField,
  assertOwnership,
} from '#src/graphql/middleware/index.js';
import { RateLimiterService } from '#src/service/rateLimiter.js';
import { Customer } from '#src/entity/customer/customer.entity.js';
import { User } from '#src/entity/user/user.entity.js';

import { SupportMessage, SupportTicket } from './supportTicket.entity.js';
import {
  CreateSupportTicketInput,
  ReplySupportTicketInput,
  SupportTicketQueryArgs,
  SupportTicketsResponse,
  UpdateSupportTicketInput,
} from './supportTicket.type.js';
import { SupportTicketService } from './supportTicket.service.js';

@Service()
@Resolver(() => SupportTicket)
export class SupportTicketResolver {
  constructor(
    private readonly service: SupportTicketService,
    private readonly rateLimiter: RateLimiterService
  ) {}

  @Authorized()
  @UseMiddleware(CustomerScope)
  @Query(() => SupportTicketsResponse)
  async supportTickets(
    @Args() query: SupportTicketQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<SupportTicketsResponse> {
    const fields = graphqlFields(info);
    const [total, supportTickets] = await Promise.all([
      'total' in fields ? this.service.count(query) : undefined,
      'supportTickets' in fields ? this.service.list(query) : undefined,
    ]);
    return { total, supportTickets };
  }

  @Authorized()
  @Query(() => SupportTicket, { nullable: true })
  async supportTicket(@Arg('id', () => ID) id: string, @Ctx() ctx: Context) {
    const ticket = await this.service.getByIdOrLegacy(id);
    assertOwnership(ctx, ticket);
    return ticket;
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => SupportTicket)
  async createSupportTicket(@Arg('input') input: CreateSupportTicketInput, @Ctx() ctx: Context) {
    this.rateLimiter.consume(`support:create:${ctx.customer!.id}`, 5, 60 * 60_000);
    return this.service.create(ctx.user!, ctx.customer!, input);
  }

  @Authorized()
  @Mutation(() => SupportTicket)
  async replySupportTicket(@Arg('input') input: ReplySupportTicketInput, @Ctx() ctx: Context) {
    this.rateLimiter.consume(`support:reply:${ctx.user!.id}`, 30, 60 * 60_000);
    return this.service.reply(ctx.user!, input.ticketId, input.body, ctx);
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => SupportTicket)
  async closeSupportTicket(@Arg('id', () => ID) id: string, @Ctx() ctx: Context) {
    return this.service.close(id, ctx);
  }

  @Authorized([UserRole.Support])
  @Mutation(() => SupportTicket)
  async updateSupportTicket(@Arg('input') input: UpdateSupportTicketInput, @Ctx() ctx: Context) {
    return this.service.update(input, ctx);
  }

  @FieldResolver(() => [SupportMessage])
  async messages(@Root() ticket: SupportTicket, @Ctx() ctx: Context) {
    return ctx.dataLoader.get('supportMessagesLoader').load(ticket.id);
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => Customer, { nullable: true })
  async customer(@Root() ticket: SupportTicket, @Ctx() ctx: Context) {
    return ctx.dataLoader.get('customerLoader').load(ticket.customerId);
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => User, { nullable: true })
  async assignee(@Root() ticket: SupportTicket, @Ctx() ctx: Context) {
    return ticket.assigneeId ? ctx.dataLoader.get('userLoader').load(ticket.assigneeId) : null;
  }
}

@Service()
@Resolver(() => SupportMessage)
export class SupportMessageResolver {
  /** Customers see "NxPay Support" for staff replies; staff see the actual author. */
  @FieldResolver(() => String)
  async authorName(@Root() message: SupportMessage, @Ctx() ctx: Context) {
    const viewerIsStaff = ctx.user?.role === UserRole.Admin || ctx.user?.role === UserRole.Support;
    if (message.isStaff && !viewerIsStaff) return 'NxPay Support';
    const author = await ctx.dataLoader.get('userLoader').load(message.authorId);
    return author?.name ?? 'Unknown';
  }
}
