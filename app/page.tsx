import { Converter } from "@/components/converter/Converter";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className={`container ${styles.hero}`} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.title}>
            Convert any video.
            <span className={styles.titleAccent}>Right in your browser.</span>
          </h1>
          <p className={styles.subline}>Private by design — your files never leave this device.</p>
        </section>
        <Converter />
      </main>
      <SiteFooter />
    </>
  );
}
