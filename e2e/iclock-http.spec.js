import { test, expect } from "@playwright/test";

test("device handshake and legacy aliases return plain text without browser login", async ({ request }) => {
  for (const path of ["/iclock/cdata", "/iclock/cdata.aspx", "/api/attendance/iclock/cdata"]) {
    const response = await request.get(`${path}?SN=SIMULATED-DEVICE`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toBe("OK");
  }
});

test("invalid device data is rejected before storage and operation uploads are ignored", async ({ request }) => {
  const missingSerial = await request.post("/iclock/cdata?table=ATTLOG", { data: "invalid" });
  expect(missingSerial.status()).toBe(400);
  const malformed = await request.post("/iclock/cdata?SN=SIMULATED-DEVICE&table=ATTLOG", { data: "invalid" });
  expect(malformed.status()).toBe(400);
  const operation = await request.post("/iclock/cdata?SN=SIMULATED-DEVICE&table=OPLOG", { data: "not attendance" });
  expect(operation.status()).toBe(200);
  expect(await operation.text()).toBe("OK");
});
