# Firmware Pre-Flash Audit — vendored `migratorywhale/stackchan-mcp` firmware

**Audited snapshot:** commit `e8258a85b408057e9c914b8bcca9b70f59361445` (upstream committed 2026-08-30), shallow clone read 2026-08-31.
**Scope:** every file under `firmware/src/` (+ `drivers/`, `platformio.ini`, `config.h.example`) — ~4,650 lines of C/C++.
**Method:** three independent full-file review passes (network surface · audio path · remaining modules + supply chain), findings cross-checked against full-tree greps for network primitives, storage writes, and obfuscation.
**Rule being audited against:** the device must never send data anywhere except the owner's PC; no hidden capture, persistence, or backdoor; camera excludable; no Chinese-authored code in the data path.

## Verdict

**SAFE TO FORK — NOT SAFE TO FLASH STOCK.** The code is clean: zero self-initiated connections, zero telemetry/OTA/NTP, zero audio persistence, zero obfuscation, no credential exfil. But its security model is pure LAN-trust (no auth anywhere) and its mic is always-armed by design. The fork changes below are **mandatory before first flash**.

## What the audit established

1. **Egress inventory: one path, and it's caller-commanded.** The firmware never phones anywhere on its own. The only outbound connection in the tree is `audio_download.cpp` fetching a WAV from a URL supplied by a LAN caller via `POST /play` (SSRF-by-design, carries no device data). Listening sockets: HTTP :80, TCP PCM :9090, UDP PCM :9091 (inbound-only; the device never sends a UDP packet).
2. **No hidden anything.** `NOTIFICATION_CHECK_INTERVAL` and the chat timeouts are dead constants from an ancestor firmware — nothing polls. No DNS/NTP/OTA/telemetry/cloud endpoints, no obfuscated strings, no base64 blobs, no raw IPs (hex constants are amplifier register init). Wi-Fi credentials are read from local `config.h` only, never serialized or sent; only the SSID appears in serial logs.
3. **Audio is RAM-only, pull-model.** Mic samples live in internal-RAM ring (~300 ms pre-trigger) → PSRAM record buffer (8 s max) → PSRAM recording store (holds exactly one utterance, newest replaces oldest). No audio byte ever touches SPIFFS/SD/NVS. The sole reader is `GET /audio` (one-shot). Gone on power-off.
4. **But the mic is always-armed.** Whenever the robot isn't speaking, capture runs continuously with an RMS energy trigger (no wake word, no button) — nearby speech gets recorded (≤8 s) and staged for pull. Honest code, wrong policy for us.
5. **And nothing is authenticated.** Every HTTP route is open to any LAN host — including `GET /audio` (the last mic recording) and `GET /snapshot` (camera JPEG). The `udp_audio_token` is a session-correlation ID minted by the device and leaked via unauthenticated `GET /playback/status` — not a secret.
6. Buffers are not zeroed after consumption — the last utterance lingers in volatile RAM until overwritten.

## Mandatory fork changes (V1 build gate)

| # | Change | Closes |
|---|--------|--------|
| 1 | **Shared-secret auth on every HTTP route** + a token line in the TCP PCM handshake; reject unauthenticated callers. Secret lives in `config.h` (device) and server state (PC). | Open mic/camera to the LAN; audio-status presence oracle |
| 2 | **Mic disarmed by default.** Capture task cold until armed by touch (talk-now) or an authenticated server command; disarm on session close. Listening face tied to the armed state. | Always-listening policy violation |
| 3 | **Strip `POST /play` + `audio_download.cpp`** (the PCM push paths cover all playback). If ever revived, IP-pin to the PC. | Caller-commanded SSRF / arbitrary internet GET |
| 4 | **Exclude `camera_service` + `GET /snapshot` from the build** (compile-flag, verified absent from the binary). | Camera rule |
| 5 | **Zero `record_buffer` + recording store after consumption/clear.** | RAM lingering |
| 6 | Delete dead config (`NOTIFICATION_CHECK_INTERVAL`, `HTTP_TIMEOUT_CHAT/SHORT`) so no future code path revives them silently. | Hygiene |

Containment (router-level internet block; robot ↔ PC only) remains layered on top of all of the above — the fork changes are defense in depth, not a substitute.

## Remaining modules + supply chain (pass 3)

7. **Supply chain (all pinned, none floating):** `espressif32@7.0.0` platform (Espressif, Shanghai — Arduino core, Wi-Fi stack, camera driver), `m5stack/M5Unified@0.2.15` + `M5GFX@0.2.21` + `m5stack/StackChan-BSP@1.1.0` (M5Stack, Shenzhen; display/mic/speaker/servo HALs, largely derived from lovyan03's Japanese-authored libraries), `bblanchon/ArduinoJson@7.4.3` (France), `bitbank2/AnimatedGIF@2.2.3` (USA). `M5GFX` is specified **name-only** — owner-scope it to `m5stack/M5GFX@0.2.21` to prevent registry name-squat substitution.
8. **The hard-rule ceiling, stated plainly:** on this hardware the mic/speaker/display HALs and the Wi-Fi stack are Chinese-authored open source (M5Stack/Espressif) and sit in the data path. This is irreducible on a CoreS3 — no non-Chinese HAL exists for it. What the rule CAN mean here, and what this firmware passes: all such code is **open, version-pinned, widely vetted, audited here to initiate zero egress**, and the device is containment-locked to the PC regardless. The application layer above the HALs is non-Chinese after the fork changes. The owner accepts this ceiling or changes product category — there is no third option.
9. **Camera:** no exclusion flag exists upstream — `initCamera()` runs unconditionally (`main.cpp:43`) and `GET /snapshot` serves frames (`http_server.cpp:535`, single call site; frames go nowhere else, no autonomous capture). The fork adds a `-DSTACKCHAN_NO_CAMERA` build flag wrapping init + route + `camera_service.*`. Verify exclusion post-build: grep the tree and the .elf for `esp_camera`.
10. **Dead code to strip:** `src/drivers/SCServo/` — a Feetech (Shenzhen servo vendor)-derived UART driver, **included by nothing** (read line-by-line: inert protocol framing, no network) but still compiled because it sits under `src/`. Delete it. Also the dead config constants and legacy `data/*.png` static faces.
11. **Runtime-face patch hazard (V2):** `switchToFace()` swaps the GIF pointer while the render task may be mid-frame — safe today only because stock assets are immortal PROGMEM. Dynamic PSRAM face buffers MUST use a free-after-acknowledge handshake or double-buffering plus a mutex, or it's a use-after-free. SPIFFS reads happen outside the 8 KB-stack face task.
12. **Secrets:** Wi-Fi credentials are compile-time defines baked plaintext into the flash image (no NVS, no encryption) — normal for this device class, but anyone with physical USB access can dump them. Give the robot its own network or accept the exposure. No secrets are logged to serial. Comments are mixed Japanese (main/config) and Simplified Chinese (env_service) — comment language proves nothing about safety either way; every commented behavior matches what the code does.

## Additional fork changes from pass 3

| # | Change | Closes |
|---|--------|--------|
| 7 | Add `-DSTACKCHAN_NO_CAMERA` flag; verify `esp_camera` absent from binary | Camera rule (no flag exists upstream) |
| 8 | Delete `src/drivers/SCServo/` | Dead Chinese-vendor-derived code compiled into the image |
| 9 | Owner-scope the `M5GFX` dependency | Name-squat substitution window |
| 10 | Face-buffer lifecycle handshake (design constraint for the V2 patch) | Use-after-free |
