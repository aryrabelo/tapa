import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createRegistry } from "@/lib/registry";
import { toast } from "@/lib/toast";
import { checkSilently, SILENT_CHECK_DELAY_MS, updaterModule } from "@/modules/updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockedCheck = vi.mocked(check);
const mockedRelaunch = vi.mocked(relaunch);

function runCheckCommand(): Promise<void> {
  const reg = createRegistry();
  reg.register(updaterModule);
  return reg.runCommand("app.checkForUpdates");
}

describe("updater command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads, installs, and relaunches when an update is available", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    // Partial stub — only the fields the command touches; cast to the full type.
    mockedCheck.mockResolvedValue({ version: "9.9.9", downloadAndInstall } as unknown as Update);

    await runCheckCommand();
    await vi.waitFor(() => expect(mockedRelaunch).toHaveBeenCalledTimes(1));

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Downloading update 9.9.9…");
    // Contract: relaunch only AFTER a resolved install.
    expect(downloadAndInstall.mock.invocationCallOrder[0]).toBeLessThan(
      mockedRelaunch.mock.invocationCallOrder[0],
    );
  });

  it("tells the user they are up to date when no update is available", async () => {
    mockedCheck.mockResolvedValue(null);

    await runCheckCommand();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tapa is up to date."));

    expect(mockedRelaunch).not.toHaveBeenCalled();
  });

  it("reports a check failure and does not relaunch (fail-closed)", async () => {
    mockedCheck.mockRejectedValue(new Error("network down"));

    await runCheckCommand();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't check for updates"),
      ),
    );

    expect(mockedRelaunch).not.toHaveBeenCalled();
  });

  it("reports a download/verification failure and does not relaunch (fail-closed)", async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error("signature mismatch"));
    mockedCheck.mockResolvedValue({ version: "9.9.9", downloadAndInstall } as unknown as Update);

    await runCheckCommand();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Update download/verification failed"),
      ),
    );

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(mockedRelaunch).not.toHaveBeenCalled();
  });
});

describe("silent launch check", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T = Date.UTC(2026, 9, 19);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once, a few seconds after the module activates", async () => {
    vi.useFakeTimers();
    mockedCheck.mockResolvedValue(null);
    const reg = createRegistry();
    reg.register(updaterModule);
    await reg.activate("updater");

    vi.advanceTimersByTime(SILENT_CHECK_DELAY_MS - 1);
    expect(mockedCheck).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mockedCheck).toHaveBeenCalledTimes(1);
  });

  it("never shows a toast when the check fails", async () => {
    mockedCheck.mockRejectedValue(new Error("offline"));
    await checkSilently(T);
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("stays quiet when Tapa is up to date", async () => {
    mockedCheck.mockResolvedValue(null);
    await checkSilently(T);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("checks at most once a day, failed checks included", async () => {
    mockedCheck.mockRejectedValue(new Error("offline"));
    await checkSilently(T);
    await checkSilently(T + DAY - 1);
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    await checkSilently(T + DAY);
    expect(mockedCheck).toHaveBeenCalledTimes(2);
  });

  it("checks again if the saved time is in the future (clock moved back)", async () => {
    mockedCheck.mockResolvedValue(null);
    await checkSilently(T);
    await checkSilently(T - 1000);
    expect(mockedCheck).toHaveBeenCalledTimes(2);
  });

  it("offers Update when one exists, and the button installs then relaunches", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    mockedCheck.mockResolvedValue({ version: "9.9.9", downloadAndInstall } as unknown as Update);

    await checkSilently(T);
    expect(downloadAndInstall).not.toHaveBeenCalled(); // nothing happens until asked
    const [message, opts] = vi.mocked(toast.success).mock.calls[0];
    expect(message).toBe("Tapa 9.9.9 is available.");
    expect(opts?.action?.label).toBe("Update");

    opts?.action?.onClick();
    await vi.waitFor(() => expect(mockedRelaunch).toHaveBeenCalledTimes(1));
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  });
});
