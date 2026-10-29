import { Field, ID, Int, ObjectType } from 'type-graphql';

@ObjectType()
export abstract class PaginatedResponse {
  @Field(() => Int, { nullable: true })
  total?: number;
}

@ObjectType()
export class SuccessResponse {
  @Field(() => Boolean)
  success: boolean;
}

@ObjectType()
export class IDsResponse {
  @Field(() => [ID])
  ids: string[];
}
