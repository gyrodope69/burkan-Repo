// import React, { useState, useRef, useEffect } from "react";
// import "./HomePage.css";

// const SILENCE_THRESHOLD = 0.01;  // Adjust: Lower = more sensitive
// const SILENCE_TIMEOUT = 1500;    // ms, how long silence until stop

// const HomePage = () => {
//   const [status, setStatus] = useState("Ready to start");
//   const [connected, setConnected] = useState(false);
//   const [waitingForAI, setWaitingForAI] = useState(false);
//   const [partialSubtitle, setPartialSubtitle] = useState("");
//   const [finalSubtitle, setFinalSubtitle] = useState("");
//   const [llmReply, setLlmReply] = useState("");
//   const ws = useRef(null);
//   const mediaRecorder = useRef(null);
//   const streamRef = useRef(null);
//   const vadProcessor = useRef(null);

//   useEffect(() => {
//     return () => {
//       cleanupMedia();
//     };
//     // eslint-disable-next-line
//   }, []);

//   const cleanupMedia = () => {
//     if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
//       mediaRecorder.current.stop();
//     }
//     if (ws.current) ws.current.close();
//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach((track) => track.stop());
//       streamRef.current = null;
//     }
//     if (vadProcessor.current) {
//       vadProcessor.current.scriptProcessor.disconnect();
//       vadProcessor.current.microphone.disconnect();
//       vadProcessor.current.audioContext.close();
//     }
//   };

//   // Voice Activity Detection + auto-stop logic
//   const startVAD = (stream) => {
//     const audioContext = new (window.AudioContext || window.webkitAudioContext)();
//     const analyser = audioContext.createAnalyser();
//     const microphone = audioContext.createMediaStreamSource(stream);
//     const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

//     microphone.connect(analyser);
//     analyser.connect(scriptProcessor);
//     scriptProcessor.connect(audioContext.destination);

//     let speaking = false;
//     let silenceStart = null;

//     scriptProcessor.onaudioprocess = () => {
//       const array = new Uint8Array(analyser.frequencyBinCount);
//       analyser.getByteFrequencyData(array);
//       const volume = array.reduce((a, b) => a + b) / array.length / 255;
//       if (volume > SILENCE_THRESHOLD) {
//         speaking = true;
//         silenceStart = null;
//       } else if (speaking) {
//         if (!silenceStart) silenceStart = Date.now();
//         else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
//           // Silence detected: auto-stop
//           scriptProcessor.disconnect();
//           microphone.disconnect();
//           audioContext.close();
//           // endCall(); // Auto-stop
//         }
//       }
//     };
//     vadProcessor.current = { audioContext, analyser, scriptProcessor, microphone };
//   };

//   const startCall = async () => {
//     setStatus("Requesting mic permission...");
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       streamRef.current = stream;
//       startVAD(stream);

//       ws.current = new WebSocket(
//         `ws://127.0.0.1:8000/ws/voice/${Math.random().toString(36).slice(2, 9)}`
//       );
//       ws.current.binaryType = "arraybuffer";

//       ws.current.onopen = () => {
//         setStatus("Call connected");
//         setConnected(true);
//         startStreaming(stream);
//       };

//       // ws.current.onmessage = (event) => {
//       //   const msg = JSON.parse(event.data);
//       //   if (msg.type === "transcript") {
//       //     if (msg.is_final) {
//       //       setFinalSubtitle(f => (f ? f + " " : "") + msg.text);
//       //       setPartialSubtitle("");
//       //       setLlmReply("");
//       //       setWaitingForAI(true);
//       //     } else {
//       //       setPartialSubtitle(msg.text);
//       //     }
//       //   } else if (msg.type === "llm_token") {
//       //     setWaitingForAI(false);
//       //     setLlmReply(prev => prev + msg.text);
//       //     if (msg.text.startsWith("[Gemini ERROR") || msg.text.startsWith("[No AI reply")) {
//       //       alert(msg.text); // show errors
//       //     }
//       //   }
//       // };

//       ws.current.onmessage = (event) => {
//       const msg = JSON.parse(event.data);
//       if (msg.type === "transcript") {
//         if (msg.is_final) {
//           setFinalSubtitle(f => (f ? f + " " : "") + msg.text);
//           setPartialSubtitle("");
//           setLlmReply("");  // <-- This clears previous Gemini reply for new turn
//           setWaitingForAI(true);
//         } else {
//           setPartialSubtitle(msg.text);
//         }
//       } else if (msg.type === "llm_token") {
//         setWaitingForAI(false);
//         setLlmReply(prev => prev + msg.text);  // Build streaming AI response
//         if (
//           msg.text.startsWith("[Gemini ERROR") ||
//           msg.text.startsWith("[No AI reply")
//         ) {
//           alert(msg.text);
//         }
//       }
//     };


