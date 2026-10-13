import { Service } from 'typedi';
import { Arg, Authorized, Ctx, Mutation, Query, Resolver, UseMiddleware } from 'type-graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';
import { RequireCustomer } from '#src/graphql/middleware/index.js';
import { RateLimiterService } from '#src/service/rateLimiter.js';
import { CustomerService } from '#src/entity/customer/customer.service.js';

import { OnboardingStatus, StartOnboardingInput } from './onboarding.type.js';
import { OnboardingService } from './onboarding.service.js';

@Service()
@Resolver()
export class OnboardingResolver {
  constructor(
    private readonly service: OnboardingService,
    private readonly customers: CustomerService,
    private readonly rateLimiter: RateLimiterService
  ) {}

  private async fresh(ctx: Context) {
    return (await this.customers.getById(ctx.customer!.id))!;
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Query(() => OnboardingStatus)
  async onboardingStatus(@Ctx() ctx: Context): Promise<OnboardingStatus> {
    return this.service.status(await this.fresh(ctx));
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => OnboardingStatus)
  async startOnboarding(
    @Arg('data') data: StartOnboardingInput,
    @Ctx() ctx: Context
  ): Promise<OnboardingStatus> {
    this.rateLimiter.consume(`onboarding:start:${ctx.customer!.id}`, 5, 10 * 60_000);
    const customer = await this.service.start(ctx.user!, await this.fresh(ctx), data.type, ctx);
    return this.service.status(customer);
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => OnboardingStatus)
  async refreshKycStatus(@Ctx() ctx: Context): Promise<OnboardingStatus> {
    this.rateLimiter.consume(`onboarding:refresh:${ctx.customer!.id}`, 12, 60_000);
    const customer = await this.fresh(ctx);
    if (!customer.kycLinkId && !customer.bridgeCustomerId) return this.service.status(customer);
    return this.service.status(await this.service.refresh(customer));
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => OnboardingStatus)
  async regenerateKycLink(@Ctx() ctx: Context): Promise<OnboardingStatus> {
    this.rateLimiter.consume(`onboarding:link:${ctx.customer!.id}`, 5, 10 * 60_000);
    return this.service.status(await this.service.regenerateKycLink(await this.fresh(ctx)));
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => OnboardingStatus, { description: 'Bridge sandbox only: approve a test identity' })
  async simulateKycApproval(@Ctx() ctx: Context): Promise<OnboardingStatus> {
    this.rateLimiter.consume(`onboarding:simulate:${ctx.customer!.id}`, 5, 10 * 60_000);
    return this.service.status(await this.service.simulateApproval(await this.fresh(ctx)));
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Mutation(() => OnboardingStatus)
  async completeOnboarding(@Ctx() ctx: Context): Promise<OnboardingStatus> {
    this.rateLimiter.consume(`onboarding:complete:${ctx.customer!.id}`, 10, 10 * 60_000);
    return this.service.status(await this.service.complete(ctx.customer!.id));
  }
}
