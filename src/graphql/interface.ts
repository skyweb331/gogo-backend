import { Field, Int, InterfaceType } from 'type-graphql';

@InterfaceType()
export abstract class TimeStamp {
  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  updatedAt?: Date;
}

@InterfaceType({ implements: TimeStamp })
export abstract class Entity extends TimeStamp {
  @Field(() => Int)
  id: number;
}
