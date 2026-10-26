import type { FormatDef } from "@/lib/formats";
import type { ControlAvailability, Settings, SourceMeta } from "@/lib/settings";

export interface ControlProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  format: FormatDef;
  meta: SourceMeta;
  availability: ControlAvailability;
}