//       ws.current.onclose = () => {
//         setConnected(false);
//         setStatus("Call ended");
//       };
//       ws.current.onerror = () => {
//         setStatus("WebSocket error");
//       };

//     } catch (err) {
//       setStatus("Microphone access denied");
//     }
//   };

//   const startStreaming = (stream) => {
//     mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
//     mediaRecorder.current.ondataavailable = (event) => {
//       if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
//         event.data.arrayBuffer().then((buffer) => ws.current.send(buffer));
//       }
//     };
//     mediaRecorder.current.start(500);
//   };

//   const endCall = () => {
//     cleanupMedia();
//     setPartialSubtitle("");
//     setFinalSubtitle("");
//     setLlmReply("");
//     setStatus("Ready to start");
//     setConnected(false);
//     setWaitingForAI(false);
//   };

//   return (
//     <div className="container">
//       <h1 className="title">AI Assistant Demo</h1>
//       <h2 className="subtitle">
//         Experience our AI-powered virtual assistant with natural conversation flow<br />
//         and intelligent task handling
//       </h2>

//       <div className="status-box">
//         <div className="status-main">
//           Status: <span className={status.includes("connected") ? "status-green" : status.includes("ended") ? "status-red" : ""}>{status}</span>
//         </div>
//         <div className="mic-row">
//           {connected ? (
//             <span role="img" aria-label="mic" className="mic-icon">🎤</span>
//           ) : null}
//         </div>
//         <div className="transcript-display">
//           {finalSubtitle} <span className="partial">{partialSubtitle}</span>
//         </div>
//         {waitingForAI && <div className="ai-waiting">AI is formulating a reply...</div>}
//         <div className="llm-reply-display">
//           {llmReply && (
//             <>
//               <hr />
//               <strong>AI:</strong> {llmReply}
//             </>
//           )}
//         </div>
//       </div>
//       <div className="button-bar">
//         <button className="call-btn gradient" onClick={startCall} disabled={connected || status === "Requesting mic permission..."}>
//           <span role="img" aria-label="call">📞</span> Start Call
//         </button>
//         <button className="end-btn" onClick={endCall} disabled={!connected}>
//           <span role="img" aria-label="end">📶</span> End Call
//         </button>
//       </div>
//     </div>
//   );
// };

// export default HomePage;


// CODE - 2
// import React, { useState, useRef, useEffect } from "react";
// import "./HomePage.css";

// const SILENCE_THRESHOLD = 0.01;
// const SILENCE_TIMEOUT = 1500;

// const HomePage = () => {
//   const [status, setStatus] = useState("Ready to start");
//   const [connected, setConnected] = useState(false);
//   const [waitingForAI, setWaitingForAI] = useState(false);
//   const [partialSubtitle, setPartialSubtitle] = useState("");
//   const [finalSubtitle, setFinalSubtitle] = useState("");
//   const [llmReply, setLlmReply] = useState("");
//   const ws = useRef(null);
//   const mediaRecorder = useRef(null);
//   const streamRef = useRef(null);
//   const vadProcessor = useRef(null);
//   const audioChunks = useRef([]);
//   const audioRef = useRef(null);

//   useEffect(() => {
//     return () => {
//       cleanupMedia();
//     };
//   }, []);

//   const cleanupMedia = () => {
//     if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
//       mediaRecorder.current.stop();
//     }
//     if (ws.current) ws.current.close();
//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach((t) => t.stop());
//       streamRef.current = null;
//     }
//     if (vadProcessor.current) {
//       vadProcessor.current.scriptProcessor.disconnect();
//       vadProcessor.current.microphone.disconnect();
//       vadProcessor.current.audioContext.close();
//     }
//   };

//   const startVAD = (stream) => {
//     const audioContext = new (window.AudioContext || window.webkitAudioContext)();
//     const analyser = audioContext.createAnalyser();
//     const microphone = audioContext.createMediaStreamSource(stream);
//     const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

//     microphone.connect(analyser);
//     analyser.connect(scriptProcessor);
//     scriptProcessor.connect(audioContext.destination);

//     let speaking = false;
//     let silenceStart = null;

