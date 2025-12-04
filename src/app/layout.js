import "./globals.css";
export const metadata = {
  title: "Magizh Dairy",
  description: "Let's goo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body >
        {children}
      </body>
    </html>
  );
}
