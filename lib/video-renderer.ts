import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function runFfmpeg(args: string[], input?: Buffer) {
  if (!ffmpegPath) throw new Error("ffmpeg is not available for video rendering.");
  return new Promise<{ output: Buffer; stderr: string }>((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    process.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve({ output: Buffer.concat(chunks), stderr }) : reject(new Error(stderr.slice(-1000) || "ffmpeg failed.")));
    if (input) process.stdin.end(input);
  });
}

async function createNarration(script: string, voiceFile?: Buffer) {
  if (voiceFile) return voiceFile;
  const response = await openai.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: script.slice(0, 4096), response_format: "mp3" });
  return Buffer.from(await response.arrayBuffer());
}

async function getDurationSeconds(video: Buffer) {
  try {
    const result = await runFfmpeg(["-i", "pipe:0", "-f", "null", "pipe:1"], video);
    const match = result.stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    return match ? Math.ceil(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) : 0;
  } catch {
    return 0;
  }
}

export async function renderClinicalVideo(options: { script: string; title: string; accent: string; disclaimer?: string; logoUrl?: string | null; voiceFile?: Buffer }) {
  const audio = await createNarration(options.script, options.voiceFile);
  const width = 1280;
  const height = 720;
  const logo = options.logoUrl ? await fetch(options.logoUrl).then(async (response) => response.ok ? Buffer.from(await response.arrayBuffer()) : null).catch(() => null) : null;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f7faf8"/><rect width="100%" height="24" fill="${options.accent}"/><text x="70" y="260" font-family="Arial" font-size="48" font-weight="700" fill="#13211f">${options.title.replace(/[<&>]/g, "")}</text><text x="70" y="330" font-family="Arial" font-size="26" fill="#52615d">Clinical education • RMP reviewed</text><text x="70" y="650" font-family="Arial" font-size="18" fill="#52615d">${(options.disclaimer || "").slice(0, 150).replace(/[<&>]/g, "")}</text></svg>`;
  let slide = await sharp(Buffer.from(svg)).png().toBuffer();
  if (logo) {
    slide = await sharp(slide).composite([{ input: await sharp(logo).resize(180, 100, { fit: "inside" }).png().toBuffer(), top: 45, left: 70 }]).png().toBuffer();
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "macula-video-"));
  const slidePath = path.join(tempDir, "slide.png");
  const audioPath = path.join(tempDir, "voice.mp3");
  try {
    await writeFile(slidePath, slide);
    await writeFile(audioPath, audio);
    const video = await runFfmpeg(["-loop", "1", "-i", slidePath, "-i", audioPath, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"]);
    const durationSeconds = await getDurationSeconds(video.output);
    if (!durationSeconds || durationSeconds > 600) throw new Error("Rendered video duration could not be validated or exceeds 10 minutes.");
    return { buffer: video.output, durationSeconds, mimeType: "video/mp4" };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}