//     scriptProcessor.onaudioprocess = () => {
//       const array = new Uint8Array(analyser.frequencyBinCount);
//       analyser.getByteFrequencyData(array);
//       const volume = array.reduce((a, b) => a + b) / array.length / 255;
//       if (volume > SILENCE_THRESHOLD) {
//         speaking = true;
//         silenceStart = null;
//       } else if (speaking) {
//         if (!silenceStart) silenceStart = Date.now();
//         else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
//           scriptProcessor.disconnect();
//           microphone.disconnect();
//           audioContext.close();
//           // endCall(); // Auto-stop on silence
//         }
//       }
//     };
//     vadProcessor.current = { audioContext, analyser, scriptProcessor, microphone };
//   };

//   const startCall = async () => {
//     setStatus("Requesting mic permission...");
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       streamRef.current = stream;
//       startVAD(stream);

//       ws.current = new WebSocket(
//         `ws://127.0.0.1:8000/ws/voice/${Math.random().toString(36).slice(2, 9)}`
//       );
//       ws.current.binaryType = "arraybuffer";

//       ws.current.onopen = () => {
//         setStatus("Call connected");
//         setConnected(true);
//         startStreaming(stream);
//       };

//       ws.current.onmessage = async (event) => {
//         if (typeof event.data === "string") {
//           const msg = JSON.parse(event.data);
//           if (msg.type === "transcript") {
//             if (msg.is_final) {
//               setFinalSubtitle((f) => (f ? f + " " : "") + msg.text);
//               setPartialSubtitle("");
//               setLlmReply("");
//               setWaitingForAI(true);
//             } else {
//               setPartialSubtitle(msg.text);
//             }
//           } else if (msg.type === "llm_token") {
//             setWaitingForAI(false);
//             setLlmReply((prev) => prev + msg.text);
//           }
//         } else {
//           audioChunks.current.push(event.data);
//           if (audioChunks.current.length > 5 && audioRef.current) {
//             const blob = new Blob(audioChunks.current, { type: "audio/mpeg" });
//             audioRef.current.src = URL.createObjectURL(blob);
//             await audioRef.current
//               .play()
//               .catch(() => console.warn("Auto-play prevented by browser."));
//             audioChunks.current = [];
//           }
//         }
//       };

//       ws.current.onclose = () => {
//         setConnected(false);
//         setStatus("Call ended");
//       };
//       ws.current.onerror = () => {
//         setStatus("WebSocket error");
//       };
//     } catch {
//       setStatus("Microphone access denied");
//     }
//   };

//   const startStreaming = (stream) => {
//     mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
//     mediaRecorder.current.ondataavailable = (event) => {
//       if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
//         event.data.arrayBuffer().then((buffer) => ws.current.send(buffer));
//       }
//     };
//     mediaRecorder.current.start(500);
//   };

//   const endCall = () => {
//     cleanupMedia();
//     setPartialSubtitle("");
//     setFinalSubtitle("");
//     setLlmReply("");
//     setStatus("Ready to start");
//     setConnected(false);
//     setWaitingForAI(false);
//   };

//   return (
//     <div className="container">
//       <h1 className="title">AI Assistant Demo</h1>
//       <h2 className="subtitle">
//         Experience our AI-powered virtual assistant with natural conversation flow
//         <br />
//         and intelligent task handling
//       </h2>

//       <div className="status-box">
//         <div className="status-main">
//           Status:{" "}
//           <span
//             className={
//               status.includes("connected")
//                 ? "status-green"
//                 : status.includes("ended")
//                 ? "status-red"
//                 : ""
//             }
//           >
//             {status}
//           </span>
//         </div>
//         <div className="mic-row">{connected && <span className="mic-icon">🎤</span>}</div>
//         <div className="transcript-display">
//           {finalSubtitle} <span className="partial">{partialSubtitle}</span>
//         </div>
//         {waitingForAI && <div className="ai-waiting">AI is formulating a reply...</div>}
//         <div className="llm-reply-display">
//           {llmReply && (
//             <>
//               <hr />
//               <strong>AI:</strong> {llmReply}
//             </>
//           )}
//         </div>

//         <audio ref={audioRef} autoPlay muted={false} />
//       </div>

//       <div className="button-bar">
//         <button
//           className="call-btn gradient"
//           onClick={startCall}
//           disabled={connected || status === "Requesting mic permission..."}
//         >
//           📞 Start Call
//         </button>
//         <button className="end-btn" onClick={endCall} disabled={!connected}>
//           📶 End Call
//         </button>
//       </div>
//     </div>
//   );
// };

// export default HomePage;


// CODE - 3
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
