//go:build windows
// +build windows

package winapi

import (
	"sync"
	"syscall"
)

var (
	dllCache  = map[string]*syscall.DLL{}
	procCache = map[string]*syscall.Proc{}
	mu        sync.Mutex
)

func GetDLL(name string) (*syscall.DLL, error) {
	mu.Lock()
	defer mu.Unlock()
	if dll, ok := dllCache[name]; ok {
		return dll, nil
	}
	dll, err := syscall.LoadDLL(name)
	if err != nil {
		return nil, err
	}
	dllCache[name] = dll
	return dll, nil
}

func GetProc(dllName, procName string) (*syscall.Proc, error) {
	key := dllName + "!" + procName
	mu.Lock()
	if proc, ok := procCache[key]; ok {
		mu.Unlock()
		return proc, nil
	}
	mu.Unlock()

	dll, err := GetDLL(dllName)
	if err != nil {
		return nil, err
	}
	proc, err := dll.FindProc(procName)
	if err != nil {
		return nil, err
	}

	mu.Lock()
	procCache[key] = proc
	mu.Unlock()
	return proc, nil
}

func MustProc(dllName, procName string) *syscall.Proc {
	proc, err := GetProc(dllName, procName)
	if err != nil {
		panic("winapi: " + dllName + "!" + procName + ": " + err.Error())
	}
	return proc
}

func Call(dllName, procName string, args ...uintptr) (uintptr, uintptr, error) {
	proc, err := GetProc(dllName, procName)
	if err != nil {
		return 0, 0, err
	}
	return proc.Call(args...)
}
