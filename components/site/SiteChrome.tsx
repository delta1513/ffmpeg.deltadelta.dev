import Link from "next/link";
import { ShieldIcon } from "@/components/icons";
import styles from "./SiteChrome.module.css";

export function SiteHeader() {
  return (
    <header className={`container ${styles.header}`}>
      <Link href="/" className={styles.wordmark} aria-label="ffmpeg.deltadelta.dev home">
        <span className={styles.mark} aria-hidden="true">
          <span />
        </span>
        <span>
          ffmpeg<span className={styles.domain}>.deltadelta.dev</span>
        </span>
      </Link>
      <span className={styles.pill}>
        <ShieldIcon size={15} />
        100% in your browser
      </span>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={`container ${styles.footer}`}>
      <p>
        Powered by <a href="https://ffmpeg.org/">FFmpeg</a> compiled to WebAssembly. Nothing is uploaded.
      </p>
    </footer>
  );
}
