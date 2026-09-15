#pragma once
#include "types.h"

void initPlayback();                 // setup()で呼ぶ
void updatePlayback();
bool isPlaybackActive();
void stopPlaybackNow();              // タップ割り込み：即時停止＋キュー破棄
// The session a tap cut short. Its later chunks are refused (409) so the
// PC stops synthesizing instead of resuming mid-reply (delta, gap 1).
bool wasSessionInterrupted(const String& sessionId);
void forgetInterruptedSession();
bool shouldResumeMic();
void clearMicResumeRequest();
void requestMicResume();
enum PcmPlaybackResult {
    PCM_PLAYBACK_OK,
    PCM_PLAYBACK_QUEUED,
    PCM_PLAYBACK_BUSY,
    PCM_PLAYBACK_SESSION_MISMATCH,
    PCM_PLAYBACK_INVALID,
    PCM_PLAYBACK_SPEAKER_FAILED,
};
struct PlaybackStatus {
    bool playing = false;
    bool pcm = false;
    bool pcmFinalSegment = false;
    const char* pcmSession = "";
    size_t currentBytes = 0;
    size_t queuedPcmBytes = 0;
    size_t queuedPcmSegments = 0;
    bool micResumeRequested = false;
    unsigned long startedMs = 0;
    unsigned long deadlineMs = 0;
};
PcmPlaybackResult startPcmPlayback(uint8_t* pcmData, size_t pcmSize, const String& sessionId, bool finalSegment);
PcmPlaybackResult stagePcmPlayback(uint8_t* pcmData, size_t pcmSize, const String& sessionId, long seq, bool finalSegment);
void clearQueuedPcmPlayback();
PlaybackStatus getPlaybackStatus();
