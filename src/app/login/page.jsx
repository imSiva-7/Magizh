"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import styles from "@/css/login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      // Force a hard navigation to ensure session is loaded
      window.location.href = "/";
    }
  };

  return (
    <div className={styles.container}>
      <section className={styles.welcome} aria-labelledby="login-intro">
        <span className={styles.eyebrow}>MAGIZH DAIRY WORKSPACE</span>
        <h2 id="login-intro">Good days start<br />with a clear overview.</h2>
        <p>Your daily production, supplier records, and customer payments. Connected in one workspace.</p>
        <div className={styles.workflow} aria-label="Dairy workflow">
          <span><b>01</b> Procure fresh milk</span>
          <span><b>02</b> Track daily production</span>
          <span><b>03</b> Keep payments in order</span>
        </div>
        <Link href="/" className={styles.exploreLink}>Explore the workspace <span aria-hidden="true">↗</span></Link>
      </section>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Welcome Back!</h1>
          <p>Sign in to your Magizh Dairy account.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.input_group}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="example@magizhdairy.com"
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
              autoComplete="current-password"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              placeholder="Enter password"
              className={`${styles.input} ${error ? styles.input_error : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            {error && <div id="login-error" role="alert" className={styles.error_message}>{error}</div>}
          </div>

          <button data-button="primary" type="submit" className={styles.btn} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.button_spinner}></span>
                Logging in...
              </>
            ) : (
              "Log In"
            )}
          </button>

          {/* <div className={styles.footer}>
            {"Don't have an account?"} <Link href="/register">Create one</Link>
          </div> */}
        </form>
      </div>
    </div>
  );
}
