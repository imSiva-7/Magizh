import Link from "next/link";
import styles from "@/css/unauthorized.module.css";

export default function Unauthorized() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>🚫</div>
        <h1 className={styles.title}>Access Denied</h1>
        <p className={styles.message}>
          You do not have permission to view this page.
          <br />
          Please contact your administrator if you believe this is an error.
        </p>
        {/* <Link href="/" className={styles.btn}>
          Go Home
        </Link> */}
      </div>
    </div>
  );
}