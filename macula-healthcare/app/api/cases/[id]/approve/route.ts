import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    const existingCase = await db.case.findUnique({
      where: { id },
      include: { organization: true, assets: true },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const updatedCase = await db.case.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    if (existingCase.assets.length === 0) {
      const activeChannels = await db.channelDefinition.findMany({
        where: {
          isActive: true,
          OR: [{ organizationId: existingCase.organizationId }, { organizationId: null }],
        },
      });

      const master = existingCase.masterRecord as Record<string, any>;

      const defaultAssets = (activeChannels.length > 0
        ? activeChannels
        : [
            { channelKey: "LINKEDIN_PEER_CME", displayName: "Peer LinkedIn Post" },
            { channelKey: "PATIENT_EDUCATION_NOTICE", displayName: "Patient Advisory" },
          ]
      ).map((channel) => ({
        caseId: id,
        channelKey: channel.channelKey,
        channelName: channel.displayName,
        content: {
          title: existingCase.title,
          summary: master?.presentation || "Clinical review",
          disclaimer: existingCase.organization?.defaultDisclaimer || "",
        } as Prisma.InputJsonValue,
      }));

      await db.generatedAsset.createMany({
        data: defaultAssets,
      });
    }

    return NextResponse.json({ success: true, case: updatedCase });
  } catch (error: any) {
    console.error("Error approving case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
