import asyncio
import subprocess


async def ffmpeg_convert(input_queue: asyncio.Queue, output_queue: asyncio.Queue, ffmpeg_path: str = "/opt/homebrew/bin/ffmpeg"):
    ffmpeg_cmd = [
        ffmpeg_path,
        "-f", "webm",
        "-i", "pipe:0",
        "-f", "s16le",
        "-ar", "16000",
        "-ac", "1",
        "pipe:1",
    ]

    process = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
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
            except Exception:
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
