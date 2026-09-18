import React, { useState, useEffect } from "react";
import PianoSubmenu from "../components/PianoSubmenu";
import SongJumpMenu from "../components/SongJumpMenu";
import Nav from "../Nav";
import { API_URL, mode as appMode, Mode } from "app";
import useMidiControlModeStore from "utils/useMidiControlModeStore";

/*
================================================================================
🚨 CRITICAL: MIDI CONNECTION PATTERN - DO NOT BREAK THIS! 🚨
================================================================================

PROBLEM: MIDI devices get locked up if connections are held open by the browser.

SOLUTION (Fixed Oct 20, broke again Nov 7, fixed again Nov 7):
1. DO NOT store MIDIAccess in state or refs
2. Request fresh MIDI access each time you send a message
3. Send the message via output.send()
4. IMMEDIATELY call output.close() after sending
5. Let the access object be garbage collected

The sendMIDI() function MUST follow this pattern:
  const access = await navigator.requestMIDIAccess({ sysex: false });
  output.send(message);
  output.close(); // ← THIS LINE IS CRITICAL - DO NOT REMOVE!

If you remove output.close(), devices will lock up and become unusable.
================================================================================
*/

/*
0x0 - Momentary

0x1 - Toggle
Simple on/off behavior
Click once = ON, click again = OFF
Sends MIDI on every click
Used for window toggles, basic features

0x2 - Latching
Click to activate, stays active until another action
Group behavior: If button has a group property, clicking it activates THAT button and deactivates all OTHER buttons in the same group (radio button style)
Non-grouped: Simple toggle like mode 0x1
Most purple buttons use this

0x3 - Smart Toggle
Group 2 behavior: First click activates, subsequent clicks toggle subState (sends alternating MIDI values 0x00/0x01)
Other groups: First click activates and deactivates others in group, second click deactivates (sends 0x00)
Non-grouped: Simple ON/OFF toggle with 0x00 for OFF state
SubState preserved when switching between Group 2 buttons - resumes on last blinking value

0x4 - Toggle Alt (not currently implemented in the click logic)

0x5 - Special (not currently implemented in the click logic)

0x12 - Special 2 (not currently implemented in the click logic)
*/

interface ButtonState {
  id: number;
  active: boolean;
  color: string;
  label: string;
  mode: string;
  midi: string;
  group?: number;
  subState?: number; // For tracking which text is blinking (0 or 1)
  ref?: number; // MIDI reference number from second byte
}

