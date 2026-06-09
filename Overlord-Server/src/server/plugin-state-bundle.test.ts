import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadPluginBundle } from "./plugin-state-bundle";

let tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "overlord-plugin-bundle-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

describe("loadPluginBundle", () => {
  test("matches plugin binaries when clients report a pretty Windows OS name", async () => {
    const root = await createTempRoot();
    const pluginDir = join(root, "sample-c");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "manifest.json"),
      JSON.stringify({
        id: "sample-c",
        name: "sample-c",
        binaries: { "windows-amd64": "sample-c-windows-amd64.dll" },
      }),
    );
    await writeFile(join(pluginDir, "sample-c-windows-amd64.dll"), "test-binary");

    const bundle = await loadPluginBundle(root, "sample-c", async () => {}, "Windows 11 Pro 24H2", "amd64");

    expect(bundle.binaryPath).toBe(join(pluginDir, "sample-c-windows-amd64.dll"));
    expect(bundle.size).toBe("test-binary".length);
  });
});
