#include <M5Unified.h>
#include <math.h>
#include <queue>
#include "playback_service.h"
#include "config_loader.h"
#include "face_service.h"
#include "audio_gate.h"
#include "pcm_stream_service.h"

struct PlaybackRuntimeState {
    size_t lipSyncOffset = 0;
    unsigned long lastLipMs = 0;
    size_t pcmOffset = 0;
    size_t pcmSize = 0;
    uint32_t sampleRate = 24000;
    uint16_t bytesPerFrame = 2;
    bool currentIsPcm = false;
    String pcmSessionId = "";
    bool pcmFinalSegment = false;
};

static PlaybackRuntimeState s_playbackState;
static bool s_isPlaying = false;
static uint8_t* s_currentAudioData = nullptr;
static size_t s_currentAudioSize = 0;
static unsigned long s_playbackDeadlineMs = 0;
static unsigned long s_playbackStartMs = 0;
static bool s_micResumeRequested = false;

#define LIPSYNC_INTERVAL_MS   50
#define LIPSYNC_CHUNK_SAMPLES 1024
#define PCM_SAMPLE_RATE       24000
#define PCM_BYTES_PER_SAMPLE  2
#define MAX_PCM_BYTES         (2 * 1024 * 1024)
#define MAX_QUEUED_PCM_BYTES  (2 * 1024 * 1024)
#define SPEAKER_PLAYBACK_CHANNEL 0

// The download engine is gone by design: the device never fetches a URL.
// Playback arrives only as pushed PCM (HTTP chunks, TCP stream, or UDP).

struct PcmBuffer {
    uint8_t* data;
    size_t size;
    String sessionId;
    bool finalSegment;
};

static std::queue<PcmBuffer> s_pcmQueue;
static size_t s_pcmQueuedBytes = 0;
static unsigned long s_lastSpeakerEndMs = 0;
static uint8_t* s_stagedPcmData = nullptr;
static size_t s_stagedPcmSize = 0;
static size_t s_stagedPcmCapacity = 0;
static String s_stagedPcmSessionId = "";
static long s_stagedPcmNextSeq = 0;

static void processAudioQueue();
static void clearStagedPcmPlayback();

static bool hasPendingPlaybackWork() {
    return !s_pcmQueue.empty() || isPcmStreamActive();
}

void clearQueuedPcmPlayback() {
    while (!s_pcmQueue.empty()) {
        PcmBuffer dropped = s_pcmQueue.front();
        s_pcmQueue.pop();
        free(dropped.data);
    }
    s_pcmQueuedBytes = 0;
    clearStagedPcmPlayback();
    Serial.println("[PCM] Queue cleared");
}

static void clearStagedPcmPlayback() {
    if (s_stagedPcmData) {
        free(s_stagedPcmData);
    }
    s_stagedPcmData = nullptr;
    s_stagedPcmSize = 0;
    s_stagedPcmCapacity = 0;
    s_stagedPcmSessionId = "";
    s_stagedPcmNextSeq = 0;
}

static bool reserveStagedPcm(size_t requiredSize) {
    if (requiredSize <= s_stagedPcmCapacity) {
        return true;
    }

    size_t newCapacity = s_stagedPcmCapacity ? s_stagedPcmCapacity : (128 * 1024);
    while (newCapacity < requiredSize) {
        if (newCapacity > MAX_PCM_BYTES / 2) {
            newCapacity = MAX_PCM_BYTES;
            break;
        }
        newCapacity *= 2;
    }
    if (newCapacity < requiredSize || newCapacity > MAX_PCM_BYTES) {
        return false;
    }

    uint8_t* newData = (uint8_t*)ps_malloc(newCapacity);
    if (!newData) {
        return false;
    }
    if (s_stagedPcmData && s_stagedPcmSize > 0) {
        memcpy(newData, s_stagedPcmData, s_stagedPcmSize);
    }
    if (s_stagedPcmData) {
        free(s_stagedPcmData);
    }
    s_stagedPcmData = newData;
    s_stagedPcmCapacity = newCapacity;
    return true;
}

