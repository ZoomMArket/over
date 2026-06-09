//go:build windows
// +build windows

package evasion

import (
	"syscall"
	"unsafe"
)

const (
	pageExecuteReadWrite = 0x40
	pageExecuteRead      = 0x20
)

var (
	procVirtualProtect *syscall.Proc
)

func virtualProtect(addr, size uintptr, newProtect uint32, oldProtect *uint32) error {
	if procVirtualProtect == nil {
		k32, err := syscall.LoadDLL("kernel32.dll")
		if err != nil {
			return err
		}
		procVirtualProtect, err = k32.FindProc("VirtualProtect")
		if err != nil {
			return err
		}
	}
	r1, _, e1 := procVirtualProtect.Call(addr, size, uintptr(newProtect), uintptr(unsafe.Pointer(oldProtect)))
	if r1 == 0 {
		return e1
	}
	return nil
}
