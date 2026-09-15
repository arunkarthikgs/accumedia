export async function POST(req: Request) {
  return Response.json(
    {
      error: "This legacy audio endpoint has been disabled. Use /api/audio/upload followed by /api/audio/transcribe.",
      replacement: "/api/audio/upload",
    },
    { status: 410 }
  );
}
