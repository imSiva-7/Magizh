"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "@/css/register.module.css";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    // Basic validation
    if (!name || !email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setSuccess(true);
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Create Account</h1>
          <p>Join Magizh Dairy today</p>
        </div>

        <div className={styles.form}>
          {success ? (
            <div className={styles.success_message}>
              <svg className={styles.success_icon} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Registration successful! Redirecting to login...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.input_group}>
                <label htmlFor="name" className={styles.label}>Full Name</label>
                <input
                  id="name"
                  type="text"
                  className={`${styles.input} ${error ? styles.input_error : ""}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className={styles.input_group}>
                <label htmlFor="email" className={styles.label}>Email Address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={`${styles.input} ${error ? styles.input_error : ""}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className={styles.input_group}>
                <label htmlFor="password" className={styles.label}>Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className={`${styles.input} ${error ? styles.input_error : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <div className={styles.error_message}>Min. 6 characters</div>
              </div>

              <div className={styles.input_group}>
                <label htmlFor="confirm-password" className={styles.label}>Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className={`${styles.input} ${error ? styles.input_error : ""}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              {error && (
                <div className={styles.error_message}>{error}</div>
              )}

              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.button_spinner}></span>
                    Creating account...
                  </>
                ) : (
                  "Sign up"
                )}
              </button>

              <div className={styles.footer}>
                Already have an account? <Link href="/login">Sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}