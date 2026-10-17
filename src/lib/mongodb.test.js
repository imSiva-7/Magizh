jest.mock("mongodb", () => ({ MongoClient: jest.fn() }));

const cacheKey = Symbol.for("magizhdairyproductions.mongodb");
const originalUri = process.env.MONGODB_URI;
const originalDebug = process.env.MONGO_DEBUG;
const originalNodeEnv = process.env.NODE_ENV;

function loadModule() {
  const { MongoClient } = require("mongodb");
  return { MongoClient, ...require("./mongodb") };
}

function mockClient(MongoClient, connectionError) {
  const client = {
    connect: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  client.connect.mockImplementation(() => connectionError
    ? Promise.reject(connectionError)
    : Promise.resolve(client));
  MongoClient.mockImplementationOnce(() => client);
  return client;
}

beforeEach(() => {
  jest.resetModules();
  delete globalThis[cacheKey];
  process.env.MONGODB_URI = "mongodb://localhost:27017/mocked-test-only";
  delete process.env.MONGO_DEBUG;
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  delete globalThis[cacheKey];
  for (const [name, value] of Object.entries({
    MONGODB_URI: originalUri,
    MONGO_DEBUG: originalDebug,
    NODE_ENV: originalNodeEnv,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.restoreAllMocks();
});

test.each(["development", "production"])("shares concurrent requests and module reloads in %s", async (mode) => {
  process.env.NODE_ENV = mode;
  const first = loadModule();
  const client = mockClient(first.MongoClient);

  // Importing unrelated route code must not start a background connection.
  expect(first.MongoClient).not.toHaveBeenCalled();
  const pending = first.getMongoClient();
  expect(first.getMongoClient()).toBe(pending);
  expect(await Promise.all([first.default, first.default, pending])).toEqual([client, client, client]);
  expect(first.MongoClient).toHaveBeenCalledTimes(1);
  expect(client.connect).toHaveBeenCalledTimes(1);
  expect(first.MongoClient).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ minPoolSize: 0, maxPoolSize: 20 }));

  jest.resetModules();
  const reloaded = loadModule();
  expect(await reloaded.default).toBe(client);
  expect(reloaded.MongoClient).not.toHaveBeenCalled();
  expect(client.connect).toHaveBeenCalledTimes(1);
  expect(console.info).not.toHaveBeenCalled();
});

test("closes a failed client and retries through the same default import", async () => {
  const db = loadModule();
  const unavailable = new Error("mock server unavailable");
  const failed = mockClient(db.MongoClient, unavailable);
  const recovered = mockClient(db.MongoClient);

  await expect(Promise.all([db.default, db.default])).rejects.toBe(unavailable);
  expect(db.MongoClient).toHaveBeenCalledTimes(1);
  expect(failed.close).toHaveBeenCalledTimes(1);

  expect(await db.default).toBe(recovered);
  expect(db.MongoClient).toHaveBeenCalledTimes(2);
  expect(recovered.connect).toHaveBeenCalledTimes(1);
  expect(recovered.close).not.toHaveBeenCalled();
});

test("keeps the connection error when closing a failed client also fails", async () => {
  const db = loadModule();
  const unavailable = new Error("mock server unavailable");
  const failed = mockClient(db.MongoClient, unavailable);
  failed.close.mockRejectedValue(new Error("mock close failed"));
  await expect(db.default.catch((error) => { throw error; })).rejects.toBe(unavailable);
  expect(globalThis[cacheKey].promise).toBeNull();
});

test("debug logging reports one client connection and adds no process or replica pool listeners", async () => {
  process.env.MONGO_DEBUG = "true";
  const on = jest.spyOn(process, "on");
  const db = loadModule();
  const client = mockClient(db.MongoClient);
  await Promise.all([db.default, db.default]);
  expect(console.info).toHaveBeenCalledTimes(1);
  expect(console.info).toHaveBeenCalledWith("MongoDB client connected");
  expect(client.on).not.toHaveBeenCalled();
  expect(on.mock.calls.filter(([event]) => ["SIGINT", "SIGTERM", "beforeExit"].includes(event))).toEqual([]);
});

test("rejects missing configuration without opening a client", () => {
  delete process.env.MONGODB_URI;
  expect(() => loadModule()).toThrow("MONGODB_URI is not defined");
  expect(require("mongodb").MongoClient).not.toHaveBeenCalled();
});
