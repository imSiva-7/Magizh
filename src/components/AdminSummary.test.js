import { renderToStaticMarkup } from "react-dom/server";
import { useSession } from "next-auth/react";
import AdminSummary from "./AdminSummary";

jest.mock("next-auth/react", () => ({ useSession: jest.fn() }));

test.each(["employee", "dev", undefined])("does not render summary content for %s", role => {
  useSession.mockReturnValue({ status: "authenticated", data: { user: { role } } });
  expect(renderToStaticMarkup(<AdminSummary><p>Financial summary</p></AdminSummary>)).toBe("");
});

test("does not flash summaries while the session loads", () => {
  useSession.mockReturnValue({ status: "loading", data: null });
  expect(renderToStaticMarkup(<AdminSummary><p>Financial summary</p></AdminSummary>)).toBe("");
});

test("renders summaries for admins", () => {
  useSession.mockReturnValue({ status: "authenticated", data: { user: { role: "admin" } } });
  expect(renderToStaticMarkup(<AdminSummary><p>Financial summary</p></AdminSummary>)).toContain("Financial summary");
});
