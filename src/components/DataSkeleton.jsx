import styles from "./DataSkeleton.module.css";

export default function DataSkeleton({ label = "Loading records…", compact = false }) {
  return (
    <div className={styles.loading} role="status" aria-label={label} aria-busy="true">
      <span className={styles.srOnly}>{label}</span>
      <div aria-hidden="true">
        {!compact && (
          <div className={styles.cards}>
            {[0, 1, 2].map((item) => (
              <div className={styles.card} key={item}>
                <span className={styles.line} />
                <span className={`${styles.line} ${styles.value}`} />
                <span className={styles.line} />
              </div>
            ))}
          </div>
        )}
        <div className={styles.rows}>
          {[0, 1, 2, 3, 4].map((row) => (
            <div className={styles.row} key={row}>
              {[0, 1, 2].map((cell) => <span className={styles.line} key={cell} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
