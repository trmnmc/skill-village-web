#pragma once
#include <stdint.h>

bool initMicrophone();
void updateMicrophone();
const char* getMicStateName();

// The ear opens only on explicit intent (a tap, or an authenticated PC
// call) and closes itself after every stored utterance. Boot state: closed.
void armMicrophone(bool on);
bool microphoneArmed();
