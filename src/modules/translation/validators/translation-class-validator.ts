import { registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';
import {
  isValidTranslationKey,
  isValidTranslationNamespace,
} from '../translation-identifiers';

export function IsTranslationNamespace(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isTranslationNamespace',
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' && isValidTranslationNamespace(value)
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid camelCase translation namespace`;
        },
      },
    });
  };
}

export function IsTranslationKey(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isTranslationKey',
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidTranslationKey(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid camelCase translation key`;
        },
      },
    });
  };
}
