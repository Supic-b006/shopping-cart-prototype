import { expect } from 'vitest';
import { DomainError } from '../../src/domain/errors.js';
import { Shop } from '../../src/domain/shop.js';
import type { MemberTier, State, User } from '../../src/domain/types.js';

export const ORDER_ID = '00000000-0000-4000-8000-000000000001';
export const CREATED_AT = '2026-01-01T00:00:00.000Z';

// Synthetic fixtures, not DB seed data. Every invocation allocates a new graph.
export function fixture(tier: MemberTier = 'prime') {
  const user: User = { id: 'alice', username: 'alice', role: 'Customer', memberTier: tier };
  const other: User = { id: 'bob', username: 'bob', role: 'Customer', memberTier: 'normal' };
  const administrator: User = { id: 'admin', username: 'admin', role: 'Admin', memberTier: null };
  const state: State = {
    products: [
      { productId: 'P1', name: 'Coffee', price: 450, weightGram: 300, stock: 20, isOnSale: true },
      { productId: 'P2', name: 'Equipment', price: 1200, weightGram: 900, stock: 10, isOnSale: true },
      { productId: 'OFF', name: 'Unavailable', price: 100, weightGram: 100, stock: 5, isOnSale: false },
      { productId: 'ZERO', name: 'Sold out', price: 100, weightGram: 100, stock: 0, isOnSale: true },
    ],
    coupons: [
      { code: 'SAVE10', percent: 10, minSpend: 1000, active: true },
      { code: 'OFF10', percent: 10, minSpend: 1000, active: false },
      { code: 'SMALL', percent: 1, minSpend: 0, active: true },
    ],
    carts: [user, other].map(u => ({
      userId: u.id, stage: 'cart', couponCode: null, currentOrderId: null, lines: [],
    })),
    orders: [],
  };
  return { state, shop: new Shop(state, user), otherShop: new Shop(state, other),
    admin: new Shop(state, administrator), user };
}

export function readyCart() {
  const context = fixture();
  context.state.carts[0].lines = [{ productId: 'P1', quantity: 1 }, { productId: 'P2', quantity: 1 }];
  context.state.carts[0].couponCode = 'SAVE10';
  return context;
}

export function pendingOrder() {
  const context = readyCart();
  const { order } = context.shop.checkout('inCity', 'standard', ORDER_ID, CREATED_AT);
  return { ...context, order };
}

// Assert both the precise domain error and the entire state, including other users.
export function expectRejected(state: State, act: () => unknown, code: string,
  details: Record<string, unknown> = {}, expectedMessage?: string) {
  const before = structuredClone(state);
  let caught: unknown;
  try { act(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DomainError);
  expect(caught).toHaveProperty('message', expect.any(String));
  if (expectedMessage !== undefined) expect((caught as DomainError).message).toBe(expectedMessage);
  expect((caught as DomainError).code).toBe(code);
  expect((caught as DomainError).details).toEqual(details);
  expect(state).toEqual(before);
}