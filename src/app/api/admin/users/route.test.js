import { GET, PATCH, DELETE } from "./route";
import { getServerSession } from "next-auth";
import { ObjectId } from "mongodb";
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
const mockCollection = {
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
};
jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({ collection: () => mockCollection }),
  }),
}));
const ownId = "aaaaaaaaaaaaaaaaaaaaaaaa",
  otherId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const request = (method, body, id = otherId) =>
  new Request(`http://localhost/api/admin/users?id=${id}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: ownId, role: "admin", email: "admin@example.test" },
  });
  mockCollection.findOne.mockResolvedValue({
    _id: new ObjectId(otherId),
    email: "other@example.test",
  });
  mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
});
test.each([null, { user: { role: "employee" } }])(
  "non-administrators cannot read or mutate accounts",
  async (session) => {
    getServerSession.mockResolvedValue(session);
    for (const response of [
      await GET(request("GET")),
      await PATCH(request("PATCH", { userId: otherId, role: "admin" })),
      await DELETE(request("DELETE")),
    ])
      expect(response.status).toBe(403);
    expect(mockCollection.find).not.toHaveBeenCalled();
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(mockCollection.deleteOne).not.toHaveBeenCalled();
  },
);
test("user listing projects only public account fields and disables caching", async () => {
  const cursor = {
    sort: jest.fn().mockReturnThis(),
    toArray: jest
      .fn()
      .mockResolvedValue([
        { _id: otherId, email: "other@example.test", role: "employee" },
      ]),
  };
  mockCollection.find.mockReturnValue(cursor);
  const response = await GET(request("GET"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const projection = mockCollection.find.mock.calls[0][1].projection;
  expect(Object.keys(projection).sort()).toEqual([
    "createdAt",
    "email",
    "name",
    "role",
    "updatedAt",
  ]);
  expect(cursor.sort).toHaveBeenCalledWith({ name: 1, email: 1 });
});
test.each([
  { userId: "bad", role: "admin" },
  { userId: otherId, role: "owner" },
])("invalid role updates are rejected without writes", async (body) => {
  expect((await PATCH(request("PATCH", body))).status).toBe(400);
  expect(mockCollection.updateOne).not.toHaveBeenCalled();
});
test.each(["role", "delete"])(
  "own-account %s protection also works when session ID is absent",
  async (operation) => {
    getServerSession.mockResolvedValue({
      user: { role: "admin", email: "ADMIN@example.test" },
    });
    mockCollection.findOne.mockResolvedValue({
      _id: new ObjectId(ownId),
      email: "admin@example.test",
    });
    const response =
      operation === "role"
        ? await PATCH(request("PATCH", { userId: ownId, role: "employee" }))
        : await DELETE(request("DELETE", undefined, ownId));
    expect(response.status).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
    expect(mockCollection.deleteOne).not.toHaveBeenCalled();
  },
);
test("a role update retains the supported role contract and returns missing-user errors", async () => {
  expect(
    (await PATCH(request("PATCH", { userId: otherId, role: "supplier" })))
      .status,
  ).toBe(200);
  expect(mockCollection.updateOne.mock.calls[0][1].$set.role).toBe("supplier");
  mockCollection.findOne.mockResolvedValue(null);
  expect(
    (await PATCH(request("PATCH", { userId: otherId, role: "admin" }))).status,
  ).toBe(404);
});
test("deletion only removes the requested user account", async () => {
  expect((await DELETE(request("DELETE"))).status).toBe(200);
  expect(mockCollection.deleteOne).toHaveBeenCalledWith({
    _id: new ObjectId(otherId),
  });
});
