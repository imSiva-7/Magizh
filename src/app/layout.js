import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthProvider from "./AuthProvider"; // import the client component

export const metadata = {
  title: "Magizh Dairy",
  description: "Let's goo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>   {/* Wrap with AuthProvider */}
          <Header />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
