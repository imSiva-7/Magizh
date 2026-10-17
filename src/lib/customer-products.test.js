import { productSalesSummary } from "./customer-products";

test("sold quantities keep litres and kilograms separate with precise fractional quantities", () => {
  const summary = productSalesSummary([
    { name: "Milk", quantity: "120.5", amount: "4820" },
    { name: "Ghee", quantity: 2.25, amount: 1350 },
    { name: "Butter", quantity: 3.75, amount: 1500 },
    { name: "Fresh Cream", quantity: 5, amount: 1500 },
    { name: "Curd", quantity: 12.5, amount: 750 },
    { name: "Soft Paneer", quantity: 4.25, amount: 1700 },
    { name: "Premium Paneer", quantity: 7.5, amount: 3375 },
  ]);
  expect(summary.litres).toBe(122.75);
  expect(summary.kilograms).toBe(33);
  expect(summary.products.map(row => row.unit)).toEqual(["L", "L", "kg", "kg", "kg", "kg", "kg"]);
});

test("canonical product names merge decimal quantities without floating-point drift", () => {
  expect(productSalesSummary([{ name: "milk", quantity: .1, amount: .1 }, { name: " Milk ", quantity: .2, amount: .2 }])).toEqual({
    products: [{ name: "Milk", unit: "L", quantity: .3, amount: .3 }], litres: .3, kilograms: 0,
  });
});

test("unknown products stay visible without guessing a quantity unit", () => {
  const summary = productSalesSummary([{ name: "Special product", quantity: 9, amount: 500 }]);
  expect(summary.products[0].unit).toBeNull();
  expect(summary.litres).toBe(0);
  expect(summary.kilograms).toBe(0);
  expect(productSalesSummary()).toEqual({ products: [], litres: 0, kilograms: 0 });
});
