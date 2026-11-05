import { describe, expect, it } from 'vitest';
import { DomainError, ensure } from '../../src/domain/errors.js';

describe('API.md / domain error status contract', () => {
  it.each([
    ['VALIDATION_ERROR', 400], ['QTY_OUT_OF_RANGE', 400],
    ['AUTH_REQUIRED', 401], ['AUTH_INVALID_CREDENTIALS', 401],
    ['AUTH_FORBIDDEN', 403],
    ['PRODUCT_NOT_FOUND', 404], ['ORDER_NOT_FOUND', 404], ['COUPON_NOT_FOUND', 404],
    ['PRODUCT_UNAVAILABLE', 409], ['INSUFFICIENT_STOCK', 409], ['ITEM_NOT_IN_CART', 409],
    ['CART_EMPTY', 409], ['COUPON_INVALID', 409], ['ITEMS_UNAVAILABLE', 409],
    ['WEIGHT_LIMIT_EXCEEDED', 409], ['OPERATION_NOT_ALLOWED', 409],
  ])('%s -> %s', (code, status) => {
    const error = new DomainError(code);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error).toHaveProperty('message', expect.any(String));
    expect(error.details).toEqual({});
  });
  it('preserves structured validation details', () => {
    const act = () => ensure(false, 'VALIDATION_ERROR', { fields: ['price', 'stock'] });
    expect(act).toThrowError(expect.objectContaining({
      code: 'VALIDATION_ERROR', details: { fields: ['price', 'stock'] }, status: 400, message: expect.any(String),
    }));
  });
});