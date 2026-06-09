//go:build windows
// +build windows

package main

import (
	"syscall"
	"unsafe"
)

func sleepObfuscated(seconds int) {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if seconds <= 0 {
		return
	}

	k32, err := syscall.LoadDLL("kernel32.dll")
	if err != nil {
		fallbackSleep(seconds)
		return
	}

	createTimer, err := k32.FindProc("CreateWaitableTimerW")
	if err != nil {
		fallbackSleep(seconds)
		return
	}

	setTimer, err := k32.FindProc("SetWaitableTimer")
	if err != nil {
		fallbackSleep(seconds)
		return
	}

	waitObj, err := k32.FindProc("WaitForSingleObject")
	if err != nil {
		fallbackSleep(seconds)
		return
	}

	closeHandle, _ := k32.FindProc("CloseHandle")

	// CreateWaitableTimerW(nil, TRUE, nil) — manual-reset, unnamed
	hTimer, _, _ := createTimer.Call(0, 1, 0)
	if hTimer == 0 {
		fallbackSleep(seconds)
		return
	}

	// Due time in 100-nanosecond intervals, negative = relative
	dueTime := -int64(seconds) * 10_000_000
	// SetWaitableTimer(hTimer, &dueTime, 0, nil, nil, FALSE)
	r, _, _ := setTimer.Call(
		hTimer,
		uintptr(unsafe.Pointer(&dueTime)),
		0, 0, 0, 0,
	)
	if r == 0 {
		if closeHandle != nil {
			closeHandle.Call(hTimer)
		}
		fallbackSleep(seconds)
		return
	}

	// WaitForSingleObject(hTimer, INFINITE)
	waitObj.Call(hTimer, 0xFFFFFFFF)

	if closeHandle != nil {
		closeHandle.Call(hTimer)
	}
}
