import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createRegistry } from "@/lib/registry";
import { toast } from "@/lib/toast";
import { updaterModule } from "@/modules/updater";

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
    mockedCheck.mockResolvedValue({ version: "9.9.9", downloadAndInstall } as unknown as Awaited<
      ReturnType<typeof check>
    >);

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
    mockedCheck.mockResolvedValue({ version: "9.9.9", downloadAndInstall } as unknown as Awaited<
      ReturnType<typeof check>
    >);

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