static bool enqueuePcmBuffer(uint8_t* pcmData, size_t pcmSize, const String& sessionId, bool finalSegment) {
    if (pcmSize > MAX_QUEUED_PCM_BYTES - s_pcmQueuedBytes) {
        Serial.println("[PCM] Queue full");
        return false;
    }
    s_pcmQueue.push({pcmData, pcmSize, sessionId, finalSegment});
    s_pcmQueuedBytes += pcmSize;
    Serial.printf("[PCM] Queued segment: session=%s bytes=%u queued=%u final=%s\n",
                  sessionId.c_str(), (unsigned)pcmSize,
                  (unsigned)s_pcmQueuedBytes, finalSegment ? "true" : "false");
    return true;
}

static void releaseCurrentPlaybackBuffer() {
    if (!s_currentAudioData) {
        return;
    }
    Serial.printf("[PLAY] Releasing playback buffer: bytes=%u speakerPlaying=%s\n",
                  (unsigned)s_currentAudioSize,
                  M5.Speaker.isPlaying() ? "true" : "false");
    free(s_currentAudioData);
    s_currentAudioData = nullptr;
    s_currentAudioSize = 0;
}

static bool prepareSpeakerPlayback() {
    if (M5.Mic.isRunning()) {
        M5.Mic.end();
        vTaskDelay(pdMS_TO_TICKS(200));
    }
    if (s_lastSpeakerEndMs != 0) {
        unsigned long elapsed = millis() - s_lastSpeakerEndMs;
        if (elapsed < 100) {
            vTaskDelay(pdMS_TO_TICKS(100 - elapsed));
        }
    }
    if (!M5.Speaker.isRunning()) {
        if (!M5.Speaker.begin()) {
            Serial.println("[PLAY] Speaker.begin failed");
            return false;
        }
    }
    M5.Speaker.setVolume(SPEAKER_VOLUME);
    return M5.Speaker.isRunning();
}

static bool endSpeakerPlayback() {
    if (audioGateEnter("speaker-end", 500)) {
        if (M5.Speaker.isRunning()) {
            M5.Speaker.end();
            s_lastSpeakerEndMs = millis();
            vTaskDelay(pdMS_TO_TICKS(50));
        }
        audioGateLeave("speaker-end");
        return true;
    } else {
        Serial.println("[PLAY] Audio gate busy; skipped speaker end");
        return false;
    }
}

// ════════════════════════════════════════
//  初期化（setup()から呼ぶ）
// ════════════════════════════════════════
void initPlayback() {
    logAudioMemory("play-init");
}

