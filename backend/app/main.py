
import os
import subprocess
import asyncio
import json
from .gemini_client import stream_gemini_response
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from deepgram import AsyncDeepgramClient
from deepgram.core.events import EventType
from deepgram.extensions.types.sockets import ListenV2SocketClientResponse

load_dotenv()
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def ffmpeg_convert(input_queue: asyncio.Queue, output_queue: asyncio.Queue):
    ffmpeg_cmd = [
        "/opt/homebrew/bin/ffmpeg",
        "-f", "webm",
        "-i", "pipe:0",
        "-f", "s16le",
        "-ar", "16000",
        "-ac", "1",
        "-probesize", "32",
        "-flags", "low_delay",
        "-loglevel", "quiet",
        "pipe:1",
    ]

    process = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    async def feed_ffmpeg():
        while True:
            chunk = await input_queue.get()
            if chunk is None:
                if process.stdin:
                    process.stdin.close()
                break
            try:
                process.stdin.write(chunk)
                await process.stdin.drain()
            except Exception as e:
                print(f"Error writing to ffmpeg stdin: {e}")
                break

    async def read_ffmpeg():
        while True:
            pcm_chunk = await process.stdout.read(1024)
            if not pcm_chunk:
                break
            await output_queue.put(pcm_chunk)
        await output_queue.put(None)

    await asyncio.gather(feed_ffmpeg(), read_ffmpeg())
    await process.wait()


@app.websocket("/ws/voice/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    input_queue = asyncio.Queue()
    output_queue = asyncio.Queue()
    deepgram_client = AsyncDeepgramClient(api_key=DEEPGRAM_API_KEY)
    websocket_is_closed = False

    async with deepgram_client.listen.v2.connect(
        model="flux-general-en", encoding="linear16", sample_rate=16000,
    ) as dg_connection:
        conversation = []
        last_transcript = ""
        last_message_time = asyncio.get_event_loop().time()
        transcript_sent_as_final = False

        async def on_message(message: ListenV2SocketClientResponse):
            nonlocal last_message_time, last_transcript, transcript_sent_as_final
            if hasattr(message, "transcript") and message.transcript:
                is_final = getattr(message, "is_final", False)
                try:
                    if websocket.client_state.value == 1:
                        await websocket.send_text(json.dumps({
                            "type": "transcript",
                            "text": message.transcript,
                            "is_final": is_final
                        }))
                except Exception as e:
                    print(f"Error sending transcript: {e}")

                last_transcript = message.transcript
                last_message_time = asyncio.get_event_loop().time()
                transcript_sent_as_final = False

                if is_final and message.transcript.strip():
                    conversation.append({"role": "user", "content": message.transcript})
                    if websocket.client_state.value == 1:
                        await stream_gemini_response(conversation, websocket)
                    transcript_sent_as_final = True

        async def forced_final_checker():
            nonlocal last_transcript, last_message_time, transcript_sent_as_final
            while not websocket_is_closed:
                await asyncio.sleep(1.0)
                now = asyncio.get_event_loop().time()
                if last_transcript and (now - last_message_time > 0.8) and not transcript_sent_as_final:
                    conversation.append({"role": "user", "content": last_transcript})
                    if websocket.client_state.value == 1:
                        await stream_gemini_response(conversation, websocket)
                    transcript_sent_as_final = True

        dg_connection.on(EventType.MESSAGE, lambda msg: asyncio.create_task(on_message(msg)))
        dg_connection.on(EventType.OPEN, lambda _: print("Deepgram connection opened"))
        dg_connection.on(EventType.CLOSE, lambda _: print("Deepgram connection closed"))
        dg_connection.on(EventType.ERROR, lambda e: print(f"Deepgram error: {e}"))

        ffmpeg_task = asyncio.create_task(ffmpeg_convert(input_queue, output_queue))
        checker_task = asyncio.create_task(forced_final_checker())

        async def receive_audio():
            try:
                while True:
                    chunk = await websocket.receive_bytes()
                    await input_queue.put(chunk)
            except WebSocketDisconnect:
                print("WebSocket disconnected by client")

        async def send_to_deepgram():
            try:
                while True:
                    pcm_chunk = await output_queue.get()
                    if pcm_chunk is None:
                        try:
                            await dg_connection._connection.close()
                        except Exception:
                            pass
                        break
                    await dg_connection._send(pcm_chunk)
            except Exception as e:
                print(f"Error sending to Deepgram: {e}")

        receive_task = asyncio.create_task(receive_audio())
        send_task = asyncio.create_task(send_to_deepgram())
        listen_task = asyncio.create_task(dg_connection.start_listening())

        done, pending = await asyncio.wait(
            [receive_task, send_task, listen_task, ffmpeg_task, checker_task],
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        websocket_is_closed = True
        if websocket.client_state.value == 1:
            await websocket.close()
