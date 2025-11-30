import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>

      
        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="/productions"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Productions
          </a>
      
        </div>
      </main>
    </div>
  );
}
