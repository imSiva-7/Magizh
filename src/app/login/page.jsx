"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "@/css/login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/"); // or any protected page
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Welcome Back</h1>
          <p>Sign in to your Magizh Dairy account</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.input_group}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              className={`${styles.input} ${error ? styles.input_error : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.input_group}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              className={`${styles.input} ${error ? styles.input_error : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            {error && <div className={styles.error_message}>{error}</div>}
          </div>

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.button_spinner}></span>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>

          <div className={styles.footer}>
            Don't have an account? <Link href="/register">Create one</Link>
          </div>
        </form>
      </div>
    </div>
  );
}