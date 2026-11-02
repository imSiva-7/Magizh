import assert from "node:assert/strict";
import test from "node:test";
import {
  priceProcurement,
  procurementPricing,
  truncateCalculatedRate,
} from "./procurement-pricing.mjs";

const input = { milkQuantity: 10, fatPercentage: 4, snfPercentage: 8.5 };
const snapshot = (supplierTSRate) => ({
  customRate: false,
  parentTsr: supplierTSRate,
  cutPercentage: 0,
  supplierTSRate,
});

test("calculated supplier rates truncate to one decimal without rounding", () => {
  assert.equal(truncateCalculatedRate(44.28), 44.2);
  assert.equal(truncateCalculatedRate(44.98), 44.9);
  assert.equal(truncateCalculatedRate(45.69), 45.6);
});

test("procurement totals use the truncated calculated rate", () => {
  const procurement = priceProcurement(input, snapshot(354.24));
  assert.equal(procurement.rate, 44.2);
  assert.equal(procurement.totalAmount, 442);
});

test("custom supplier rates are not truncated", () => {
  const procurement = priceProcurement(input, {
    customRate: true,
    parentTsr: 300,
    cutPercentage: 0,
    supplierTSRate: 300,
    rate: 44.98,
  });
  assert.equal(procurement.rate, 44.98);
  assert.equal(procurement.totalAmount, 449.8);
});

test("reporting recalculates legacy formula rates and amounts but preserves custom rates", () => {
  assert.deepEqual(
    procurementPricing({
      milkQuantity: 10,
      rate: 44.98,
      totalAmount: 449.8,
      customRate: false,
    }),
    { rate: 44.9, totalAmount: 449 },
  );
  assert.deepEqual(
    procurementPricing({
      milkQuantity: 10,
      rate: 44.98,
      totalAmount: 449.8,
      customRate: true,
    }),
    { rate: 44.98, totalAmount: 449.8 },
  );
});
