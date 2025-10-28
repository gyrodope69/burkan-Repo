# CODE - 1
# import asyncio
# import websockets
# import base64
# import json
# import os

# ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
# VOICE_ID = "4LIpEnnggPcuL2KuRQIO"  # Replace with your voice ID

# async def stream_elevenlabs_ws(text, websocket):
#     url = f"wss://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream-input"
#     async with websockets.connect(url) as tts_ws:
#         await tts_ws.send(json.dumps({
#             "xi_api_key": 'sk_f89c9b51acb247455e14481f584037fdcb8676db2f2a2454',
#             "voice_settings": {
#                 "speed": 1,
#                 "stability": 0.5,
#                 "similarity_boost": 0.8
#             }
#         }))
#         await tts_ws.send(json.dumps({
#             "text": text,
#             "try_trigger_generation": True
#         }))
#         await tts_ws.send(json.dumps({"text": ""}))

#         async for message in tts_ws:
#             data = json.loads(message)
#             if "audio" in data:
#                 audio_bytes = base64.b64decode(data["audio"])
#                 if websocket.client_state.value == 1:
#                     await websocket.send_bytes(audio_bytes)
#                 else:
#                     break
#             if data.get("isFinal"):
#                 print("[TTS] synthesis complete")
#                 break


# CODE - 2
import asyncio
import websockets
import base64
import json
import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = "4LIpEnnggPcuL2KuRQIO"

async def safe_ws_send(websocket, message, send_bytes=False):
    try:
        if websocket.client_state.value == 1 and message is not None:
            if send_bytes:
                await websocket.send_bytes(message)
            else:
                await websocket.send_text(message if isinstance(message, str) else json.dumps(message))
    except Exception as e:
        print(f"WebSocket send error: {e}")

async def stream_elevenlabs_ws(text, websocket):
    url = f"wss://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream-input"
    async with websockets.connect(url) as tts_ws:
        await tts_ws.send(json.dumps({
            "xi_api_key": ELEVENLABS_API_KEY,
            "voice_settings": {"speed": 1, "stability": 0.5, "similarity_boost": 0.8},
        }))
        await tts_ws.send(json.dumps({"text": text, "try_trigger_generation": True}))
        await tts_ws.send(json.dumps({"text": ""}))

        async for message in tts_ws:
            data = json.loads(message)
            if "audio" in data:
                audio_bytes = base64.b64decode(data["audio"])
                if audio_bytes:
                    await safe_ws_send(websocket, audio_bytes, send_bytes=True)
            if data.get("isFinal"):
                print("[TTS] Synthesis complete")
                break
