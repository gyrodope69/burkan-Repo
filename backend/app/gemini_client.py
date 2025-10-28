from google import genai
from dotenv import load_dotenv
import os
import json
import re
from .tts_client import stream_elevenlabs_ws
from .tts_sync_client import text_to_speech_stream

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

def sanitize_for_tts(text: str) -> str:
    # Remove markdown bold/italic asterisks and other formatting
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)  # Remove bold **text**
    text = re.sub(r"\*(.*?)\*", r"\1", text)      # Remove italic *text*
    # Add other markdown cleanup rules if needed
    return text

async def safe_ws_send(websocket, message, send_bytes=False):
    """Utility to safely send data via websocket, text or bytes."""
    try:
        if websocket.client_state.value == 1 and message is not None:
            if send_bytes:
                await websocket.send_bytes(message)
            else:
                await websocket.send_text(message if isinstance(message, str) else json.dumps(message))
    except Exception as e:
        print(f"WebSocket send error: {e}")

async def stream_gemini_response(context, websocket):
    """
    Fire Safety Voice Assistant with short conversational replies.
    On first call, greets user. Keeps context memory.
    Strips markdown formatting before TTS.
    """

    # System prompt defining persona & restrictions
    system_prompt = (
        "You are a fire safety voice assistant named Blaze. "
        "Keep answers concise and conversational, max 2-3 sentences. "
        "Answer only fire safety questions politely. "
        "Redirect unrelated queries respectfully."
    )

    # Send warm greeting once if context is empty
    if not context:
        greeting = "Hello, I’m your fire safety voice assistant. How can I help you today?"
        context.append({"role": "assistant", "content": greeting})
        await safe_ws_send(websocket, {"type": "llm_token", "text": greeting})
        try:
            audio_stream = text_to_speech_stream(greeting)
            await safe_ws_send(websocket, audio_stream.read(), send_bytes=True)
        except Exception as e:
            print(f"[TTS Greeting Error] {e}")
        return

    # Build full prompt including system instruction and conversation history
    prompt = f"system: {system_prompt}\n"
    prompt += "\n".join([f"{msg['role']}: {msg['content']}" for msg in context if msg.get('content')])

    print(f"[Gemini] Prompt:\n{prompt}")

    if not prompt.strip():
        print("[Gemini] Empty prompt, aborting")
        return

    try:
        response = client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=[prompt],
        )

        reply_text = ""
        for chunk in response:
            token = getattr(chunk, "text", None)
            if token and token.strip():
                await safe_ws_send(websocket, {"type": "llm_token", "text": token})
                reply_text += token

        if reply_text.strip():
            plain_text = sanitize_for_tts(reply_text.strip())
            try:
                await stream_elevenlabs_ws(plain_text, websocket)
            except Exception as e:
                print(f"[Realtime TTS failed] {e}. Trying sync fallback.")
                try:
                    audio_stream = text_to_speech_stream(plain_text)
                    await safe_ws_send(websocket, audio_stream.read(), send_bytes=True)
                except Exception as err:
                    print(f"[Sync TTS failed] {err}")

            context.append({"role": "assistant", "content": reply_text})
            print(f"[Gemini] Final reply: {reply_text}")

    except Exception as e:
        error_msg = f"[Gemini ERROR]: {e}"
        print(error_msg)
        await safe_ws_send(websocket, {"type": "llm_token", "text": error_msg})