PcmPlaybackResult startPcmPlayback(uint8_t* pcmData, size_t pcmSize, const String& sessionId, bool finalSegment) {
    if (!pcmData || pcmSize == 0) {
        Serial.println("[PCM] Empty body");
        return PCM_PLAYBACK_INVALID;
    }
    if (sessionId.length() == 0) {
        Serial.println("[PCM] Missing session id");
        return PCM_PLAYBACK_INVALID;
    }
    if ((pcmSize % PCM_BYTES_PER_SAMPLE) != 0 || pcmSize > MAX_PCM_BYTES) {
        Serial.printf("[PCM] Invalid size: %u\n", (unsigned)pcmSize);
        return PCM_PLAYBACK_INVALID;
    }
    if (s_isPlaying || isPcmStreamActive() || M5.Speaker.isPlaying()) {
        if (s_playbackState.currentIsPcm && sessionId == s_playbackState.pcmSessionId &&
            enqueuePcmBuffer(pcmData, pcmSize, sessionId, finalSegment)) {
            return PCM_PLAYBACK_QUEUED;
        }
        Serial.printf("[PCM] Busy; refusing segment session=%s current=%s\n",
                      sessionId.c_str(), s_playbackState.pcmSessionId.c_str());
        return PCM_PLAYBACK_BUSY;
    }

    if (!s_pcmQueue.empty()) {
        clearQueuedPcmPlayback();
    }

    releaseCurrentPlaybackBuffer();

    s_currentAudioData = pcmData;
    s_currentAudioSize = pcmSize;
    s_playbackState.pcmOffset = 0;
    s_playbackState.pcmSize = pcmSize;
    s_playbackState.sampleRate = PCM_SAMPLE_RATE;
    s_playbackState.bytesPerFrame = PCM_BYTES_PER_SAMPLE;

    const float bytes_per_sec = (float)PCM_SAMPLE_RATE * (float)PCM_BYTES_PER_SAMPLE;
    s_playbackDeadlineMs = millis() +
        (unsigned long)((pcmSize / bytes_per_sec) * 1000.0f) + 2000;

    if (!audioGateEnter("pcm-play", 1000)) {
        Serial.println("[PCM] Audio gate busy; dropped PCM playback");
        free(s_currentAudioData);
        s_currentAudioData = nullptr;
        s_currentAudioSize = 0;
        s_playbackState.pcmSize = 0;
        setFaceExpression(FACE_IDLE);
        s_micResumeRequested = true;
        return PCM_PLAYBACK_SPEAKER_FAILED;
    }

    if (!prepareSpeakerPlayback()) {
        Serial.println("[PCM] Speaker prepare failed");
        free(s_currentAudioData);
        s_currentAudioData = nullptr;
        s_currentAudioSize = 0;
        s_playbackState.pcmSize = 0;
        setFaceExpression(FACE_IDLE);
        s_micResumeRequested = true;
        audioGateLeave("pcm-play");
        return PCM_PLAYBACK_SPEAKER_FAILED;
    }
    bool ok = M5.Speaker.playRaw((const int16_t*)s_currentAudioData,
                                 s_currentAudioSize / sizeof(int16_t),
                                 PCM_SAMPLE_RATE,
                                 false,
                                 1,
                                 SPEAKER_PLAYBACK_CHANNEL,
                                 true);
    if (!ok) {
        Serial.println("[PCM] Speaker rejected playRaw");
        free(s_currentAudioData);
        s_currentAudioData = nullptr;
        s_currentAudioSize = 0;
        s_playbackState.pcmSize = 0;
        setFaceExpression(FACE_IDLE);
        s_micResumeRequested = true;
        audioGateLeave("pcm-play");
        return PCM_PLAYBACK_SPEAKER_FAILED;
    }

    setFaceExpression(FACE_PLAYING);
    s_playbackState.lipSyncOffset = 0;
    s_playbackState.lastLipMs = 0;
    s_isPlaying = true;
    s_playbackState.currentIsPcm = true;
    s_playbackState.pcmSessionId = sessionId;
    s_playbackState.pcmFinalSegment = finalSegment;
    s_playbackStartMs = millis();
    Serial.printf("[PCM] Speaker started: session=%s bytes=%u final=%s queue=%u @ 24kHz mono s16le\n",
                  sessionId.c_str(), (unsigned)pcmSize,
                  finalSegment ? "true" : "false", (unsigned)s_pcmQueuedBytes);
    logAudioMemory("pcm-start");
    audioGateLeave("pcm-play");
    return PCM_PLAYBACK_OK;
}

