/** Persisted user preferences. */
import { DEFAULT_FORMAT, isFormatId, type FormatId } from "./formats";
import { createPersistentStore } from "./persistent-store";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./settings";

export const settingsStore = createPersistentStore("ffmpeg-dd:settings:v1", DEFAULT_SETTINGS, sanitizeSettings);

export const drawerOpenStore = createPersistentStore("ffmpeg-dd:advanced-open", false, (v) => v === true);

export const formatStore = createPersistentStore<FormatId>("ffmpeg-dd:format", DEFAULT_FORMAT, (v) =>
  isFormatId(v) ? v : DEFAULT_FORMAT,
);
