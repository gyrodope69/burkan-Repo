import os
from typing import IO
from io import BytesIO
from dotenv import load_dotenv
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVEN_LABS_API")
elevenlabs = ElevenLabs(api_key=ELEVENLABS_API_KEY)

def text_to_speech_stream(text: str) -> IO[bytes]:
    response = elevenlabs.text_to_speech.stream(
        voice_id="4LIpEnnggPcuL2KuRQIO", 
        output_format="mp3_22050_32",
        text=text,
        model_id="eleven_turbo_v2",
        voice_settings=VoiceSettings(
            stability=0.0,
            similarity_boost=1.0,
            style=0.0,
            use_speaker_boost=True,
            speed=1.0,
        ),
    )

    audio_stream = BytesIO()
    for chunk in response:
        if chunk:
            audio_stream.write(chunk)

    audio_stream.seek(0)
    return audio_stream
