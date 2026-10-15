import styles from "./PageHeading.module.css";

export default function PageHeading({ title, description, section = "WORKSPACE" }) {
  return (
    <div className={styles.heading}>
      <span className={styles.eyebrow}>{section}</span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