const MidiController: React.FC = () => {
  // Don't store MIDIAccess at all - request it fresh each time we send
  // This prevents locking the device when the page is just open

  const { mode: midiControlMode, initializeMode: initializeMidiMode } = useMidiControlModeStore();
  const [velocityPickerOpen, setVelocityPickerOpen] = useState(false);
  const [velocityPickerMidiBase, setVelocityPickerMidiBase] = useState("");
  const [pianoSubmenuOpen, setPianoSubmenuOpen] = useState(false);
  const [songJumpMenuOpen, setSongJumpMenuOpen] = useState(false);
  const [medleySongs, setMedleySongs] = useState<any[]>([]);
  const [midiPortStatus, setMidiPortStatus] = useState<"checking" | "connected" | "not-found" | "unsupported" | "denied">("checking");

  // Initialize MIDI control mode from Firebase on mount
  useEffect(() => {
    initializeMidiMode();
  }, []);

  // Detect whether the LMP_TAB MIDI output port is actually available
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiPortStatus("unsupported");
      return;
    }

    let access: any = null;

    const checkPort = (a: any) => {
      let found = false;
      for (const output of a.outputs.values()) {
        if (output.name === "LMP_TAB") {
          found = true;
          break;
        }
      }
      setMidiPortStatus(found ? "connected" : "not-found");
    };

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        access = a;
        checkPort(a);
        a.onstatechange = () => checkPort(a);
      })
      .catch(() => setMidiPortStatus("denied"));

    return () => {
      if (access) access.onstatechange = null;
    };
  }, []);

  const sendMIDI = async (midiString: string) => {
    if (!midiString) return;

    try {
      console.log("[DIAGNOSTIC] Requesting MIDI access at:", new Date().toISOString());

      // Request MIDI access fresh each time
      const access = await navigator.requestMIDIAccess({ sysex: false });

      console.log("[DIAGNOSTIC] MIDI access obtained, searching for LMP_TAB...");

      const desiredPortName = "LMP_TAB";

      // Find and send to LMP_TAB
      for (const output of access.outputs.values()) {
        if (output.name === desiredPortName) {
          console.log("[DIAGNOSTIC] About to send MIDI at:", new Date().toISOString());
          const message = midiString.split(",").map((hex) => parseInt(hex));
          console.log(
            "Sending MIDI:",
            message.map((b) => "0x" + b.toString(16)),
          );
          output.send(message);
          console.log("[DIAGNOSTIC] MIDI sent, explicitly closing output port");
          output.close(); // Explicitly close the port to release the device
          break;
        }
      }
    } catch (error) {
      console.error("Error sending MIDI:", error);
    }
  };

  const sendMIDISysex = async (url: string) => {
    try {
      console.log("[SYSEX] Sending URL via MIDI Sysex:", url);
      
      // Request MIDI access with sysex enabled
      const access = await navigator.requestMIDIAccess({ sysex: true });
      const desiredPortName = "LMP_TAB";

      // Find and send to LMP_TAB
      for (const output of access.outputs.values()) {
        if (output.name === desiredPortName) {
          // Convert URL to bytes
          const urlBytes = Array.from(url).map(char => char.charCodeAt(0));
          
          // Create sysex message: 0xF0 (start) + manufacturer ID + data + 0xF7 (end)
          // Using manufacturer ID 0x7D (educational/development use)
          const sysexMessage = [0xF0, 0x7D, ...urlBytes, 0xF7];
          
          console.log("[SYSEX] Sending message:", sysexMessage);
          output.send(sysexMessage);
          output.close();
          break;
        }
      }
    } catch (error) {
      console.error("Error sending MIDI Sysex:", error);
    }
  };

  const handleSongJumpClick = async () => {
    // Always refresh medley data from MobileBroadcaster to ensure sync
    try {
      const baseUrl = appMode === Mode.PROD ? `${window.location.origin}/api` : API_URL;
      const response = await fetch(`${baseUrl}/broadcast-state`);
      const data = await response.json();
      
      if (data && data.state && data.state.medleySongs) {
        // MobileBroadcaster includes the full medley songs array in its state
        const songs = data.state.medleySongs;
        console.log("[SONG JUMP] Loaded", songs.length, "songs from MobileBroadcaster");
        setMedleySongs(songs);
      } else {
        console.warn("[SONG JUMP] No medley songs in broadcaster state");
        setMedleySongs([]);
      }
    } catch (error) {
      console.error("[SONG JUMP] Error fetching medley data:", error);
      setMedleySongs([]);
    }
    
    setSongJumpMenuOpen(true);
  };

  const handleSongJump = async (songIndex: number, sectionIndex: number) => {
    const baseUrl = appMode === Mode.PROD ? `${window.location.origin}/api` : API_URL;
    const url = `${baseUrl}/broadcast-jump/${songIndex}/${sectionIndex}`;
    
    if (midiControlMode === 'api') {
      // Direct API call
      console.log("[SONG JUMP] Calling API directly for song", songIndex, "section", sectionIndex);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error("[SONG JUMP] Error calling API:", response.status);
        } else {
          const data = await response.json();
          console.log("[SONG JUMP] Success:", data);
        }
      } catch (error) {
        console.error("[SONG JUMP] Network error:", error);
      }
    } else {
      // Send the URL via MIDI Sysex - FL Studio will make the API call
      console.log("[SONG JUMP] Sending MIDI Sysex for song", songIndex, "section", sectionIndex);
      sendMIDISysex(url);
    }
  };

  // Direct API control functions for song/section navigation
  const callBroadcastAPI = async (endpoint: string) => {
    try {
      const baseUrl = appMode === Mode.PROD ? `${window.location.origin}/api` : API_URL;
      const url = `${baseUrl}${endpoint}`;
      console.log(`[API CONTROL] Calling ${endpoint}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[API CONTROL] Error calling ${endpoint}:`, response.status);
      } else {
        const data = await response.json();
        console.log(`[API CONTROL] Success:`, data);
      }
    } catch (error) {
      console.error(`[API CONTROL] Network error calling ${endpoint}:`, error);
    }
  };

  const handleSongNext = async () => {
    console.log('[NAV] handleSongNext - mode:', midiControlMode);
    if (midiControlMode === 'api') {
      await callBroadcastAPI('/broadcast-song/next');
    } else {
      // Send MIDI message
      await sendMIDI('0xBD,0x53,0x00');
    }
  };

  const handleSongPrev = async () => {
    console.log('[NAV] handleSongPrev - mode:', midiControlMode);
    if (midiControlMode === 'api') {
      await callBroadcastAPI('/broadcast-song/prev');
    } else {
      // Send MIDI message
      await sendMIDI('0xBD,0x52,0x00');
    }
  };

  const handleSectionNext = async () => {
    console.log('[NAV] handleSectionNext - mode:', midiControlMode);
    if (midiControlMode === 'api') {
      await callBroadcastAPI('/broadcast-section/next');
    } else {
      // Send MIDI message
      await sendMIDI('0xBD,0x55,0x00');
    }
  };

  const handleSectionPrev = async () => {
    console.log('[NAV] handleSectionPrev - mode:', midiControlMode);
    if (midiControlMode === 'api') {
      await callBroadcastAPI('/broadcast-section/prev');
    } else {
      // Send MIDI message
      await sendMIDI('0xBD,0x54,0x00');
    }
  };

  const [buttons, setButtons] = useState<ButtonState[]>(() => {
    const initialButtons: ButtonState[] = [];

    // Left grid (0-63) from XML - all have grp="1" for buttons 0-47
    const leftGridData = [
      // Row 1 (0-7) - Purple buttons, group 1
      { midi: "0xCD,0x00", mode: "0x2", colors: ["#7c488c"], ref: 0, label: "Setup\n0", group: 1 },
      { midi: "0xCD,0x01", mode: "0x2", colors: ["#7c488c"], ref: 1, label: "1", group: 1 },
      { midi: "0xCD,0x02", mode: "0x2", colors: ["#7c488c"], ref: 2, label: "2", group: 1 },
      { midi: "0xCD,0x03", mode: "0x2", colors: ["#7c488c"], ref: 3, label: "3", group: 1 },
      { midi: "0xCD,0x04", mode: "0x2", colors: ["#7c488c"], ref: 4, label: "4", group: 1 },
      { midi: "0xCD,0x05", mode: "0x2", colors: ["#7c488c"], ref: 5, label: "5", group: 1 },
      { midi: "0xCD,0x06", mode: "0x2", colors: ["#7c488c"], ref: 6, label: "6", group: 1 },
      { midi: "0xCD,0x07", mode: "0x2", colors: ["#7c488c"], ref: 7, label: "7", group: 1 },
      // Row 2 (8-15) - Purple buttons, group 1
      { midi: "0xCD,0x08", mode: "0x2", colors: ["#7c488c"], ref: 8, label: "8", group: 1 },
      { midi: "0xCD,0x09", mode: "0x2", colors: ["#7c488c"], ref: 9, label: "9", group: 1 },
      { midi: "0xCD,0x0A", mode: "0x2", colors: ["#7c488c"], ref: 10, label: "10", group: 1 },
      { midi: "0xCD,0x0B", mode: "0x2", colors: ["#7c488c"], ref: 11, label: "11", group: 1 },
      { midi: "0xCD,0x0C", mode: "0x2", colors: ["#7c488c"], ref: 12, label: "12", group: 1 },
      { midi: "0xCD,0x0D", mode: "0x2", colors: ["#7c488c"], ref: 13, label: "13", group: 1 },
      { midi: "0xCD,0x0E", mode: "0x2", colors: ["#7c488c"], ref: 14, label: "14", group: 1 },
      { midi: "0xCD,0x0F", mode: "0x2", colors: ["#7c488c"], ref: 15, label: "15", group: 1 },
      // Row 3 (16-23) - Purple buttons, group 1
      { midi: "0xCD,0x10", mode: "0x0", colors: ["#7c488c"], ref: 16, label: "16", group: 1 }, // Momentary
      { midi: "0xCD,0x11", mode: "0x0", colors: ["#7c488c"], ref: 17, label: "17", group: 1 }, // Momentary
      { midi: "0xCD,0x12", mode: "0x2", colors: ["#7c488c"], ref: 18, label: "18", group: 1 },
      { midi: "0xCD,0x13", mode: "0x2", colors: ["#7c488c"], ref: 19, label: "19", group: 1 },
      { midi: "0xCD,0x14", mode: "0x2", colors: ["#7c488c"], ref: 20, label: "20", group: 1 },
      { midi: "0xCD,0x15", mode: "0x2", colors: ["#7c488c"], ref: 21, label: "21", group: 1 },
      { midi: "0xCD,0x16", mode: "0x2", colors: ["#7c488c"], ref: 22, label: "22", group: 1 },
      { midi: "0xCD,0x17", mode: "0x2", colors: ["#7c488c"], ref: 23, label: "23", group: 1 },
      // Row 4 (24-31) - Purple buttons, group 1
      { midi: "0xCD,0x18", mode: "0x2", colors: ["#7c488c"], ref: 24, label: "24", group: 1 },
      { midi: "0xCD,0x19", mode: "0x2", colors: ["#7c488c"], ref: 25, label: "25", group: 1 },
      { midi: "0xCD,0x1A", mode: "0x2", colors: ["#7c488c"], ref: 26, label: "26", group: 1 },
      { midi: "0xCD,0x1B", mode: "0x2", colors: ["#7c488c"], ref: 27, label: "27", group: 1 },
      { midi: "0xCD,0x1C", mode: "0x2", colors: ["#7c488c"], ref: 28, label: "28", group: 1 },
      { midi: "0xCD,0x1D", mode: "0x2", colors: ["#7c488c"], ref: 29, label: "29", group: 1 },
      { midi: "0xCD,0x1E", mode: "0x2", colors: ["#7c488c"], ref: 30, label: "30", group: 1 },
      { midi: "0xCD,0x1F", mode: "0x2", colors: ["#7c488c"], ref: 31, label: "31", group: 1 },
      // Row 5 (32-39) - Gray buttons, group 1
      { midi: "0xCD,0x20", mode: "0x2", colors: ["#474747"], ref: 32, label: "32", group: 1 },
      { midi: "0xCD,0x21", mode: "0x2", colors: ["#474747"], ref: 33, label: "33", group: 1 },
      { midi: "0xCD,0x22", mode: "0x2", colors: ["#474747"], ref: 34, label: "34", group: 1 },
      { midi: "0xCD,0x23", mode: "0x2", colors: ["#474747"], ref: 35, label: "35", group: 1 },
      { midi: "0xCD,0x24", mode: "0x2", colors: ["#474747"], ref: 36, label: "36", group: 1 },
      { midi: "0xCD,0x25", mode: "0x2", colors: ["#474747"], ref: 37, label: "37", group: 1 },
      { midi: "0xCD,0x26", mode: "0x2", colors: ["#474747"], ref: 38, label: "38", group: 1 },
      { midi: "0xCD,0x27", mode: "0x2", colors: ["#474747"], ref: 39, label: "39", group: 1 },
      // Row 6 (40-47) - Gray buttons, group 1
      { midi: "0xCD,0x28", mode: "0x2", colors: ["#474747"], ref: 40, label: "40", group: 1 },
      { midi: "0xCD,0x29", mode: "0x2", colors: ["#474747"], ref: 41, label: "41", group: 1 },
      { midi: "0xCD,0x2A", mode: "0x2", colors: ["#474747"], ref: 42, label: "42", group: 1 },
      { midi: "0xCD,0x2B", mode: "0x2", colors: ["#474747"], ref: 43, label: "43", group: 1 },
      { midi: "0xCD,0x2C", mode: "0x2", colors: ["#474747"], ref: 44, label: "44", group: 1 },
      { midi: "0xCD,0x2D", mode: "0x2", colors: ["#474747"], ref: 45, label: "45", group: 1 },
      { midi: "0xCD,0x2E", mode: "0x2", colors: ["#474747"], ref: 46, label: "46", group: 1 },
      { midi: "0xCD,0x2F", mode: "0x2", colors: ["#474747"], ref: 47, label: "47", group: 1 },
      // Row 7 (48-55) - Black buttons, no group
      { midi: "0xBD,0x30,0x01", mode: "0x1", colors: ["#000000"], ref: 48, label: "⏯️" },
      { midi: "0xCD,0x31", mode: "0x5", colors: ["#000000"], ref: 49, label: "⌚\nMetro\nnome" },
      { midi: "0xBD,0x32,0x01", mode: "0x3", colors: ["#000000"], ref: 50, label: "🎹\nSus\nRelay" },
      { midi: "0xCD,0x33", mode: "0x2", colors: ["#000000"], ref: 51, label: "51" },
      { midi: "0xCD,0x34", mode: "0x2", colors: ["#000000"], ref: 52, label: "52" },
      { midi: "0xCD,0x35", mode: "0x2", colors: ["#000000"], ref: 53, label: "53" },
      { midi: "0xCD,0x36", mode: "0x2", colors: ["#000000"], ref: 54, label: "54" },
      { midi: "0xCD,0x37", mode: "0x2", colors: ["#000000"], ref: 55, label: "55" },
      // Row 8 (56-63) - White buttons, mostly momentary
      { midi: "0xBD,0x38,0x7F", mode: "0x0", colors: ["#ffffff"], ref: 56, label: "Reload\n🗑️\nClear" },
      { midi: "0xBD,0x39,0x7F", mode: "0x0", colors: ["#ffffff"], ref: 57, label: "loop\n➿\nMIDI" },
      { midi: "0xCD,0x3A", mode: "0x0", colors: ["#ffffff"], ref: 58, label: "STOP\n🛑\nPANIC" },
      { midi: "0xCD,0x3B", mode: "0x0", colors: ["#ffffff"], ref: 59, label: "NULL\n🚷\nChan" },
      { midi: "0xCD,0x3C", mode: "0x2", colors: ["#ffffff"], ref: 60, label: "60" },
      { midi: "0xCD,0x3D", mode: "0x2", colors: ["#ffffff"], ref: 61, label: "61" },
      { midi: "0xBD,0x3E,0x01", mode: "0x1", colors: ["#ffffff"], ref: 62, label: "⛓️‍💥\nDisable\nLinks" },
      { midi: "0xBD,0x3F,0x01", mode: "0x1", colors: ["#ffffff"], ref: 63, label: "🐞🕵🏻‍♂️\nDEBUG\n🧐👀" },
    ];

    // Right grid (64-127) from XML
    const rightGridData = [
      // Row 1 (64-71) - Gray buttons, mostly momentary
      { midi: "0xBD,0x40,0x7F", mode: "0x1", colors: ["#3A1B5C"], ref: 64, label: "YAM\nSus" },
      { midi: "0xBD,0x41,0x01", mode: "0x1", colors: ["#474747"], ref: 65, label: "📋\nPlay\nList" },
      { midi: "0xBD,0x42,0x01", mode: "0x1", colors: ["#474747"], ref: 66, label: "🎹\nPiano\nRoll" },
      { midi: "0xBD,0x43,0x01", mode: "0x1", colors: ["#474747"], ref: 67, label: "🎛️\nChan\nRack" },
      { midi: "0xBD,0x44,0x01", mode: "0x1", colors: ["#474747"], ref: 68, label: "🎚️\nMixer" },
      { midi: "0xBD,0x45,0x01", mode: "0x1", colors: ["#474747"], ref: 69, label: "🎧\nCtrl\nSurf" },
      { midi: "0xBD,0x46,0x7F", mode: "0x1", colors: ["#474747"], ref: 70, label: "📜\nScript\noutput" },
      { midi: "0xBD,0x47,0x7F", mode: "0x1", colors: ["#474747"], ref: 71, label: "⚙️\nSettings" },
      // Row 2 (72-79)
      { midi: "0xBD,0x48,0x01", mode: "0x1", colors: ["#3A1B5C"], ref: 72, label: "YAM\nChan 1" },
      { midi: "0xBD,0x49,0x01", mode: "0x1", colors: ["#3A1B5C"], ref: 73, label: "YAM\nChan 2" },
      { midi: "0xBD,0x4A,0x01", mode: "0x1", colors: ["#3A1B5C"], ref: 74, label: "YAM\nChan 3" },
      { midi: "0xBD,0x4B,0x01", mode: "0x1", colors: ["#3A1B5C"], ref: 75, label: "YAM\nChan 4" },
      { midi: "0xBD,0x4C,0x7F", mode: "0x0", colors: ["#474747"], ref: 76, label: "76" },
      { midi: "0xBD,0x4D,0x7F", mode: "0x0", colors: ["#474747"], ref: 77, label: "77" },
      { midi: "0xBD,0x4E,0x7F", mode: "0x0", colors: ["#474747"], ref: 78, label: "78" },
      { midi: "0xBD,0x4F,0x01", mode: "0x1", colors: ["#474747"], ref: 79, label: "79" },
      // Row 3 (80-87)
      { midi: "0xCD,0x50", mode: "0x0", colors: ["#3A1B5C"], ref: 80, label: "YAM\nP125a" },
      { midi: "0xBD,0x51,0x00", mode: "0x0", colors: ["#3A1B5C"], ref: 81, label: "YAM\nVelocity" },
      { midi: "0xBD,0x52,0x00", mode: "0x0", colors: ["#C084FC"], ref: 82, label: "<<<\nSONG\nPREV" },
      { midi: "0xBD,0x53,0x00", mode: "0x0", colors: ["#C084FC"], ref: 83, label: ">>>\nSONG\nNEXT" },
      { midi: "0xBD,0x54,0x00", mode: "0x0", colors: ["#FF0000"], ref: 84, label: "<<<\nSECTION\nPREV" },
      { midi: "0xBD,0x55,0x00", mode: "0x0", colors: ["#00DD00"], ref: 85, label: ">>>\nSECTION\nNEXT" },
      { midi: "0xBD,0x56,0x00", mode: "0x0", colors: ["#C084FC"], ref: 86, label: "<=>\nSONG\nJUMP" },
      { midi: "0xBD,0x57,0x7F", mode: "0x1", colors: ["#996633"], ref: 87, label: "LYRICS\n📽️\nONLY" },
      // Row 4 (88-95)
      { midi: "0xCD,0x58", mode: "0x2", colors: ["#474747"], ref: 88, label: "👁️\nShow\nChans" },
      { midi: "0xCD,0x59", mode: "0x2", colors: ["#474747"], ref: 89, label: "👁️\nShow\nPatts" },
      { midi: "0xBD,0x5A,0x01", mode: "0x3", colors: ["#474747"], ref: 90, label: "👁️\n(Alt)\nShowAll" },
      { midi: "0xBD,0x5B,0x01", mode: "0x1", colors: ["#474747"], ref: 91, label: "❓\nParam\nChan" },
      { midi: "0xBD,0x5C,0x01", mode: "0x1", colors: ["#474747"], ref: 92, label: "❓❓\nParam\nEffect" },
      { midi: "0xCD,0x5D", mode: "0x12", colors: ["#f80bf6"], ref: 93, label: "🔀\nShow\nVars" },
      { midi: "0xCD,0x5E", mode: "0x2", colors: ["#fbc487"], ref: 94, label: "🎶\nShow\nNHR" },
      { midi: "0xBD,0x5F,0x01", mode: "0x1", colors: ["#fe511e"], ref: 95, label: "☠️\ntester" },
      // Row 5 (96-103)
      { midi: "0xCD,0x60", mode: "0x0", colors: ["#f90202"], ref: 96, label: "ME\nTrans\n--" },
      { midi: "0xCD,0x61", mode: "0x0", colors: ["#f90202"], ref: 97, label: "ME\nTrans\nZero" },
      { midi: "0xCD,0x62", mode: "0x0", colors: ["#f90202"], ref: 98, label: "ME\nTrans\n++" },
      { midi: "0xCD,0x63", mode: "0x2", colors: ["#474747"], ref: 99, label: "99" },
      { midi: "0xCD,0x64", mode: "0x0", colors: ["#f90202"], ref: 100, label: "ME\nOctave\n--" },
      { midi: "0xCD,0x65", mode: "0x0", colors: ["#f90202"], ref: 101, label: "ME\nOctave\nZero" },
      { midi: "0xCD,0x66", mode: "0x0", colors: ["#f90202"], ref: 102, label: "ME\nOctave\n++" },
      { midi: "0xBD,0x67,0x00", mode: "0x0", colors: ["#A0191B"], ref: 103, label: "ME\nVelocity" },
      // Row 6 (104-111) - Group 2 for first two buttons
      { midi: "0xBD,0x68,0x7F", mode: "0x1", colors: ["#f90202"], ref: 104, label: "Live\nPerf\nCh01", group: 2 },
      { midi: "0xBD,0x69,0x01", mode: "0x3", colors: ["#f90202"], ref: 105, label: "Ch02\nor\nCh12", group: 2, subState: 0 },
      { midi: "0xCD,0x6A", mode: "0x0", colors: ["#474747"], ref: 106, label: "106" },
      { midi: "0xBD,0x6B,0x00", mode: "0x0", colors: ["#474747"], ref: 107, label: "107" },
      { midi: "0xCD,0x6C", mode: "0x0", colors: ["#00ff00"], ref: 108, label: "DM48\nOctave\n--" },
      { midi: "0xCD,0x6D", mode: "0x0", colors: ["#00ff00"], ref: 109, label: "DM48\nOctave\nZero" },
      { midi: "0xCD,0x6E", mode: "0x0", colors: ["#00ff00"], ref: 110, label: "DM48\nOctave\n++" },
      { midi: "0xBD,0x6F,0x00", mode: "0x0", colors: ["#00cc00"], ref: 111, label: "DM48\nVelocity" },
      // Row 7 (112-119) - Group 2 for first button
      { midi: "0xBD,0x70,0x01", mode: "0x3", colors: ["#0000ff"], ref: 112, label: "Ch 03\nOr\nCh 13", group: 2, subState: 0 },
      { midi: "0xBD,0x71,0x01", mode: "0x1", colors: ["#0000ff"], ref: 113, label: "Major\nor\nMinor" },
      { midi: "0xBD,0x72,0x01", mode: "0x1", colors: ["#0000ff"], ref: 114, label: "1234\nor\n1456" },
      { midi: "0xBD,0x73,0x00", mode: "0x0", colors: ["#c3a008"], ref: 115, label: "UM-1\nSplit" },
      { midi: "0xCD,0x74", mode: "0x2", colors: ["#fed50b"], ref: 116, label: "UM-1\nOctave\n--" },
      { midi: "0xCD,0x75", mode: "0x2", colors: ["#fed50b"], ref: 117, label: "UM-1\nOctave\nZero" },
      { midi: "0xCD,0x76", mode: "0x2", colors: ["#fed50b"], ref: 118, label: "UM-1\nOctave\n++" },
      { midi: "0xBD,0x77,0x00", mode: "0x0", colors: ["#d4b009"], ref: 119, label: "UM-1\nVelocity" },
      // Row 8 (120-127)
      { midi: "0xBD,0x78,0x01", mode: "0x1", colors: ["#0000ff"], ref: 120, label: "UM-1\nBass\n1" },
      { midi: "0xBD,0x79,0x01", mode: "0x1", colors: ["#0000ff"], ref: 121, label: "UM-1\nBass\n2" },
      { midi: "0xBD,0x7A,0x01", mode: "0x1", colors: ["#0000ff"], ref: 122, label: "UM-1\nBass\n3" },
      { midi: "0xBD,0x7B,0x01", mode: "0x1", colors: ["#0000ff"], ref: 123, label: "UM-1\nBass\n4" },
      { midi: "0xCD,0x7C", mode: "0x0", colors: ["#00FFFF"], ref: 124, label: "Global\nTrans\n--" },
      { midi: "0xCD,0x7D", mode: "0x0", colors: ["#00FFFF"], ref: 125, label: "Global\nTrans\nZero" },
      { midi: "0xCD,0x7E", mode: "0x0", colors: ["#00FFFF"], ref: 126, label: "Global\nTrans\n++" },
      { midi: "0xBD,0x7F,0x00", mode: "0x0", colors: ["#00cccc"], ref: 127, label: "Global\nVelocity" }, // Momentary
    ];

    // Combine all buttons
    [...leftGridData, ...rightGridData].forEach((data, index) => {
      initialButtons.push({
        id: index,
        active: false,
        color: data.colors[0],
        label: data.label,
        mode: data.mode,
        midi: data.midi,
        group: (data as any).group,
        subState: (data as any).subState ?? 0,
        ref: data.ref,
      });
    });

    return initialButtons;
  });

  // Handle mouse down for momentary buttons
  const handleMouseDown = (id: number) => {
    const button = buttons[id];
    if (!button) return;

    // Check if this is the Yamaha P125a button (ref 80)
    if (button.ref === 80) {
      window.location.href = '/yamaha-p125a';
      return;
    }

    // Check if this is the Yam Split button (ref 115)
    if (button.ref === 115) {
      setPianoSubmenuOpen(true);
      return;
    }

    // Check if this is the SONG JUMP button (ref 86)
    if (button.ref === 86) {
      handleSongJumpClick();
      return;
    }

    // Check if this is a song/section navigation button
    if (button.ref === 82) {
      // SONG PREV button
      if (midiControlMode === 'api') {
        handleSongPrev();
        return;
      }
      // Fall through to send MIDI in MIDI mode
    }
    if (button.ref === 83) {
      // SONG NEXT button
      if (midiControlMode === 'api') {
        handleSongNext();
        return;
      }
      // Fall through to send MIDI in MIDI mode
    }
    if (button.ref === 84) {
      // SECTION PREV button
      if (midiControlMode === 'api') {
        handleSectionPrev();
        return;
      }
      // Fall through to send MIDI in MIDI mode
    }
    if (button.ref === 85) {
      // SECTION NEXT button
      if (midiControlMode === 'api') {
        handleSectionNext();
        return;
      }
      // Fall through to send MIDI in MIDI mode
    }

    // Check if this is a velocity picker button
    if (button.label.includes("Velocity")) {
      // Open velocity picker overlay
      // Extract base MIDI command (everything before the last comma)
      const midiParts = button.midi.split(",");
      if (midiParts.length >= 2) {
        const baseCommand = midiParts.slice(0, -1).join(",");
        setVelocityPickerMidiBase(baseCommand);
        setVelocityPickerOpen(true);
      }
      return;
    }

    // Mode 0x3: Smart Toggle - sends value based on subState or active state
    if (button.mode === "0x3") {
      // Determine the MIDI value to send
      let midiToSend = button.midi;

      if (button.group === 2) {
        // Group 2 behavior: toggle subState when already active
        if (button.active) {
          // Toggle subState and send corresponding MIDI
          const newSubState = (button.subState ?? 0) === 0 ? 1 : 0;
          const midiParts = button.midi.split(",");
          if (midiParts.length >= 3) {
            // Invert: subState 0 (Ch12) = 0x01, subState 1 (Ch02) = 0x00
            const midiValue = newSubState === 0 ? "0x01" : "0x00";
            midiParts[midiParts.length - 1] = midiValue;
            midiToSend = midiParts.join(",");
          }
          sendMIDI(midiToSend);
          setButtons((prev) =>
            prev.map((btn) =>
              btn.id === id ? { ...btn, subState: newSubState } : btn
            ),
          );
        } else {
          // Activate this button, deactivate others in group 2
          // Send MIDI based on current subState, not default midi
          const currentSubState = button.subState ?? 0;
          const midiParts = button.midi.split(",");
          if (midiParts.length >= 3) {
            const midiValue = currentSubState === 0 ? "0x01" : "0x00";
            midiParts[midiParts.length - 1] = midiValue;
            midiToSend = midiParts.join(",");
          }
          sendMIDI(midiToSend);
          setButtons((prev) =>
            prev.map((btn) => {
              if (btn.group === 2) {
                return btn.id === id ? { ...btn, active: true } : { ...btn, active: false };
              }
              return btn;
            }),
          );
        }
      } else if (button.group) {
        // Other groups: activate this, deactivate others in same group
        if (button.active) {
          // Already active, turn OFF
          const midiParts = button.midi.split(",");
          if (midiParts.length >= 3) {
            midiParts[midiParts.length - 1] = "0x00";
            midiToSend = midiParts.join(",");
          }
          sendMIDI(midiToSend);
          setButtons((prev) =>
            prev.map((btn) =>
              btn.id === id ? { ...btn, active: false } : btn
            ),
          );
        } else {
          // Not active, turn ON and deactivate others
          sendMIDI(button.midi);
          setButtons((prev) =>
            prev.map((btn) => {
              if (btn.group === button.group) {
                return btn.id === id ? { ...btn, active: true } : { ...btn, active: false };
              }
              return btn;
            }),
          );
        }
      } else {
        // No group: simple toggle
        if (button.active) {
          // Turning OFF - replace last byte with 0x00
          const midiParts = button.midi.split(",");
          if (midiParts.length >= 3) {
            midiParts[midiParts.length - 1] = "0x00";
            midiToSend = midiParts.join(",");
          }
        } else {
          // Turning ON - send as-is
          midiToSend = button.midi;
        }
        sendMIDI(midiToSend);
        setButtons((prev) =>
          prev.map((btn) => (btn.id === id ? { ...btn, active: !btn.active } : btn)),
        );
      }
      return;
    }

    // Mode 0x1: Toggle - sends different MIDI values based on state
    if (button.mode === "0x1") {
      const newActive = !button.active;
      let midiToSend = button.midi;

      // Parse MIDI string and modify last byte based on new state
      const midiParts = button.midi.split(",");
      if (midiParts.length >= 3) {
        // If turning off, send 0x00; if turning on, use configured value
        midiParts[midiParts.length - 1] = newActive ? midiParts[midiParts.length - 1] : "0x00";
        midiToSend = midiParts.join(",");
      }

      sendMIDI(midiToSend);
      setButtons((prev) =>
        prev.map((btn) => (btn.id === id ? { ...btn, active: newActive } : btn)),
      );
      return;
    }

    sendMIDI(button.midi);

    const isMomentary = button.mode === "0x0";

    if (isMomentary) {
      // Momentary button - activate on mouse down
      setButtons((prev) =>
        prev.map((btn) => (btn.id === id ? { ...btn, active: true } : btn)),
      );
    } else {
      // Latching button - handle groups if applicable
      if (button.group === 2) {
        // Special handling for group 2 buttons
        if (button.active) {
          // Button is already active, toggle its subState
          setButtons((prev) =>
            prev.map((btn) =>
              btn.id === id ? { ...btn, subState: (btn.subState ?? 0) === 0 ? 1 : 0 } : btn
            ),
          );
        } else {
          // Button is not active, make it active and deactivate others in group 2
          setButtons((prev) =>
            prev.map((btn) => {
              if (btn.group === 2) {
                return btn.id === id ? { ...btn, active: true } : { ...btn, active: false };
              }
              return btn;
            }),
          );
        }
      } else if (button.group) {
        // If button is in another group, deactivate all other buttons in the same group
        setButtons((prev) =>
          prev.map((btn) => {
            if (btn.group === button.group) {
              return btn.id === id ? { ...btn, active: true } : { ...btn, active: false };
            }
            return btn;
          }),
        );
      } else {
        // Normal toggle for non-grouped buttons
        setButtons((prev) =>
          prev.map((btn) => (btn.id === id ? { ...btn, active: !btn.active } : btn)),
        );
      }
    }
  };

  // Handle mouse up for momentary buttons
  const handleMouseUp = (id: number) => {
    const button = buttons[id];
    if (!button) return;

    const isMomentary = button.mode === "0x0";

    if (isMomentary) {
      // Momentary button - deactivate on mouse up
      setButtons((prev) =>
        prev.map((btn) => (btn.id === id ? { ...btn, active: false } : btn)),
      );
    }
  };

  // Handle mouse leave for momentary buttons (in case user drags off button)
  const handleMouseLeave = (id: number) => {
    const button = buttons[id];
    if (!button) return;

    const isMomentary = button.mode === "0x0";

    if (isMomentary && button.active) {
      // Deactivate momentary button if mouse leaves while pressed
      setButtons((prev) =>
        prev.map((btn) => (btn.id === id ? { ...btn, active: false } : btn)),
      );
    }
  };

  const handlePianoKeyPress = async (note: number) => {
    // Note 36 sends 0x00, notes 37-47 send 0x25-0x2f
    let noteHex: string;
    if (note === 36) {
      noteHex = '0x00';
    } else {
      noteHex = `0x${note.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    const midiCommand = `0xBD,0x73,${noteHex}`;
    
    // Send the MIDI command
    await sendMIDI(midiCommand);
  };
  const getButtonColor = (button: ButtonState) => {
    const isLight = button.color.toLowerCase() === "#ffffff";
    const textColor = isLight ? "text-black" : "text-white";
    const borderColor = button.active ? "border-white" : "border-gray-600";

    // For black buttons, we need to lighten the background to show activity
    // For colored buttons, we increase brightness
    const isBlack = button.color === "#000000";
    const activeStyle = button.active
      ? isBlack
        ? { backgroundColor: "#333333" }
        : { filter: "brightness(1.4)" }
      : {};

    return {
      className: `border-2 ${borderColor} ${textColor}`,
      style: {
        backgroundColor: button.color,
        ...activeStyle,
      },
    };
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case "0x0":
        return "Momentary";
      case "0x1":
        return "Toggle";
      case "0x2":
        return "Latching";
      case "0x4":
        return "Toggle Alt";
      case "0x5":
        return "Special";
      case "0x12":
        return "Special 2";
      default:
        return mode;
    }
  };

  // Get display label for group 2 buttons with blinking
  const getDisplayLabel = (button: ButtonState) => {
    // Navigation buttons (refs 82-86) - make arrows red/black in API mode
    if (button.ref && [82, 83, 84, 85, 86].includes(button.ref)) {
      const lines = button.label.split('\n');
      return (
        <div className="flex flex-col items-center justify-center">
          {lines.map((line, idx) => {
            // Check if line contains arrows
            const isArrowLine = line.includes('<<<') || line.includes('>>>') || line.includes('<=>');
            let arrowColor = undefined;
            if (isArrowLine && midiControlMode === 'api') {
              // SECTION PREV (ref 84) has red button, use black for visibility
              arrowColor = button.ref === 84 ? '#000000' : '#FF0000';
            }
            return (
              <span 
                key={idx}
                style={arrowColor ? { color: arrowColor } : undefined}
              >
                {line}
              </span>
            );
          })}
        </div>
      );
    }

    if (button.group === 2 && button.active) {
      // Button 104: "Live\nPerf\nCh01" - entire label blinks
      if (button.id === 104) {
        return <span className="animate-pulse">{button.label}</span>;
      }
      // Button 105: "Ch 02\nor\nCh 12" - toggle between blinking Ch02 or Ch12
      if (button.id === 105) {
        return (
          <div className="flex flex-col items-center justify-center">
            <span className={button.subState === 1 ? "animate-pulse text-yellow-300" : "text-white"}>Ch 02</span>
            <span className="text-white">or</span>
            <span className={button.subState === 0 ? "animate-pulse text-yellow-300" : "text-white"}>Ch 12</span>
          </div>
        );
      }
      // Button 112: "Ch 03\nOr\nCh 13" - toggle between blinking Ch03 or Ch13
      if (button.id === 112) {
        return (
          <div className="flex flex-col items-center justify-center">
            <span className={button.subState === 1 ? "animate-pulse text-yellow-300" : "text-white"}>Ch 03</span>
            <span className="text-white">Or</span>
            <span className={button.subState === 0 ? "animate-pulse text-yellow-300" : "text-white"}>Ch 13</span>
          </div>
        );
      }
    }
    return button.label;
  };

  const renderGrid = (startIdx: number, endIdx: number) => {
    const gridButtons = buttons.slice(startIdx, endIdx);
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          gap: "2px",
          width: "100%",
          height: "100%",
        }}
      >
        {gridButtons.map((button) => (
          <button
            key={button.id}
            onMouseDown={() => handleMouseDown(button.id)}
            onMouseUp={() => handleMouseUp(button.id)}
            onMouseLeave={() => handleMouseLeave(button.id)}
            className={`
              ${getButtonColor(button).className}
              rounded-md text-xs font-bold
              hover:brightness-110 transition-all duration-100
              flex items-center justify-center p-1
              shadow-md whitespace-pre-line leading-tight
              select-none cursor-pointer
              ${button.mode === "0x0" ? "active:scale-95" : ""}
              relative
            `}
            style={{
              containerType: "inline-size",
              fontSize: "clamp(8px, 15cqw, 22px)",
              width: "100%",
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              ...getButtonColor(button).style,
            } as React.CSSProperties}
            title={`MIDI: ${button.midi}\nMode: ${getModeLabel(
              button.mode,
            )}${button.group ? `\nGroup: ${button.group}` : ""}${button.group === 2 && button.subState !== undefined ? `\nSubState: ${button.subState}` : ""}`}
          >
            {button.ref !== undefined && (
              <span
                className="absolute left-1 top-0"
                style={{ fontSize: "clamp(6px, 8cqw, 10px)" }}
              >
                {button.ref}
              </span>
            )}
            {getDisplayLabel(button)}
          </button>
        ))}
      </div>
    );
  };

  const handleVelocitySelect = async (velocity: number) => {
    // Convert velocity to hex (0x00 to 0x7F format)
    const velocityHex = `0x${velocity.toString(16).toUpperCase().padStart(2, '0')}`;
    const midiCommand = `${velocityPickerMidiBase},${velocityHex}`;

    // Send the MIDI command
    await sendMIDI(midiCommand);

    // Close the overlay
    setVelocityPickerOpen(false);
  };

  return (
    <div className="w-screen flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
      {/* Header with Nav */}
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #ccc", padding: "0.5rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: "0.75rem" }}>
        <h1 style={{ margin: 0, color: "#556b2f", fontSize: "1.1rem" }}>MIDI Controller</h1>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: "bold",
            padding: "0.15rem 0.6rem",
            borderRadius: "999px",
            color: "#fff",
            backgroundColor:
              midiPortStatus === "connected" ? "#2e7d32" :
              midiPortStatus === "checking" ? "#888" :
              "#c62828",
            whiteSpace: "nowrap",
          }}
          title="Web MIDI looks for an output port named exactly 'LMP_TAB'"
        >
          {midiPortStatus === "connected" && "● LMP_TAB connected"}
          {midiPortStatus === "checking" && "● Checking MIDI…"}
          {midiPortStatus === "not-found" && "○ LMP_TAB not found"}
          {midiPortStatus === "denied" && "○ MIDI access denied"}
          {midiPortStatus === "unsupported" && "○ Browser has no Web MIDI"}
        </div>
        <Nav />
      </div>

      <div className="flex-1 flex items-center justify-center p-1 min-h-0" style={{ overflow: "hidden" }}>
        <div className="midi-grid w-full h-full" style={{ overflow: "hidden" }}>
          {/* Grid A */}
          <div className="w-full h-full" style={{ overflow: "hidden" }}>{renderGrid(0, 64)}</div>
          {/* Grid B */}
          <div className="w-full h-full" style={{ overflow: "hidden" }}>{renderGrid(64, 128)}</div>
        </div>
      </div>

      {/* Velocity Picker Overlay */}
      {velocityPickerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setVelocityPickerOpen(false)}
        >
          <div
            className="bg-gray-900 p-6 rounded-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '95vw', height: '90vh' }}
          >
            <h2 className="text-white text-2xl font-bold mb-4 text-center">Select Velocity (0-127)</h2>
            <div
              className="grid grid-cols-2 gap-4 w-full"
              style={{ height: 'calc(90vh - 8rem)' }}
            >
              {/* Left 8x8 Grid (0-63) - Lighter Grey */}
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gridTemplateRows: 'repeat(8, 1fr)'
                }}
              >
                {Array.from({ length: 64 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => handleVelocitySelect(i)}
                    className="bg-gray-500 hover:bg-gray-400 text-white font-bold rounded transition-colors flex items-center justify-center"
                    title={`Velocity: ${i} (0x${i.toString(16).toUpperCase().padStart(2, '0')})`}
                  >
                    {i}
                  </button>
                ))}
              </div>

              {/* Right 8x8 Grid (64-127) - Darker Grey */}
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gridTemplateRows: 'repeat(8, 1fr)'
                }}
              >
                {Array.from({ length: 64 }, (_, i) => (
                  <button
                    key={i + 64}
                    onClick={() => handleVelocitySelect(i + 64)}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold rounded transition-colors flex items-center justify-center"
                    title={`Velocity: ${i + 64} (0x${(i + 64).toString(16).toUpperCase().padStart(2, '0')})`}
                  >
                    {i + 64}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setVelocityPickerOpen(false)}
              className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Piano Submenu Overlay */}
      {pianoSubmenuOpen && (
        <PianoSubmenu
          onClose={() => setPianoSubmenuOpen(false)}
          onKeyPress={handlePianoKeyPress}
        />
      )}

      {/* Song Jump Menu Overlay */}
      {songJumpMenuOpen && (
        <SongJumpMenu
          onClose={() => setSongJumpMenuOpen(false)}
          medleySongs={medleySongs}
          onJump={handleSongJump}
        />
      )}
    </div>
  );
};

export default MidiController;
