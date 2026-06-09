//go:build linux
// +build linux

package persistence

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func withLinuxTempHome(t *testing.T) string {
	t.Helper()

	home := t.TempDir()
	origHome := currentUserHomeDir
	origStartupName := DefaultStartupName
	currentUserHomeDir = func() (string, error) { return home, nil }
	DefaultStartupName = ""

	t.Cleanup(func() {
		currentUserHomeDir = origHome
		DefaultStartupName = origStartupName
	})

	return home
}

func writeLinuxSourceExecutable(t *testing.T) string {
	t.Helper()

	src := filepath.Join(t.TempDir(), "source-agent")
	if err := os.WriteFile(src, []byte("agent-bytes"), 0644); err != nil {
		t.Fatalf("write source executable: %v", err)
	}
	return src
}

func TestLinuxInstallCreatesSystemdServiceAndExecutable(t *testing.T) {
	home := withLinuxTempHome(t)
	src := writeLinuxSourceExecutable(t)

	if err := InstallFrom(src); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, ".local", "share", "overlord", "agent")
	gotBytes, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read installed executable: %v", err)
	}
	if string(gotBytes) != "agent-bytes" {
		t.Fatalf("installed executable content mismatch: %q", string(gotBytes))
	}
	if info, err := os.Stat(target); err != nil {
		t.Fatalf("stat installed executable: %v", err)
	} else if info.Mode().Perm() != 0755 {
		t.Fatalf("installed executable mode = %o, want 0755", info.Mode().Perm())
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read systemd service: %v", err)
	}
	service := string(serviceBytes)
	for _, want := range []string{
		"Description=Overlord Agent",
		"ExecStart=" + target,
		"Restart=always",
		"WantedBy=default.target",
	} {
		if !strings.Contains(service, want) {
			t.Fatalf("systemd service missing %q:\n%s", want, service)
		}
	}

	autostartPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	if _, err := os.Stat(autostartPath); !os.IsNotExist(err) {
		t.Fatalf("default install should prefer systemd and not write desktop entry, stat err=%v", err)
	}
}

func TestLinuxConfigureCreatesSystemdServiceForExistingPath(t *testing.T) {
	home := withLinuxTempHome(t)
	exePath := filepath.Join(home, "bin", "existing-agent")

	if err := Configure(exePath); err != nil {
		t.Fatalf("Configure() error: %v", err)
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read systemd service: %v", err)
	}
	if service := string(serviceBytes); !strings.Contains(service, "ExecStart="+exePath) {
		t.Fatalf("systemd service missing executable path %q:\n%s", exePath, service)
	}
}

func TestLinuxInstallAutostartCreatesDesktopEntry(t *testing.T) {
	home := withLinuxTempHome(t)
	exePath := filepath.Join(home, "bin", "existing-agent")

	if err := installAutostart(exePath); err != nil {
		t.Fatalf("installAutostart() error: %v", err)
	}

	desktopPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	desktopBytes, err := os.ReadFile(desktopPath)
	if err != nil {
		t.Fatalf("read desktop entry: %v", err)
	}
	desktop := string(desktopBytes)
	for _, want := range []string{
		"[Desktop Entry]",
		"Type=Application",
		"Exec=" + exePath,
		"X-GNOME-Autostart-enabled=true",
	} {
		if !strings.Contains(desktop, want) {
			t.Fatalf("desktop entry missing %q:\n%s", want, desktop)
		}
	}
}

func TestLinuxCustomStartupNameChangesServiceAndBinaryNames(t *testing.T) {
	home := withLinuxTempHome(t)
	DefaultStartupName = "updater"

	if err := InstallFrom(writeLinuxSourceExecutable(t)); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, ".local", "share", "overlord", "updater")
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("stat custom executable: %v", err)
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "updater.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read custom systemd service: %v", err)
	}
	if service := string(serviceBytes); !strings.Contains(service, "ExecStart="+target) {
		t.Fatalf("custom systemd service missing target %q:\n%s", target, service)
	}
}

func TestLinuxUninstallRemovesStartupFilesAndExecutable(t *testing.T) {
	home := withLinuxTempHome(t)

	target := filepath.Join(home, ".local", "share", "overlord", "agent")
	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	desktopPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	for _, path := range []string{target, servicePath, desktopPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
		}
		if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	if err := Remove(); err != nil {
		t.Fatalf("Remove() error: %v", err)
	}
	for _, path := range []string{target, servicePath, desktopPath} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected %q to be removed, stat err=%v", path, err)
		}
	}
}

func TestLinuxReplaceExecutablePreservesExecutableModeWhenTargetExists(t *testing.T) {
	_ = withLinuxTempHome(t)
	src := writeLinuxSourceExecutable(t)
	target := filepath.Join(t.TempDir(), "agent")

	if err := os.WriteFile(target, []byte("old"), 0644); err != nil {
		t.Fatalf("write existing target: %v", err)
	}
	if err := replaceExecutable(src, target); err != nil {
		t.Fatalf("replaceExecutable() error: %v", err)
	}
	if info, err := os.Stat(target); err != nil {
		t.Fatalf("stat replaced executable: %v", err)
	} else if info.Mode().Perm() != 0755 {
		t.Fatalf("replaced executable mode = %o, want 0755", info.Mode().Perm())
	}
}
