(() => {
  const files = [];
  const list = document.getElementById('attachment-list');
  const recorderButton = document.getElementById('record-audio');
  const recordingState = document.getElementById('recording-state');
  let recorder = null;
  let mediaStream = null;
  let chunks = [];

  const formatSize = bytes => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  function render() {
    if (!list) return;
    list.replaceChildren();
    files.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      const name = document.createElement('span');
      name.className = 'attachment-name';
      name.textContent = `${file.name} · ${formatSize(file.size)}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.addEventListener('click', () => { files.splice(index, 1); render(); });
      chip.append(name, remove);
      list.append(chip);
    });
  }

  function addFiles(fileList) {
    const incoming = [...(fileList || [])];
    const accepted = incoming.filter(file => file.size <= 100 * 1024 * 1024);
    const tooLarge = incoming.length - accepted.length;
    const slots = Math.max(0, 20 - files.length);
    files.push(...accepted.slice(0, slots));
    render();
    if (tooLarge) alert('Files larger than 100 MB were skipped.');
    if (accepted.length > slots) alert('The composer can attach up to 20 files at once.');
  }

  document.getElementById('choose-files')?.addEventListener('click', () => document.getElementById('local-files')?.click());
  document.getElementById('choose-camera')?.addEventListener('click', () => document.getElementById('camera-file')?.click());
  document.getElementById('choose-video')?.addEventListener('click', () => document.getElementById('video-file')?.click());
  for (const id of ['local-files', 'camera-file', 'video-file']) {
    document.getElementById(id)?.addEventListener('change', event => {
      addFiles(event.currentTarget.files);
      event.currentTarget.value = '';
    });
  }

  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      recordingState.textContent = 'Voice recording is not supported in this browser.';
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      chunks = [];
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        const type = recorder.mimeType || 'audio/webm';
        const extension = type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File(chunks, `voice-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type });
        if (file.size) addFiles([file]);
        mediaStream?.getTracks().forEach(track => track.stop());
        mediaStream = null;
        recorder = null;
        chunks = [];
        recorderButton.setAttribute('aria-pressed', 'false');
        recorderButton.querySelector('.tool-name').textContent = 'Voice';
        recordingState.textContent = file.size ? 'Voice note attached.' : 'No audio was captured.';
      }, { once: true });
      recorder.start();
      recorderButton.setAttribute('aria-pressed', 'true');
      recorderButton.querySelector('.tool-name').textContent = 'Stop';
      recordingState.textContent = 'Recording… select Stop when finished.';
    } catch {
      recordingState.textContent = 'Microphone access was unavailable or declined.';
    }
  }

  recorderButton?.addEventListener('click', () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else beginRecording();
  });

  window.FrameforgeComposer = {
    getPendingFiles: () => [...files],
    clear: () => { files.splice(0, files.length); render(); recordingState.textContent = ''; },
  };
})();
