// https://github.com/graphql-hive/graphql-scalars/blob/master/src/scalars/BigInt.ts
// Refactor this to always parse bigint into string and vice-versa
import { GraphQLScalarType, type GraphQLScalarTypeConfig, print } from 'graphql';
import { createGraphQLError } from './error.js';
import { serializeObject } from './utilities.js';

let warned = false;

function serializeSafeBigInt(val: bigint): bigint | number | string {
  if (isBigIntSerializable()) {
    return val;
  }
  return val.toString();
}

function isBigIntSerializable() {
  if (!('toJSON' in BigInt.prototype)) {
    if (!warned) {
      warned = true;
      console.warn(
        'By default, BigInts are not serialized to JSON as numbers but instead as strings which may lead an unintegrity in your data. ' +
          'To fix this, you can use "json-bigint-patch" to enable correct serialization for BigInts.'
      );
    }
    return false;
  }
  return true;
}

export const GraphQLBigIntConfig: GraphQLScalarTypeConfig<
  bigint | number,
  bigint | string | number
> = {
  // Name conflicts with GraphQLBigInt from graphql-scalars
  name: 'BigInteger',
  description: 'The `BigInt` scalar type represents non-fractional signed whole numeric values.',
  serialize(outputValue) {
    const coercedValue = serializeObject(outputValue);

    let num: unknown = coercedValue;

    if (typeof coercedValue === 'object' && coercedValue != null && 'toString' in coercedValue) {
      num = BigInt(coercedValue.toString());
      if (String(num) !== coercedValue.toString()) {
        throw createGraphQLError(`BigInt cannot represent non-integer value: ${coercedValue}`);
      }
    }

    if (typeof coercedValue === 'boolean') {
      num = BigInt(coercedValue);
    }

    if (typeof coercedValue === 'string' && coercedValue !== '') {
      num = BigInt(coercedValue);
      if (String(num) !== coercedValue) {
        throw createGraphQLError(`BigInt cannot represent non-integer value: ${coercedValue}`);
      }
    }

    if (typeof coercedValue === 'number') {
      if (!Number.isInteger(coercedValue)) {
        throw createGraphQLError(`BigInt cannot represent non-integer value: ${coercedValue}`);
      }
      num = BigInt(coercedValue);
    }

    if (typeof num !== 'bigint') {
      throw createGraphQLError(`BigInt cannot represent non-integer value: ${coercedValue}`);
    }

    return serializeSafeBigInt(num);
  },
  parseValue(inputValue) {
    const bigint = BigInt(String(inputValue));
    if (String(inputValue) !== bigint.toString()) {
      throw createGraphQLError(`BigInt cannot represent value: ${inputValue}`);
    }
    return bigint;
  },
  parseLiteral(valueNode) {
    if (!('value' in valueNode)) {
      throw createGraphQLError(`BigInt cannot represent non-integer value: ${print(valueNode)}`, {
        nodes: valueNode,
      });
    }
    const strOrBooleanValue = valueNode.value;
    const bigint = BigInt(strOrBooleanValue);
    if (strOrBooleanValue.toString() !== bigint.toString()) {
      throw createGraphQLError(`BigInt cannot represent value: ${strOrBooleanValue}`);
    }
    return bigint;
  },
  extensions: {
    codegenScalarType: 'bigint',
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  },
};

export const GraphQLBigInt = new GraphQLScalarType(GraphQLBigIntConfig);
