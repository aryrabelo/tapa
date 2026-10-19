/** Debounced saver: `schedule` after each edit, `flush` before anything that leaves the note. */
export interface Autosave {
  schedule(): void;
  cancel(): void;
  /**
   * Saves now (dropping the pending timer) and again until the note is clean,
   * so edits typed during a write are saved too. Resolves false if a save failed.
   */
  flush(): Promise<boolean>;
}

export function createAutosave(
  save: () => Promise<boolean>,
  isDirty: () => boolean,
  delayMs: number,
): Autosave {
  let timer: number | undefined;
  const cancel = () => {
    window.clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule() {
      cancel();
      timer = window.setTimeout(() => {
        timer = undefined;
        void save();
      }, delayMs);
    },
    cancel,
    async flush() {
      do {
        cancel();
        if (!(await save())) return false;
      } while (isDirty());
      return true;
    },
  };
}
