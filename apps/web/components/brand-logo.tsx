import Image from "next/image";
import styles from "./brand-logo.module.css";

export default function BrandLogo({ className = "", width }: { className?: string; width?: number }) {
  return <span className={`${styles.frame} ${className}`} style={width ? { width } : undefined} aria-hidden="true">
    <Image className={styles.art} src="/images/sap-brand.png" alt="" width={1774} height={887} priority />
  </span>;
}
