//go:build !windows
// +build !windows

package evasion

func UnhookNtdll() error { return nil }

func PatchETW() error { return nil }

func PatchAMSI() error { return nil }
