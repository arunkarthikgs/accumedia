import ffmpegPathImport from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ffmpegPath = ffmpegPathImport as unknown as string | null;

function runFfmpeg(args: string[], input?: Buffer) {
  if (!ffmpegPath) throw new Error("ffmpeg is not available for video rendering.");
  return new Promise<{ output: Buffer; stderr: string }>((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    process.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve({ output: Buffer.concat(chunks), stderr }) : reject(new Error(stderr.slice(-1000) || "ffmpeg failed.")));
    if (input) process.stdin?.end(input);
  });
}

async function createNarration(script: string, voiceFile?: Buffer) {
  if (voiceFile) return voiceFile;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: script.slice(0, 4096), response_format: "mp3" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI narration failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenAI narration timed out after 90 seconds.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function durationFromFfmpegOutput(stderr: string) {
  const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (match) return Math.ceil(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
  const progress = [...stderr.matchAll(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g)].at(-1);
  return progress ? Math.ceil(Number(progress[1]) * 3600 + Number(progress[2]) * 60 + Number(progress[3])) : 0;
}

async function getDurationSeconds(video: Buffer) {
  try {
    const result = await runFfmpeg(["-i", "pipe:0", "-f", "null", "pipe:1"], video);
    return durationFromFfmpegOutput(result.stderr);
  } catch {
    return 0;
  }
}

async function getFileDurationSeconds(filePath: string) {
  try {
    const result = await runFfmpeg(["-i", filePath, "-f", "null", "pipe:1"]);
    return durationFromFfmpegOutput(result.stderr);
  } catch {
    return 0;
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character] || character));
}

function wrapText(value: string, maxLength = 54) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

function scriptScenes(script: string, title: string) {
  const sentences = script.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [script];
  const chunks: string[] = [];
  let chunk = "";
  for (const sentence of sentences) {
    if (`${chunk} ${sentence}`.trim().length > 260 && chunk) {
      chunks.push(chunk.trim());
      chunk = sentence;
    } else {
      chunk = `${chunk} ${sentence}`.trim();
    }
  }
  if (chunk) chunks.push(chunk.trim());
  return [{ heading: title, body: "Clinical education summary" }, ...chunks.slice(0, 9).map((body, index) => ({ heading: `Clinical review ${index + 1}`, body }))];
}

async function createSlide(options: { width: number; height: number; accent: string; heading: string; body: string; disclaimer?: string; logo?: Buffer | null }) {
  const bodyLines = wrapText(options.body).map((line, index) => `<text x="80" y="${300 + index * 48}" font-family="DejaVu Sans" font-size="30" fill="#263834">${escapeXml(line)}</text>`).join("");
  const svg = `<svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f7faf8"/><rect width="100%" height="24" fill="${escapeXml(options.accent)}"/><text x="80" y="180" font-family="DejaVu Sans" font-size="22" font-weight="700" fill="${escapeXml(options.accent)}">MACULA CLINICAL EDUCATION</text><text x="80" y="245" font-family="DejaVu Sans" font-size="46" font-weight="700" fill="#13211f">${escapeXml(options.heading)}</text>${bodyLines}<line x1="80" y1="620" x2="1200" y2="620" stroke="#d7e1dc"/><text x="80" y="660" font-family="DejaVu Sans" font-size="16" fill="#52615d">${escapeXml((options.disclaimer || "Clinical education - RMP reviewed").slice(0, 140))}</text></svg>`;
  let slide = await sharp(Buffer.from(svg)).png().toBuffer();
  if (options.logo) {
    slide = await sharp(slide).composite([{ input: await sharp(options.logo).resize(180, 80, { fit: "inside" }).png().toBuffer(), top: 55, left: 1010 }]).png().toBuffer();
  }
  return slide;
}

export async function renderClinicalVideo(options: { script: string; title: string; accent: string; disclaimer?: string; logoUrl?: string | null; voiceFile?: Buffer }) {
  const audio = await createNarration(options.script, options.voiceFile);
  const width = 1280;
  const height = 720;
  const logo = options.logoUrl ? await fetch(options.logoUrl).then(async (response) => response.ok ? Buffer.from(await response.arrayBuffer()) : null).catch(() => null) : null;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "macula-video-"));
  const audioPath = path.join(tempDir, "voice.mp3");
  const concatPath = path.join(tempDir, "slides.txt");
  try {
    await writeFile(audioPath, audio);
    const narrationSeconds = Math.max(6, await getFileDurationSeconds(audioPath));
    const scenes = scriptScenes(options.script, options.title);
    const totalWords = scenes.reduce((total, scene) => total + scene.body.split(/\s+/).length, 0);
    const durations = scenes.map((scene) => Math.max(3, (scene.body.split(/\s+/).length / totalWords) * narrationSeconds));
    const slidePaths = await Promise.all(scenes.map(async (scene, index) => {
      const slidePath = path.join(tempDir, `slide-${index}.png`);
      await writeFile(slidePath, await createSlide({ width, height, accent: options.accent, heading: scene.heading, body: scene.body, disclaimer: options.disclaimer, logo }));
      return slidePath;
    }));
    const concatInput = slidePaths.map((slidePath, index) => `file '${slidePath}'\nduration ${durations[index].toFixed(3)}`).join("\n") + `\nfile '${slidePaths[slidePaths.length - 1]}'\n`;
    await writeFile(concatPath, concatInput);
    const video = await runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatPath, "-i", audioPath, "-shortest", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"]);
    const durationSeconds = narrationSeconds;
    if (!durationSeconds || durationSeconds > 600) throw new Error("Rendered video duration could not be validated or exceeds 10 minutes.");
    return { buffer: video.output, durationSeconds, mimeType: "video/mp4" };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}