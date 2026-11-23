import { customerPricePlaceholder, customerQuantityLabel } from "./customer-price-placeholder";

test("quantity labels identify the existing measurement unit", () => {
  expect(customerQuantityLabel("Milk", "L")).toBe("Milk Quantity (L)");
  expect(customerQuantityLabel("Butter", "kg")).toBe("Butter Quantity (Kg)");
  expect(customerQuantityLabel("Ghee", "L")).toBe("Ghee Quantity (L)");
});

test("rate hints explicitly distinguish customer and average rates", () => {
  expect(customerPricePlaceholder(50, 52.5)).toBe("Rate: ₹50 · Avg Rate: ₹53");
  expect(customerPricePlaceholder("540", 481)).toBe("Rate: ₹540 · Avg Rate: ₹481");
  expect(customerPricePlaceholder(null, null)).toBe("Rate: Not set · Avg Rate: Unavailable");
});
