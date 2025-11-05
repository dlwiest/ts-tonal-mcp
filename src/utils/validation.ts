import { TonalMCPError } from './error-handler.js';
import { DEFAULTS } from '../constants.js';

export function validatePositiveNumber(value: unknown, fieldName: string): number {
  if (value === undefined || value === null) {
    throw new TonalMCPError(`${fieldName} is required`, 'VALIDATION_ERROR', 400);
  }
  
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new TonalMCPError(`${fieldName} must be a positive number`, 'VALIDATION_ERROR', 400);
  }
  
  return num;
}

export function validateStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  
  if (!Array.isArray(value)) {
    throw new TonalMCPError(`${fieldName} must be an array`, 'VALIDATION_ERROR', 400);
  }
  
  const stringArray = value.filter(item => typeof item === 'string');
  if (stringArray.length !== value.length) {
    throw new TonalMCPError(`All items in ${fieldName} must be strings`, 'VALIDATION_ERROR', 400);
  }
  
  return stringArray;
}

export function validateOptionalLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return DEFAULTS.WORKOUT_LIMIT;
  }
  
  const num = Number(limit);
  if (isNaN(num) || num <= 0) {
    throw new TonalMCPError('Limit must be a positive number', 'VALIDATION_ERROR', 400);
  }
  
  // Cap at reasonable maximum
  return Math.min(num, DEFAULTS.MAX_WORKOUT_LIMIT);
}