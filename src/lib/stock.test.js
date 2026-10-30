import { buildInventory, stockNumber } from "./stock";

test("averages numeric price strings as numbers and ignores unset or invalid prices", () => {
  const [butter] = buildInventory({ butter: "12.5" }, { butter: 20 }, [
    { butterPrice: "100" }, { butterPrice: "200" }, { butterPrice: null }, { butterPrice: "" }, { butterPrice: "invalid" }, { butterPrice: -1 },
  ]);
  expect(butter.averagePrice).toBe(150);
  expect(butter.estimatedValue).toBe(1875);
  expect(butter.status).toBe("Low stock");
});

test("missing prices and settings are unavailable rather than zero or healthy", () => {
  const [butter] = buildInventory({ butter: 12 }, null, null);
  expect(butter.averagePrice).toBeNull();
  expect(butter.estimatedValue).toBeNull();
  expect(butter.minimum).toBeNull();
  expect(butter.status).toBe("Minimum unavailable");
});

test.each([
  [-2, 0, "Negative stock", true],
  [0, 0, "Out of stock", true],
  [12, 20, "Low stock", true],
  [20, 20, "Healthy", false],
  [12, 0, "No minimum set", false],
])("quantity %s and minimum %s produce %s", (quantity, minimum, status, needsAttention) => {
  const [butter] = buildInventory({ butter: quantity }, { butter: minimum }, []);
  expect(butter).toMatchObject({ status, needsAttention });
});

test("zero is a valid selling price but empty and non-finite values are not", () => {
  expect(stockNumber("0")).toBe(0);
  for (const value of [null, undefined, "", " ", "Infinity", NaN, false]) expect(stockNumber(value)).toBeNull();
  const [butter] = buildInventory({ butter: 12 }, {}, [{ butterPrice: 0 }]);
  expect(butter.averagePrice).toBe(0);
  expect(butter.estimatedValue).toBe(0);
});

test("invalid balance data is marked unavailable and product units are retained", () => {
  const items = buildInventory({ butter: "broken", ghee: 8 }, {}, []);
  expect(items[0].quantity).toBeNull();
  expect(items[0].status).toBe("Unavailable");
  expect(items.find((item) => item.field === "ghee").unit).toBe("L");
  expect(items.filter((item) => item.unit === "kg")).toHaveLength(5);
});

test("milk stock used by production and orders is visible in litres", () => {
  const milk = buildInventory({ milk: 25 }, { milk: 10 }, [{ milkPrice: 50 }]).find(product => product.field === "milk");
  expect(milk).toMatchObject({ name: "Milk", unit: "L", quantity: 25, averagePrice: 50, estimatedValue: 1250, status: "Healthy" });
});
