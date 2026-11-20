import { renderToStaticMarkup } from "react-dom/server";
import { useSession } from "next-auth/react";
import AuthProvider from "./AuthProvider";

function SessionProbe() {
  const { data, status } = useSession();
  return <div>{status}:{data?.user?.name}:{data?.user?.role}</div>;
}

describe("initial session hydration", () => {
  it("renders the signed-in user's name and role on the first render", () => {
    const session = {
      user: { name: "Siva", role: "admin" },
      expires: "2099-01-01T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      <AuthProvider session={session}><SessionProbe /></AuthProvider>,
    );
    expect(markup).toContain("authenticated:Siva:admin");
    expect(markup).not.toContain("loading");
  });

  it("renders signed-out visitors immediately when the server session is null", () => {
    const markup = renderToStaticMarkup(
      <AuthProvider session={null}><SessionProbe /></AuthProvider>,
    );
    expect(markup).toContain("unauthenticated");
    expect(markup).not.toContain("loading");
  });
});
