import { AlertIcon } from "@/components/icons";
import styles from "./Stage.module.css";

interface ErrorNoticeProps {
  message: string;
  logs: string[];
}

export function ErrorNotice({ message, logs }: ErrorNoticeProps) {
  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorIcon} aria-hidden="true">
        <AlertIcon size={20} />
      </span>
      <div className={styles.errorBody}>
        <p className={styles.errorTitle}>{message}</p>
        {logs.length > 0 && (
          <details className={styles.details}>
            <summary>Technical details</summary>
            <pre>{logs.join("\n")}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
