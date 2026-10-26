"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, TerminalIcon } from "@/components/icons";
import { copyText } from "@/lib/clipboard";
import { shellQuote, toShellCommand } from "@/lib/ffmpeg-args";
import styles from "./Drawer.module.css";

interface CommandBlockProps {
  args: readonly string[];
  inputName: string;
  outputName: string;
}

type Kind = "cmd" | "flag" | "value" | "file";

/** Group "-flag value" pairs so lines break between options, not inside them. */
function tokenize(args: readonly string[], inputName: string, outputName: string) {
  const groups: { text: string; kind: Kind }[][] = [[{ text: "ffmpeg", kind: "cmd" }]];
  const files = new Set([inputName, outputName, `./${inputName}`, `./${outputName}`]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const isFlag = /^-[A-Za-z]/.test(a) && !files.has(a);
    if (isFlag) {
      const group: { text: string; kind: Kind }[] = [{ text: a, kind: "flag" }];
      const next = args[i + 1];
      if (next !== undefined && !/^-[A-Za-z]/.test(next) && i + 1 !== args.length - 1) {
        group.push({ text: shellQuote(next), kind: files.has(next) ? "file" : "value" });
        i++;
      }
      groups.push(group);
    } else {
      groups.push([{ text: shellQuote(a), kind: files.has(a) ? "file" : "value" }]);
    }
  }
  return groups;
}

export function CommandBlock({ args, inputName, outputName }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const command = toShellCommand(args);
  const groups = tokenize(args, inputName, outputName);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const ok = await copyText(command);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.command} aria-labelledby="run-yourself">
      <div className={styles.commandHead}>
        <h3 id="run-yourself" className={styles.commandTitle}>
          <TerminalIcon size={18} />
          Run this yourself
        </h3>
        <button type="button" className={`btn ${styles.copyBtn}`} data-copied={copied || undefined} onClick={copy}>
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          <span aria-live="polite">{copied ? "Copied ✓" : "Copy"}</span>
        </button>
      </div>
      <pre className={styles.code} onClick={copy} title="Click to copy" data-testid="ffmpeg-command">
        <code>
          {groups.map((g, i) => (
            <Fragment key={i}>
              <span className={styles.group} data-long={g.some((t) => t.text.length > 36) || undefined}>
                {g.map((t, j) => (
                  <span key={j} className={styles[`tok_${t.kind}`]}>
                    {j > 0 ? " " : ""}
                    {t.text}
                  </span>
                ))}
              </span>
              {i < groups.length - 1 ? " " : ""}
            </Fragment>
          ))}
        </code>
      </pre>
    </section>
  );
}
