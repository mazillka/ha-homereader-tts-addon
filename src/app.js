/* ============================================================
   HomeReader — Application Logic (Web Speech API TTS)
   ============================================================ */

(function () {
  "use strict";

  // ---- DOM Refs ----
  const textInput = document.getElementById("text-input");
  const charCount = document.getElementById("char-count");
  const voiceSelect = document.getElementById("voice-select");
  const rateSlider = document.getElementById("rate-slider");
  const rateValue = document.getElementById("rate-value");
  const pitchSlider = document.getElementById("pitch-slider");
  const pitchValue = document.getElementById("pitch-value");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeValue = document.getElementById("volume-value");
  const btnPlay = document.getElementById("btn-play");
  const btnStop = document.getElementById("btn-stop");
  const btnSkip = document.getElementById("btn-skip");
  const btnClear = document.getElementById("btn-clear");
  const btnPaste = document.getElementById("btn-paste");
  const btnSample = document.getElementById("btn-sample");
  const btnImport = document.getElementById("btn-import");
  const fileInput = document.getElementById("file-input");
  const playIcon = document.getElementById("play-icon");
  const pauseIcon = document.getElementById("pause-icon");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const progressCounter = document.getElementById("progress-counter");
  const waveformEl = document.getElementById("waveform");

  // ---- State ----
  const synth = window.speechSynthesis;
  let voices = [];
  let utterances = []; // array of { utterance, start, end }
  let currentIndex = 0;
  let isSpeaking = false;
  let isPaused = false;
  let savedSelection = null;
  let textareaMeasure = null;
  let activeProgressRange = null;
  let isRestoringLockedSelection = false;
  let lockedSelectionRestoreQueued = false;

  // ---- Sample Texts ----
  const sampleTexts = [
    `The cosmos is within us. We are made of star-stuff. We are a way for the universe to know itself. Billions upon billions of stars shine across the observable universe, each one a sun with the potential for worlds beyond imagination.`,
    `In the heart of an ancient forest, where sunlight barely reached the ground, a stream whispered secrets to the moss-covered stones. Every drop of water carried the memory of mountains it had traveled, shaping the earth with patient, ceaseless devotion.`,
    `Artificial intelligence is not just about building smarter machines. It's about augmenting human capability, unlocking creativity, and solving problems that have puzzled humanity for generations. The future belongs to those who learn to collaborate with intelligent systems.`,
    `The art of cooking is a symphony of senses. The sizzle of butter in a hot pan, the fragrance of fresh herbs, the vibrant colors of seasonal vegetables — each element plays its part in creating something greater than the sum of its ingredients.`,
    `Time moves differently in the mountains. Hours stretch like the valleys below, and the silence between heartbeats feels infinite. Up here, above the clouds, you understand that the world is both impossibly vast and intimately small.`,
  ];

  // ---- Waveform Bars ----
  const BAR_COUNT = 48;
  function initWaveform() {
    waveformEl.innerHTML = "";
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = document.createElement("div");
      bar.classList.add("bar");
      bar.style.height = "6px";
      // Stagger the max height for a nice wave shape
      const maxH = 12 + Math.sin((i / BAR_COUNT) * Math.PI) * 36;
      bar.style.setProperty("--max-h", `${maxH}px`);
      bar.style.animationDelay = `${(i * 0.04).toFixed(2)}s`;
      waveformEl.appendChild(bar);
    }
  }
  initWaveform();

  // ---- Toast Utility ----
  let toastTimer;
  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.classList.add("visible");
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
    });
  }

  // ---- Voice Loading ----
  function loadVoices() {
    voices = synth.getVoices();
    if (!voices.length) return;

    voiceSelect.innerHTML = "";

    // Sort: prioritize English, then by name
    const sorted = [...voices].sort((a, b) => {
      const aEn = a.lang.startsWith("en");
      const bEn = b.lang.startsWith("en");
      if (aEn && !bEn) return -1;
      if (!aEn && bEn) return 1;
      return a.name.localeCompare(b.name);
    });

    // Group by language
    const groups = {};
    sorted.forEach((v) => {
      const langTag = v.lang.split("-")[0].toUpperCase();
      if (!groups[langTag]) groups[langTag] = [];
      groups[langTag].push(v);
    });

    Object.keys(groups).forEach((lang) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = lang;
      groups[lang].forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.name;
        const quality = v.localService ? "🖥️" : "☁️";
        opt.textContent = `${quality} ${v.name} (${v.lang})`;
        optgroup.appendChild(opt);
      });
      voiceSelect.appendChild(optgroup);
    });

    // Try to pick a nice default
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.toLowerCase().includes("natural") ||
          v.name.toLowerCase().includes("neural") ||
          v.name.toLowerCase().includes("enhanced")),
    );
    const fallback =
      voices.find((v) => v.lang.startsWith("en") && v.default) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0];

    const defaultVoice = preferred || fallback;
    if (defaultVoice) {
      voiceSelect.value = defaultVoice.name;
    }
  }

  // Chrome needs this event; Firefox/Safari populate immediately
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
  }
  loadVoices();
  
  // Android WebView fallback: poll for voices if they don't load immediately
  let voicePollCount = 0;
  function pollVoices() {
    if (voices.length > 0) return; // Stop polling once loaded
    loadVoices();
    if (voices.length === 0 && voicePollCount < 20) {
      voicePollCount++;
      setTimeout(pollVoices, 250); // Poll every 250ms, up to 5 seconds
    }
  }
  pollVoices();

  // ---- Helpers ----
  function getSelectedVoice() {
    return voices.find((v) => v.name === voiceSelect.value) || voices[0];
  }

  function splitSentences(text) {
    // Split on sentence-ending punctuation while keeping the delimiter
    // Use replace to avoid RegExp lookbehinds which crash older Android WebViews
    return text
      .replace(/([.!?…])\s+/g, "$1\n")
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Split text into paragraphs, then sentences within each paragraph.
  // Returns { paragraphs: [{ text, sentences: [{ text, globalIndex }] }], allSentences: string[] }
  function splitTextStructured(text) {
    const paragraphs = text
      .split(/\n\s*\n|\n/)
      .filter((p) => p.trim().length > 0);
    const allSentences = [];
    const structured = paragraphs.map((para) => {
      const sentences = para
        .replace(/([.!?…])\s+/g, "$1\n")
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // If no sentence-ending punctuation, treat the whole paragraph as one sentence
      const resolved = sentences.length > 0 ? sentences : [para.trim()];
      const mapped = resolved.map((s) => {
        const idx = allSentences.length;
        allSentences.push(s);
        return { text: s, globalIndex: idx };
      });
      return { text: para, sentences: mapped };
    });
    return { paragraphs: structured, allSentences };
  }

  function getSentenceProgressData(text) {
    const paragraphs = text
      .split(/\n\s*\n|\n/)
      .filter((p) => p.trim().length > 0);
    const allSentences = [];
    let paragraphSearchStart = 0;

    paragraphs.forEach((para) => {
      const paragraphStart = text.indexOf(para, paragraphSearchStart);
      if (paragraphStart === -1) return;
      paragraphSearchStart = paragraphStart + para.length;

      const sentences = para
        .replace(/([.!?â€¦])\s+/g, "$1\n")
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const resolved = sentences.length > 0 ? sentences : [para.trim()];
      let sentenceSearchStart = paragraphStart;

      resolved.forEach((sentence) => {
        const start = text.indexOf(sentence, sentenceSearchStart);
        if (start === -1) return;

        const end = start + sentence.length;
        sentenceSearchStart = end;
        allSentences.push({ text: sentence, start, end });
      });
    });

    return allSentences;
  }

  function setTextLocked(locked) {
    textInput.readOnly = locked;
    textInput.classList.toggle("is-locked", locked);
    textInput.setAttribute("aria-readonly", String(locked));

    btnClear.disabled = locked;
    btnPaste.disabled = locked;
    btnImport.disabled = locked;
    btnSample.disabled = locked;
  }

  function focusProgressRange(start, end) {
    activeProgressRange = { start, end };
    textInput.focus({ preventScroll: true });
    textInput.setSelectionRange(start, end, "forward");
    scrollRangeIntoView(start, end);
  }

  function hasLockedProgressRange() {
    return textInput.readOnly && activeProgressRange && (isSpeaking || isPaused);
  }

  function restoreLockedProgressRange() {
    if (!hasLockedProgressRange() || isRestoringLockedSelection) return;

    const { start, end } = activeProgressRange;
    if (textInput.selectionStart === start && textInput.selectionEnd === end) return;

    isRestoringLockedSelection = true;
    textInput.focus({ preventScroll: true });
    textInput.setSelectionRange(start, end, "forward");
    scrollRangeIntoView(start, end);
    requestAnimationFrame(() => {
      isRestoringLockedSelection = false;
    });
  }

  function scheduleLockedProgressRangeRestore() {
    if (!hasLockedProgressRange() || lockedSelectionRestoreQueued) return;

    lockedSelectionRestoreQueued = true;
    requestAnimationFrame(() => {
      lockedSelectionRestoreQueued = false;
      restoreLockedProgressRange();
    });
  }

  function getTextareaMeasure() {
    if (textareaMeasure) return textareaMeasure;

    textareaMeasure = document.createElement("div");
    textareaMeasure.setAttribute("aria-hidden", "true");
    textareaMeasure.style.position = "absolute";
    textareaMeasure.style.visibility = "hidden";
    textareaMeasure.style.pointerEvents = "none";
    textareaMeasure.style.left = "-9999px";
    textareaMeasure.style.top = "0";
    textareaMeasure.style.whiteSpace = "pre-wrap";
    textareaMeasure.style.overflowWrap = "break-word";
    textareaMeasure.style.wordWrap = "break-word";
    textareaMeasure.style.overflow = "hidden";
    document.body.appendChild(textareaMeasure);

    return textareaMeasure;
  }

  function syncTextareaMeasureStyles() {
    const styles = window.getComputedStyle(textInput);
    const measure = getTextareaMeasure();
    const props = [
      "boxSizing",
      "width",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fontVariant",
      "fontStretch",
      "lineHeight",
      "letterSpacing",
      "textTransform",
      "textIndent",
      "textAlign",
      "tabSize",
    ];

    props.forEach((prop) => {
      measure.style[prop] = styles[prop];
    });

    measure.style.borderStyle = "solid";
    measure.style.height = "auto";
  }

  function getRangeVerticalPosition(start, end) {
    syncTextareaMeasureStyles();

    const measure = getTextareaMeasure();
    const before = document.createTextNode(textInput.value.slice(0, start));
    const active = document.createElement("span");
    const after = document.createTextNode(textInput.value.slice(end));

    active.textContent = textInput.value.slice(start, end) || "\u200b";

    measure.replaceChildren(before, active, after);

    return {
      top: active.offsetTop,
      bottom: active.offsetTop + active.offsetHeight,
    };
  }

  function scrollRangeIntoView(start, end) {
    const { top, bottom } = getRangeVerticalPosition(start, end);
    const currentTop = textInput.scrollTop;
    const currentBottom = currentTop + textInput.clientHeight;
    const margin = Math.max(24, textInput.clientHeight * 0.18);

    if (top >= currentTop + margin && bottom <= currentBottom - margin) {
      return;
    }

    const targetTop = Math.max(0, top - textInput.clientHeight * 0.35);
    textInput.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }

  function getSentenceProgressRanges(text) {
    const paragraphs = text
      .split(/\n\s*\n|\n/)
      .filter((p) => p.trim().length > 0);
    const allSentences = [];
    let paragraphSearchStart = 0;

    paragraphs.forEach((para) => {
      const paragraphStart = text.indexOf(para, paragraphSearchStart);
      if (paragraphStart === -1) return;
      paragraphSearchStart = paragraphStart + para.length;

      const sentences = para
        .replace(/([.!?\u2026])\s+/g, "$1\n")
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const resolved = sentences.length > 0 ? sentences : [para.trim()];
      let sentenceSearchStart = paragraphStart;

      resolved.forEach((sentence) => {
        const start = text.indexOf(sentence, sentenceSearchStart);
        if (start === -1) return;

        const end = start + sentence.length;
        sentenceSearchStart = end;
        allSentences.push({ text: sentence, start, end });
      });
    });

    return allSentences;
  }

  function updateUI(state) {
    // state: 'idle' | 'speaking' | 'paused'
    if (state === "speaking") {
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
      btnPlay.classList.add("speaking");
      waveformEl.classList.add("active");
      progressText.textContent = "Speaking…";
      setTextLocked(true);
    } else if (state === "paused") {
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      btnPlay.classList.remove("speaking");
      waveformEl.classList.remove("active");
      progressText.textContent = "Paused";
      setTextLocked(true);
    } else {
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      btnPlay.classList.remove("speaking");
      waveformEl.classList.remove("active");
      progressBar.style.width = "0%";
      progressText.textContent = "Ready";
      progressCounter.textContent = "";
      setTextLocked(false);
      activeProgressRange = null;

      if (savedSelection) {
        textInput.setSelectionRange(savedSelection.start, savedSelection.end, savedSelection.direction);
        savedSelection = null;
      } else {
        textInput.setSelectionRange(0, 0);
      }
    }
  }

  function updateProgress() {
    if (utterances.length === 0) return;
    const pct = ((currentIndex + 1) / utterances.length) * 100;
    progressBar.style.width = `${pct}%`;
    progressCounter.textContent = `${currentIndex + 1} / ${utterances.length}`;
  }

  // ---- Speech Engine ----
  function speakAll() {
    const text = textInput.value.trim();
    if (!text) {
      showToast("Type or paste some text first");
      textInput.focus();
      return;
    }

    stopSpeech();

    savedSelection = {
      start: textInput.selectionStart,
      end: textInput.selectionEnd,
      direction: textInput.selectionDirection || "none",
    };

    const allSentences = getSentenceProgressRanges(textInput.value);
    utterances = allSentences.map((sentence) => {
      const utt = new SpeechSynthesisUtterance(sentence.text);
      utt.voice = getSelectedVoice();
      utt.rate = parseFloat(rateSlider.value);
      utt.pitch = parseFloat(pitchSlider.value);
      utt.volume = parseFloat(volumeSlider.value);
      return { utterance: utt, start: sentence.start, end: sentence.end };
    });

    currentIndex = 0;
    isSpeaking = true;
    isPaused = false;

    updateUI("speaking");
    speakNext();
  }

  function speakNext() {
    if (currentIndex >= utterances.length) {
      // Done
      isSpeaking = false;
      isPaused = false;
      updateUI("idle");
      showToast("Finished reading ✓");
      return;
    }

    const current = utterances[currentIndex];
    const utt = current.utterance;

    utt.onstart = () => {
      updateProgress();
      focusProgressRange(current.start, current.end);
    };

    utt.onend = () => {
      currentIndex++;
      speakNext();
    };

    utt.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      console.error("Speech error:", e);
      currentIndex++;
      speakNext();
    };

    synth.speak(utt);
  }

  function stopSpeech() {
    synth.cancel();
    isSpeaking = false;
    isPaused = false;
    utterances = [];
    currentIndex = 0;
    updateUI("idle");
  }

  function togglePlayPause() {
    if (!isSpeaking && !isPaused) {
      speakAll();
      return;
    }

    if (isPaused) {
      synth.resume();
      isPaused = false;
      updateUI("speaking");
    } else {
      synth.pause();
      isPaused = true;
      updateUI("paused");
    }
  }

  function skipSentence() {
    if (!isSpeaking) return;
    synth.cancel(); // triggers onend → speakNext moves forward
  }

  function applySettingsToRemaining() {
    if (utterances.length === 0) return;
    const voice = getSelectedVoice();
    const rate = parseFloat(rateSlider.value);
    const pitch = parseFloat(pitchSlider.value);
    const volume = parseFloat(volumeSlider.value);
    
    // Update all existing utterances with the new settings
    for (let i = currentIndex; i < utterances.length; i++) {
      utterances[i].utterance.voice = voice;
      utterances[i].utterance.rate = rate;
      utterances[i].utterance.pitch = pitch;
      utterances[i].utterance.volume = volume;
    }
  }

  function restartCurrentSentence() {
    if (!isSpeaking || isPaused || currentIndex >= utterances.length) return;
    // Cancel current speech. The onerror handler catches the 'canceled' event and prevents auto-advance.
    synth.cancel();
    
    // Restart the current sentence with new settings after a tiny delay
    setTimeout(() => {
      if (isSpeaking && !isPaused) {
        speakNext();
      }
    }, 50);
  }

  // Bind settings changes to apply immediately
  voiceSelect.addEventListener("change", () => {
    applySettingsToRemaining();
    restartCurrentSentence();
  });

  rateSlider.addEventListener("change", () => {
    applySettingsToRemaining();
    restartCurrentSentence();
  });

  pitchSlider.addEventListener("change", () => {
    applySettingsToRemaining();
    restartCurrentSentence();
  });

  volumeSlider.addEventListener("change", () => {
    applySettingsToRemaining();
    restartCurrentSentence();
  });

  // ---- Event Listeners ----

  // Play / Pause
  btnPlay.addEventListener("click", togglePlayPause);

  // Stop
  btnStop.addEventListener("click", () => {
    stopSpeech();
    showToast("Stopped");
  });

  // Skip
  btnSkip.addEventListener("click", () => {
    if (!isSpeaking) {
      showToast("Nothing is playing");
      return;
    }
    skipSentence();
  });

  // Clear
  btnClear.addEventListener("click", () => {
    stopSpeech();
    textInput.value = "";
    charCount.textContent = "0 characters";
    textInput.focus();
  });

  // Paste
  btnPaste.addEventListener("click", async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        textInput.value = clip;
        charCount.textContent = `${clip.length.toLocaleString()} characters`;
        showToast("Pasted from clipboard");
      }
    } catch {
      showToast("Could not access clipboard");
    }
  });

  // Sample
  btnSample.addEventListener("click", () => {
    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    textInput.value = text;
    charCount.textContent = `${text.length.toLocaleString()} characters`;
    showToast("Sample text loaded");
  });

  // Import from file
  btnImport.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      let text = ev.target.result;

      // Strip HTML tags if it is an HTML file
      if (file.name.match(/\.html?$/i)) {
        const doc = new DOMParser().parseFromString(text, "text/html");
        text = doc.body.textContent || doc.body.innerText || "";
      }

      text = text.trim();
      if (!text) {
        showToast("File appears to be empty");
        return;
      }

      textInput.value = text;
      charCount.textContent = `${text.length.toLocaleString()} characters`;
      showToast("Imported " + file.name);
    };

    reader.onerror = () => {
      showToast("Failed to read file");
    };

    reader.readAsText(file);
    // Reset so the same file can be re-imported
    fileInput.value = "";
  });

  // Character count
  textInput.addEventListener("input", () => {
    const len = textInput.value.length;
    charCount.textContent = `${len.toLocaleString()} character${len !== 1 ? "s" : ""}`;
  });

  textInput.addEventListener("select", () => {
    restoreLockedProgressRange();
  });

  textInput.addEventListener("mouseup", () => {
    restoreLockedProgressRange();
  });

  textInput.addEventListener("touchend", () => {
    restoreLockedProgressRange();
  });

  textInput.addEventListener("keyup", () => {
    restoreLockedProgressRange();
  });

  textInput.addEventListener("focus", () => {
    restoreLockedProgressRange();
  });

  textInput.addEventListener("blur", () => {
    scheduleLockedProgressRangeRestore();
  });

  document.addEventListener("pointerup", () => {
    scheduleLockedProgressRangeRestore();
  });

  // Slider labels
  rateSlider.addEventListener("input", () => {
    rateValue.textContent = `${parseFloat(rateSlider.value).toFixed(1)}×`;
  });

  pitchSlider.addEventListener("input", () => {
    pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1);
  });

  volumeSlider.addEventListener("input", () => {
    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
  });

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Enter to play
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      togglePlayPause();
    }
    // Escape to stop
    if (e.key === "Escape" && isSpeaking) {
      e.preventDefault();
      stopSpeech();
    }
  });

  // Keep Chrome's speech alive (Chrome kills speech after ~15s of no interaction)
  let keepAliveInterval;
  function startKeepAlive() {
    clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, 12000);
  }

  function stopKeepAlive() {
    clearInterval(keepAliveInterval);
  }

  // Hook keep-alive into speech lifecycle
  // We attach keep-alive via MutationObserver on the play button
  const observer = new MutationObserver(() => {
    if (btnPlay.classList.contains("speaking")) {
      startKeepAlive();
    } else {
      stopKeepAlive();
    }
  });
  observer.observe(btnPlay, { attributes: true, attributeFilter: ["class"] });

  // ---- Init message ----
  if (!("speechSynthesis" in window)) {
    showToast("Your browser does not support speech synthesis");
    btnPlay.disabled = true;
  }
})();