PcmPlaybackResult stagePcmPlayback(uint8_t* pcmData, size_t pcmSize, const String& sessionId, long seq, bool finalSegment) {
    if (!pcmData || pcmSize == 0) {
        Serial.println("[PCM] Empty staged segment");
        return PCM_PLAYBACK_INVALID;
    }
    if (sessionId.length() == 0 || seq < 0) {
        Serial.println("[PCM] Invalid staged metadata");
        return PCM_PLAYBACK_INVALID;
    }
    if ((pcmSize % PCM_BYTES_PER_SAMPLE) != 0 || pcmSize > MAX_PCM_BYTES) {
        Serial.printf("[PCM] Invalid staged size: %u\n", (unsigned)pcmSize);
        return PCM_PLAYBACK_INVALID;
    }
    if (s_isPlaying || isPcmStreamActive() || M5.Speaker.isPlaying() || !s_pcmQueue.empty()) {
        Serial.printf("[PCM] Busy; refusing staged segment session=%s\n", sessionId.c_str());
        return PCM_PLAYBACK_BUSY;
    }

    const bool newSession = sessionId != s_stagedPcmSessionId;
    if (newSession) {
        if (seq != 0) {
            Serial.printf("[PCM] Staged seq mismatch for new session: got=%ld expected=0\n", seq);
            return PCM_PLAYBACK_SESSION_MISMATCH;
        }
        clearStagedPcmPlayback();
        s_stagedPcmSessionId = sessionId;
    } else if (seq != s_stagedPcmNextSeq) {
        Serial.printf("[PCM] Staged seq mismatch: session=%s got=%ld expected=%ld\n",
                      sessionId.c_str(), seq, s_stagedPcmNextSeq);
        return PCM_PLAYBACK_SESSION_MISMATCH;
    }

    if (pcmSize > MAX_PCM_BYTES - s_stagedPcmSize) {
        Serial.printf("[PCM] Staged payload too large: current=%u segment=%u\n",
                      (unsigned)s_stagedPcmSize, (unsigned)pcmSize);
        clearStagedPcmPlayback();
        return PCM_PLAYBACK_INVALID;
    }
    const size_t newSize = s_stagedPcmSize + pcmSize;
    if (!reserveStagedPcm(newSize)) {
        Serial.printf("[PCM] Staged alloc failed: required=%u\n", (unsigned)newSize);
        clearStagedPcmPlayback();
        free(pcmData);
        return PCM_PLAYBACK_SPEAKER_FAILED;
    }

    memcpy(s_stagedPcmData + s_stagedPcmSize, pcmData, pcmSize);
    s_stagedPcmSize = newSize;
    s_stagedPcmNextSeq = seq + 1;
    free(pcmData);

    Serial.printf("[PCM] Staged segment: session=%s seq=%ld bytes=%u total=%u final=%s\n",
                  sessionId.c_str(), seq, (unsigned)pcmSize, (unsigned)s_stagedPcmSize,
                  finalSegment ? "true" : "false");

    if (!finalSegment) {
        return PCM_PLAYBACK_QUEUED;
    }

    uint8_t* stagedData = s_stagedPcmData;
    size_t stagedSize = s_stagedPcmSize;
    String stagedSession = s_stagedPcmSessionId;
    s_stagedPcmData = nullptr;
    s_stagedPcmSize = 0;
    s_stagedPcmCapacity = 0;
    s_stagedPcmSessionId = "";
    s_stagedPcmNextSeq = 0;

    return startPcmPlayback(stagedData, stagedSize, stagedSession, true);
}

// ════════════════════════════════════════
//  口パク更新（loop()から毎回呼ぶ）
// ════════════════════════════════════════
static void updateLipSync() {
    if (!s_isPlaying || s_currentAudioData == nullptr || s_currentAudioSize == 0) return;

    unsigned long now = millis();
    if (now - s_playbackState.lastLipMs < LIPSYNC_INTERVAL_MS) return;
    s_playbackState.lastLipMs = now;

    if (s_playbackState.lipSyncOffset < s_playbackState.pcmOffset) s_playbackState.lipSyncOffset = s_playbackState.pcmOffset;
    if (s_playbackState.lipSyncOffset >= s_playbackState.pcmOffset + s_playbackState.pcmSize) {
        setMouthOpen(0.0f);
        return;
    }

    int16_t* pcm = (int16_t*)(s_currentAudioData + s_playbackState.lipSyncOffset);
    size_t remainBytes = s_playbackState.pcmOffset + s_playbackState.pcmSize - s_playbackState.lipSyncOffset;
    size_t samples = min((size_t)LIPSYNC_CHUNK_SAMPLES, remainBytes / sizeof(int16_t));
    if (samples == 0) {
        setMouthOpen(0.0f);
        return;
    }

    float sum = 0.0f;
    for (size_t i = 0; i < samples; i++) {
        float v = (float)pcm[i] / 32768.0f;
        sum += v * v;
    }
    setMouthOpen(constrain(sqrtf(sum / samples) * 8.0f, 0.0f, 1.0f));
    s_playbackState.lipSyncOffset += samples * sizeof(int16_t);
}

