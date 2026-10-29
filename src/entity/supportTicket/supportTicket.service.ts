import { Service } from 'typedi';

import {
  PrismaService,
  type CustomerRow,
  type SupportTicketRow,
  type UserRow,
} from '#src/service/prisma.js';
import { MailerService } from '#src/service/mailer.js';
import { TicketStatus, UserRole } from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { isStaff } from '#src/authChecker.js';
import type { Context } from '#src/context.js';
import { AppError, ForbiddenError, NotFoundError } from '#src/utils/errors.js';
import { generateReference } from '#src/utils/reference.js';

import type {
  CreateSupportTicketInput,
  SupportTicketQueryArgs,
  UpdateSupportTicketInput,
} from './supportTicket.type.js';

const TICKET_LIST = {
  model: 'SupportTicket',
  filterable: [
    'id',
    'reference',
    'customerId',
    'status',
    'assigneeId',
    'subject',
    'createdAt',
    'lastMessageAt',
  ],
  sortable: ['createdAt', 'lastMessageAt', 'status'],
  defaultSort: 'lastMessageAt',
} as const;

@Service()
export class SupportTicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditLogService
  ) {}

  async list(query: SupportTicketQueryArgs): Promise<SupportTicketRow[]> {
    return query.applyTo(this.prisma.orm.SupportTicket, TICKET_LIST).all();
  }

  async count(query: SupportTicketQueryArgs): Promise<number> {
    const { total } = await query
      .applyFilter(this.prisma.orm.SupportTicket, TICKET_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async getById(id: string) {
    return this.prisma.orm.SupportTicket.where({ id }).first();
  }

  async create(user: UserRow, customer: CustomerRow, input: CreateSupportTicketInput) {
    const now = new Date();
    const ticket = await this.prisma.transaction(async () => {
      const created = await this.prisma.orm.SupportTicket.create({
        reference: generateReference('SUP'),
        customerId: customer.id,
        subject: input.subject.trim(),
        status: TicketStatus.Open,
        lastMessageAt: now,
      });
      await this.prisma.orm.SupportMessage.create({
        ticketId: created.id,
        authorId: user.id,
        body: input.body.trim(),
        isStaff: false,
      });
      return created;
    });
    this.mailer.opsAlert(`New support ticket ${ticket.reference}`, [
      `${user.name} <${user.email}>: ${ticket.subject}`,
    ]);
    return ticket;
  }

  async reply(user: UserRow, ticketId: string, body: string, ctx: Context) {
    const ticket = await this.getById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const staff = isStaff(user.role);
    if (!staff && ctx.customer?.id !== ticket.customerId) throw new ForbiddenError('Not allowed');
    if (!staff && ticket.status === TicketStatus.Closed) {
      throw new AppError('This ticket is closed. Open a new ticket if you still need help.');
    }

    const now = new Date();
    const updated = await this.prisma.transaction(async () => {
      await this.prisma.orm.SupportMessage.create({
        ticketId,
        authorId: user.id,
        body: body.trim(),
        isStaff: staff,
      });
      return this.prisma.orm.SupportTicket.where({ id: ticketId }).update({
        lastMessageAt: now,
        // Staff reply waits on the customer; a customer reply reopens the ticket
        status: staff ? TicketStatus.Pending : TicketStatus.Open,
        ...(staff && ticket.assigneeId === null && { assigneeId: user.id }),
      });
    });

    if (staff) {
      await this.audit.log(ctx, {
        action: 'support.reply',
        entity: 'SupportTicket',
        entityId: ticketId,
      });
      const customer = await this.prisma.orm.Customer.where({ id: ticket.customerId }).first();
      const recipient = customer
        ? await this.prisma.orm.User.where({ id: customer.userId }).first()
        : null;
      if (recipient) {
        this.mailer.sendSafe({
          to: recipient.email,
          subject: `Re: ${ticket.subject}`,
          template: 'support-reply',
          locals: {
            name: recipient.name,
            subjectLine: ticket.subject,
            body: body.trim(),
            ticketId,
          },
        });
      }
    }
    return updated!;
  }

  async update(input: UpdateSupportTicketInput, ctx: Context) {
    const ticket = await this.getById(input.id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (input.assigneeId) {
      const assignee = await this.prisma.orm.User.where({ id: input.assigneeId }).first();
      if (!assignee || (assignee.role !== UserRole.Admin && assignee.role !== UserRole.Support)) {
        throw new AppError('Assignee must be a staff user', { field: 'assigneeId' });
      }
    }
    const patch = {
      ...(input.status && { status: input.status }),
      ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
    };
    if (Object.keys(patch).length === 0) return ticket;
    const updated = await this.prisma.orm.SupportTicket.where({ id: ticket.id }).update(patch);
    await this.audit.log(ctx, {
      action: 'support.update',
      entity: 'SupportTicket',
      entityId: ticket.id,
      before: { status: ticket.status, assigneeId: ticket.assigneeId },
      after: patch,
    });
    return updated!;
  }

  /** Customers close their own tickets. */
  async close(ticketId: string, ctx: Context) {
    const ticket = await this.getById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (ctx.customer?.id !== ticket.customerId) throw new ForbiddenError('Not allowed');
    return (await this.prisma.orm.SupportTicket.where({ id: ticketId }).update({
      status: TicketStatus.Closed,
    }))!;
  }
}
