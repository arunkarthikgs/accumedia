import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export async function extractAudioFromVideo(video: Buffer, fileName: string) {
  if (!ffmpegPath) throw new Error("Video processing is unavailable because ffmpeg is not bundled.");

  return new Promise<{ buffer: Buffer; fileName: string; mimeType: string; durationSeconds: number }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const process = spawn(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      "pipe:1",
    ]);
    let stderr = "";

    process.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunks.reduce((total, item) => total + item.length, 0) > MAX_AUDIO_BYTES) {
        process.kill("SIGTERM");
        reject(new Error("Extracted audio exceeds the 100 MB processing limit."));
      }
    });
    process.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on("error", (error) => reject(error));
    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Video audio extraction failed${stderr ? `: ${stderr.trim()}` : "."}`));
        return;
      }
      const audioBuffer = Buffer.concat(chunks);
      resolve({
        buffer: audioBuffer,
        fileName: `${fileName.replace(/\.[^.]+$/, "") || "video"}.mp3`,
        mimeType: "audio/mpeg",
        durationSeconds: Math.ceil((audioBuffer.length * 8) / 128000),
      });
    });

    process.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    process.stdin.end(video);
  });
}