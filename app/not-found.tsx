import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found — ffmpeg.deltadelta.dev",
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.wrap}`}>
        <div className={styles.card}>
          <p className={styles.code} aria-hidden="true">
            404
          </p>
          <h1 className={styles.title}>This reel is missing.</h1>
          <p className={styles.text}>The page you’re looking for doesn’t exist or has moved.</p>
          <Link href="/" className="btn btn-primary btn-lg">
            Back to the converter
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
