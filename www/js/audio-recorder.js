// Audio Recorder helper for recitation checks
class QuranAudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordings = [null, null, null]; // Slot 0, 1, 2
    this.currentRecordingSlot = 0;
    this.isRecording = false;
    this.timerInterval = null;
    this.startTime = 0;
  }

  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async startRecording(slotIndex = 0, onTimerUpdate, onStopCallback) {
    if (!this.isSupported()) {
      alert('المتصفح لا يدعم ميزة تسجيل الصوت المباشر.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.currentRecordingSlot = slotIndex;
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordings[this.currentRecordingSlot] = audioUrl;
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());

        if (onStopCallback) {
          onStopCallback(this.currentRecordingSlot, audioUrl);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.startTime = Date.now();

      if (onTimerUpdate) {
        this.timerInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
          const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
          const secs = String(elapsed % 60).padStart(2, '0');
          onTimerUpdate(`${mins}:${secs}`);
        }, 500);
      }

      return true;
    } catch (err) {
      console.error('Microphone error:', err);
      alert('يرجى التأكد من السماح بالوصول إلى الميكروفون في المتصفح.');
      return false;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      clearInterval(this.timerInterval);
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  deleteRecording(slotIndex) {
    if (this.recordings[slotIndex]) {
      try {
        URL.revokeObjectURL(this.recordings[slotIndex]);
      } catch (e) {}
      this.recordings[slotIndex] = null;
    }
  }

  getRecording(slotIndex) {
    return this.recordings[slotIndex];
  }
}

window.quranRecorder = new QuranAudioRecorder();
