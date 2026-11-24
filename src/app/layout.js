import "./globals.css";
import "./buttons.css";
import "./filters.css";
import "./toasts.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EntryShortcuts from "@/components/EntryShortcuts";
import IntelligenceChat from "@/components/intelligence/IntelligenceChat";
import AuthProvider from "./AuthProvider";
import { getInitialSession } from "@/lib/server-session";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta-sans",
});

export const metadata = {
  title: "Magizh Dairy",
  description: "Your Premium dairy partner",
};

export default async function RootLayout({ children }) {
  const session = await getInitialSession();

  return (
    <html lang="en-IN" className={plusJakartaSans.variable}>
      <body>
        <AuthProvider session={session}>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <Header />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <EntryShortcuts />
          <IntelligenceChat />
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
