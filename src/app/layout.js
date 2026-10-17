import "./globals.css";
import "./buttons.css";
import "./filters.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthProvider from "./AuthProvider"; // import the client component

export const metadata = {
  title: "Magizh Dairy",
  description: "Your Premium dairy partner",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <body>
        <AuthProvider>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <Header />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
