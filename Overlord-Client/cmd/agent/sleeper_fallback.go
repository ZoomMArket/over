package main

import "time"

func fallbackSleep(seconds int) {
	time.Sleep(time.Duration(seconds) * time.Second)
}
