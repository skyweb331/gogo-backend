// https://github.com/graphql-hive/graphql-scalars/blob/master/src/scalars/utilities.ts

export function isObjectLike(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

// Taken from https://github.com/graphql/graphql-js/blob/30b446938a9b5afeb25c642d8af1ea33f6c849f3/src/type/scalars.ts#L267

// Support serializing objects with custom valueOf() or toJSON() functions -
// a common way to represent a complex value which can be represented as
// a string (ex: MongoDB id objects).
export function serializeObject(outputValue: unknown): unknown {
  if (isObjectLike(outputValue)) {
    if (typeof outputValue.valueOf === 'function') {
      const valueOfResult = outputValue.valueOf();
      if (!isObjectLike(valueOfResult)) {
        return valueOfResult;
      }
    }
    if (typeof outputValue.toJSON === 'function') {
      return outputValue.toJSON();
    }
  }
  return outputValue;
}
