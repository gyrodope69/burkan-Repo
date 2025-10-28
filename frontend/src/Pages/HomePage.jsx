import React, { useState, useRef, useEffect } from "react";
import "./HomePage.css";

const SILENCE_THRESHOLD = 0.01;
const SILENCE_TIMEOUT = 1500;

const HomePage = () => {
  const [status, setStatus] = useState("Ready to start");
  const [connected, setConnected] = useState(false);
  const [waitingForAI, setWaitingForAI] = useState(false);
  const [partialSubtitle, setPartialSubtitle] = useState("");
  const [finalSubtitle, setFinalSubtitle] = useState("");
  const [llmReply, setLlmReply] = useState("");
  
  const ws = useRef(null);
  const mediaRecorder = useRef(null);
  const streamRef = useRef(null);
  const vadProcessor = useRef(null);
  const audioQueue = useRef([]);
  const audioRef = useRef(new Audio());
  const audioContext = useRef(null);
  const sourceRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupMedia();
  }, []);

  const cleanupMedia = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    if (ws.current) ws.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (vadProcessor.current) {
      vadProcessor.current.scriptProcessor.disconnect();
      vadProcessor.current.microphone.disconnect();
      vadProcessor.current.audioContext.close();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setConnected(false);
  };

  const startVAD = (stream) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    const mic = audioCtx.createMediaStreamSource(stream);
    const scriptProc = audioCtx.createScriptProcessor(2048, 1, 1);
    mic.connect(analyser);
    analyser.connect(scriptProc);
    scriptProc.connect(audioCtx.destination);

    let speaking = false;
    let silenceStart = null;

    scriptProc.onaudioprocess = () => {
      const arr = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(arr);
      const volume = arr.reduce((a, b) => a + b, 0) / arr.length / 255;
      if (volume > SILENCE_THRESHOLD) {
        speaking = true;
        silenceStart = null;
      } else if (speaking) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
          console.log("Detected silence — auto-ending");
          scriptProc.disconnect();
          mic.disconnect();
          audioCtx.close();
          // Optionally trigger endCall() here
        }
      }
    };
    vadProcessor.current = { audioContext: audioCtx, analyser, scriptProcessor: scriptProc, microphone: mic };
  };

  const startCall = async () => {
    setStatus("Requesting microphone access...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startVAD(stream);

      ws.current = new WebSocket(`ws://127.0.0.1:8000/ws/voice/${Math.random().toString(36).slice(2, 9)}`);
      ws.current.binaryType = "arraybuffer";

      ws.current.onopen = () => {
        setConnected(true);
        setStatus("Connected");
        startStreaming(stream);
      };

      ws.current.onmessage = async (event) => {
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript") {
            if (msg.is_final) {
              setFinalSubtitle((prev) => (prev ? prev + " " : "") + msg.text);
              setPartialSubtitle("");
              setLlmReply("");
              setWaitingForAI(true);
            } else {
              setPartialSubtitle(msg.text);
            }
          } else if (msg.type === "llm_token") {
            setWaitingForAI(false);
            setLlmReply((prev) => prev + msg.text);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Handle live TTS audio playback
          await handleIncomingAudio(event.data);
        }
      };

      ws.current.onclose = () => {
        setConnected(false);
        setStatus("Call ended");
      };

      ws.current.onerror = () => {
        setStatus("WebSocket Error");
      };
    } catch {
      setStatus("Microphone access denied");
    }
  };

  const handleIncomingAudio = async (data) => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const buffer = await audioContext.current.decodeAudioData(data);
      const source = audioContext.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.current.destination);
      source.start();
      sourceRef.current = source;
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  };

  const startStreaming = (stream) => {
    mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.current.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
        event.data.arrayBuffer().then((buf) => ws.current.send(buf));
      }
    };
    mediaRecorder.current.start(500);
  };

  const endCall = () => {
    cleanupMedia();
    setStatus("Ready to start");
    setLlmReply("");
    setPartialSubtitle("");
    setFinalSubtitle("");
    setWaitingForAI(false);
  };

  return (
    <div className="container">
      <h1 className="title">AI Assistant Demo</h1>
      <h2 className="subtitle">
        Converse naturally with real-time AI responses and speech synthesis playback
      </h2>

      <div className="status-box">
        <div className="status-main">
          Status:{" "}
          <span
            className={
              status.includes("Connected")
                ? "status-green"
                : status.includes("ended")
                ? "status-red"
                : ""
            }
          >
            {status}
          </span>
        </div>

        {connected && <div className="mic-row">🎤 Listening...</div>}

        <div className="transcript-display">
          {finalSubtitle} <span className="partial">{partialSubtitle}</span>
        </div>

        {waitingForAI && <div className="ai-waiting">AI is generating a reply...</div>}

        <div className="llm-reply-display">
          {llmReply && (
            <>
              <hr />
              <strong>AI:</strong> {llmReply}
            </>
          )}
        </div>
      </div>

      <div className="button-bar">
        <button onClick={startCall} disabled={connected} className="call-btn gradient">
          📞 Start Call
        </button>
        <button onClick={endCall} disabled={!connected} className="end-btn">
          📶 End Call
        </button>
      </div>
    </div>
  );
};

export default HomePage;
