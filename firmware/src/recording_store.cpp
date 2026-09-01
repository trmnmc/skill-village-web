#include <M5Unified.h>
#include "recording_store.h"

static uint8_t* s_wavBuf = nullptr;
static size_t s_wavSize = 0;
static bool s_wavReady = false;

void clearLastRecording() {
    if (s_wavBuf) {
        // Zero before free: mic audio never lingers in RAM (privacy rule).
        memset(s_wavBuf, 0, s_wavSize);
        free(s_wavBuf);
    }
    s_wavBuf = nullptr;
    s_wavSize = 0;
    s_wavReady = false;
}

bool storeLastRecording(const uint8_t* wav, size_t size) {
    clearLastRecording();

    s_wavBuf = (uint8_t*)ps_malloc(size);
    if (!s_wavBuf) {
        Serial.println("[REC] WAV buffer alloc failed");
        return false;
    }
    memcpy(s_wavBuf, wav, size);
    s_wavSize = size;
    s_wavReady = true;
    Serial.printf("[REC] Stored recording: %u bytes\n", (unsigned)size);
    return true;
}

bool hasLastRecording() {
    return s_wavReady && s_wavBuf != nullptr && s_wavSize > 0;
}

RecordingSnapshot getLastRecording() {
    RecordingSnapshot snapshot;
    if (hasLastRecording()) {
        snapshot.data = s_wavBuf;
        snapshot.size = s_wavSize;
    }
    return snapshot;
}

void markLastRecordingConsumed() {
    // The PC has the bytes now; the copy here is zeroed and freed rather
    // than parked until the next utterance overwrites it.
    clearLastRecording();
}
