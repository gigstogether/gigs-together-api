import { Types } from 'mongoose';

export function isNonEmptyUniqueObjectIdArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const objectIds: string[] = [];
  for (const item of value) {
    if (!(item instanceof Types.ObjectId)) {
      return false;
    }
    objectIds.push(item.toHexString());
  }
  return new Set(objectIds).size === objectIds.length;
}

export function toObjectIdArray(
  values: readonly string[],
  field: string,
): Types.ObjectId[] {
  if (values.length === 0) {
    throw new Error(`${field} must be a non-empty array.`);
  }

  const normalizedValues = values.map((value) => {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`${field} must contain valid ObjectIds.`);
    }
    return value.toLowerCase();
  });
  if (new Set(normalizedValues).size !== normalizedValues.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
  return normalizedValues.map((value) => new Types.ObjectId(value));
}

export function fromObjectIdArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array.`);
  }

  const objectIds = value.map((item) => {
    if (!(item instanceof Types.ObjectId)) {
      throw new Error(`${field} must contain ObjectIds.`);
    }
    return item.toHexString();
  });
  if (new Set(objectIds).size !== objectIds.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
  return objectIds;
}
