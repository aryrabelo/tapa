import type { PreviousVersion } from "@/lib/tauri";

/** What the earlier version is, in the words the panel and the review bar share. */
export const SOURCE_LABEL: Record<PreviousVersion["source"], string> = {
  git: "Since the last commit",
  saved: "Since you opened this note",
};
