import { describe, expect, it } from 'vitest';
import {
  calculateDiscount, calculateShippingFee, calculateSubtotal, calculateTotalWeight,
  classifyWeight, validateCheckout, validateQuantityChange,
} from '../src/domain/pricing.js';

describe('SRS pure business rules', () => {
  it('validates quantity in the required order', () => {
    expect(validateQuantityChange({operation:'add', quantity:0, productExists:true, inCart:false, available:true, currentQtyInCart:0, availableStock:20})).toBe('QTY_OUT_OF_RANGE');
    expect(validateQuantityChange({operation:'add', quantity:1, productExists:false, inCart:false, available:false, currentQtyInCart:0, availableStock:0})).toBe('PRODUCT_NOT_FOUND');
    expect(validateQuantityChange({operation:'add', quantity:1, productExists:true, inCart:false, available:true, currentQtyInCart:8, availableStock:20})).toBe('OK');
    expect(validateQuantityChange({operation:'add', quantity:3, productExists:true, inCart:false, available:true, currentQtyInCart:8, availableStock:20})).toBe('QTY_OUT_OF_RANGE');
  });

  it('matches AC-4 and AC-5 totals', () => {
    const lines = [{price:450, weightGram:300, quantity:1}, {price:1200, weightGram:900, quantity:1}];
    const subtotal = calculateSubtotal(lines); expect(subtotal).toBe(1650); expect(calculateTotalWeight(lines)).toBe(1200);
    expect(calculateDiscount(subtotal,'prime',{percent:10,minSpend:1000,active:true})).toMatchObject({discount:165,source:'coupon'});
    expect(calculateDiscount(subtotal,'prime',null)).toMatchObject({discount:82,source:'member'});
    expect(calculateShippingFee('medium','inCity','standard','prime')).toBe(0);
  });

  it('classifies weight and checkout validation', () => {
    expect(classifyWeight(1000)).toBe('light'); expect(classifyWeight(5001)).toBe('heavy'); expect(classifyWeight(20001)).toBe('overLimit');
    expect(validateCheckout({zone:'inCity',speed:'standard',lines:[],totalWeightGram:0})).toEqual({result:'CART_EMPTY'});
    expect(validateCheckout({zone:'inCity',speed:'standard',lines:[{productId:'P3',quantity:3,available:true,availableStock:3}],totalWeightGram:24000})).toEqual({result:'WEIGHT_LIMIT_EXCEEDED'});
  });
});
