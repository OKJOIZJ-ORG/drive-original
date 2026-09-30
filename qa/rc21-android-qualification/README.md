# rc21 Android availability and qualification

This leaf records actual Windows-host Android runtime discovery for the rc21
candidate. It does not substitute desktop touch/viewport emulation for Android.

Candidate: https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/

Product source identity supplied by the coordinator: `3ebd97d`; evidence baseline
HEAD: `0fcb50b`. No product code, version, release, main, or production changes are
owned by this leaf.

## Observed discovery

- `C:\Program Files (x86)\Nox` exists but contains zero children, including hidden
  entries. No executable was found there; an existing empty directory does not
  establish an installed emulator.
- No Android/Nox/BlueStacks/LDPlayer/MEmu/Genymotion/scrcpy uninstall entry, running
  emulator/ADB process, Android/WSA Appx package, or Android SDK environment name
  was returned by the scoped collectors.
- Executable-name search covered the current user's home, `C:\extensions`,
  `C:\Temp`, Program Files, and Program Files (x86), and found no `adb.exe`,
  `*adb.exe`, `emulator.exe`, Nox/NoxConsole, BlueStacks HD-Player, LDPlayer,
  MEmu, or scrcpy executable. `WindowsApps` and one Windows Defender directory
  were denied during this search and remain explicit coverage limits.
- No listener was returned on ADB/emulator conventional ports 5037, 5554, 5555,
  62001, 62025, or 21503.
- Present PnP devices included `SamsungFlowNoti`, a Bluetooth-enumerated service
  with no reported class. This is a positive discovery, but it does not identify
  an accessible Android screen or ADB transport. No Samsung Flow package, process,
  or native app inventory item was returned.
- Native `@oai/sky` inventory works. It returned no installed/running Android
  emulator. A Google AI Studio item was a name-filter false positive; Galaxy Buds
  is not an Android screen controller.
- Microsoft Phone Link (`Microsoft.YourPhone`) 0.26072.257.0 is installed; its
  actual `PhoneExperienceHost.exe` path was verified from the Appx install and
  manifest. The coordinator authorized foreground inspection. After launch and
  native-window binding recovery, the actual window showed a device connection
  confirmation flow explicitly mentioning iPhone, with Cancel and Connect.
  No existing Android screen was visible. No pairing code was recorded or acted
  on. This flow is a genuine pairing boundary, not an Android runtime.
- The native capture first showed an unrelated foreground Chrome surface despite
  the Phone Link target, then reported `foreground window did not report a
  process id`. Refreshing `list_windows` produced a new Phone Link window;
  a fresh read displayed the actual connection flow. The unrelated screenshot
  was not retained as Android evidence.
- Attempted cleanup of only the launched window with Alt+F4 was rejected with
  `user input was detected in this window; call get_window_state before
  continuing`. Inputs stopped immediately. Phone Link may remain open at the
  pairing boundary; the coordinator was notified. No successful close is claimed.

## Qualification boundary

Discovery does not prove physical-device absence or exhaust remote Android
providers, custom paths outside the scoped roots, or WindowsApps contents.
No Android browser/player execution, overlay test, rotation, fullscreen,
background return, long press, gesture cancellation, or Android accessibility
acceptance is claimed by discovery alone. iPhone Safari/standalone/VoiceOver
remain independent gates.

D-056 remains binding: pausing must not reveal the overlay as an attempted fix;
the dedicated touch region must reveal it without pausing. D-057 requires using
available Android first. No new software, login, pairing, grant, setting change,
account copying, media change, or production deployment occurred.
