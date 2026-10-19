# Play alongside Spotify

**Settings → Audio → Keep other music playing** defaults to On, including for
older installed copies. The game requests the mixable `ambient` audio session
before creating or resuming Web Audio. It does not connect to or control Spotify.
Game effects and music volumes remain independent; set Music to zero to use an
external soundtrack. Both dry audio and reverb sends follow their volume sliders.

On iPhone, ambient game audio follows Silent Mode. The separate silent-switch
override appears only when mixing is Off. Turning mixing Off deliberately restores
the old exclusive-playback behavior unless Respect the silent switch is On.
Returning from the background reapplies the selected policy before resume, and
normal gameplay taps no longer start a redundant silent audio buffer each time.

Source: [WebKit's explanation of mixable Web Audio and Silent Mode](https://bugs.webkit.org/show_bug.cgi?id=252746),
and the [Audio Session specification](https://www.w3.org/TR/audio-session/).
Browsers without the API retain their default Web Audio policy.

`scripts/audio.test.mjs` tests actual engine/settings modules with platform-shaped
fakes, including migration, policy ordering, hidden gestures, volume sends, and
missing APIs. `scripts/background-audio.mjs` exercises real Web Audio and the
production Settings UI in desktop and touch-phone Chromium with an observed
session adapter. Neither test simulates native iOS audio focus or Spotify;
physical-device verification is still needed for that platform behavior.
