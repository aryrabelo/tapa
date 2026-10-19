/** Debounced saver: `schedule` after each edit, `flush` before anything that leaves the note. */
export interface Autosave {
  schedule(): void;
  cancel(): void;
  /** Runs the save now (dropping the pending timer). Resolves false if the save failed. */
  flush(): Promise<boolean>;
}

export function createAutosave(save: () => Promise<boolean>, delayMs: number): Autosave {
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
    flush() {
      cancel();
      return save();
    },
  };
}