PlaybackStatus getPlaybackStatus() {
    PlaybackStatus status;
    status.playing = s_isPlaying;
    status.pcm = s_playbackState.currentIsPcm;
    status.pcmFinalSegment = s_playbackState.pcmFinalSegment;
    status.pcmSession = s_playbackState.pcmSessionId.c_str();
    status.currentBytes = s_currentAudioSize;
    status.queuedPcmBytes = s_pcmQueuedBytes;
    status.queuedPcmSegments = s_pcmQueue.size();
    status.micResumeRequested = s_micResumeRequested;
    status.startedMs = s_playbackStartMs;
    status.deadlineMs = s_playbackDeadlineMs;
    return status;
}

// ════════════════════════════════════════
//  再生完了後の次キュー処理
// ════════════════════════════════════════
static void processAudioQueue() {
    if (s_isPlaying) return;

    setMouthOpen(0.0f);

    if (!s_pcmQueue.empty()) {
        PcmBuffer nextPcm = s_pcmQueue.front();
        s_pcmQueue.pop();
        s_pcmQueuedBytes -= nextPcm.size;

        PcmPlaybackResult result = startPcmPlayback(
            nextPcm.data,
            nextPcm.size,
            nextPcm.sessionId,
            nextPcm.finalSegment
        );
        if (result != PCM_PLAYBACK_OK) {
            if (result != PCM_PLAYBACK_SPEAKER_FAILED) {
                free(nextPcm.data);
            }
            Serial.printf("[PCM] Dropped queued segment: result=%d\n", result);
        }
        if (s_isPlaying) {
            return;
        }
    }

    if (s_playbackState.currentIsPcm && s_playbackState.pcmFinalSegment) {
        Serial.printf("[PCM] Session complete: %s\n", s_playbackState.pcmSessionId.c_str());
    }
    s_playbackState.currentIsPcm = false;
    s_playbackState.pcmSessionId = "";
    s_playbackState.pcmFinalSegment = false;
    setFaceExpression(FACE_IDLE);
}

static bool notifyPlaybackFinished() {
    if (!endSpeakerPlayback()) {
        return false;
    }
    s_isPlaying = false;
    releaseCurrentPlaybackBuffer();
    setMouthOpen(0.0f);
    logAudioMemory("play-finish");
    processAudioQueue();

    if (!s_isPlaying && !hasPendingPlaybackWork()) {
        s_micResumeRequested = true;
    }
    return true;
}

void updatePlayback() {
    updateLipSync();

    if (s_isPlaying &&
        (millis() - s_playbackStartMs > 1000) &&
        (!M5.Speaker.isPlaying() ||
         (s_playbackDeadlineMs != 0 && millis() > s_playbackDeadlineMs))) {
        if (s_playbackDeadlineMs != 0 && millis() > s_playbackDeadlineMs) {
            Serial.println("[PLAY] Playback timeout -> force stop");
            if (audioGateEnter("play-stop", 200)) {
                M5.Speaker.stop();
                audioGateLeave("play-stop");
            } else {
                Serial.println("[PLAY] Audio gate busy; skipped forced speaker stop");
            }
            clearQueuedPcmPlayback();
        }
        notifyPlaybackFinished();
    }
}

bool isPlaybackActive() {
    return s_isPlaying;
}

void stopPlaybackNow() {
    if (!s_isPlaying) return;
    Serial.println("[PLAY] Tap interrupt -> stop");
    if (audioGateEnter("tap-stop", 200)) {
        M5.Speaker.stop();
        audioGateLeave("tap-stop");
    }
    clearQueuedPcmPlayback();
    notifyPlaybackFinished();
}

bool shouldResumeMic() {
    return s_micResumeRequested && !s_isPlaying && !hasPendingPlaybackWork();
}

void clearMicResumeRequest() {
    s_micResumeRequested = false;
}

void requestMicResume() {
    s_micResumeRequested = true;
}
