import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCaseQuota } from "@/lib/quotas";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";

// GET /api/cases - List cases with optional filtering
export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const physicianId = searchParams.get("physicianId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: any = {};
    const requestedOrgId = orgId && orgId !== "ALL" ? orgId : null;
    const scopedOrgId = user?.isSuperAdmin ? requestedOrgId : user?.organizationId;
    if (!scopedOrgId) {
      return NextResponse.json({ error: "An organization scope is required." }, { status: 400 });
    }
    await requireOrganizationAccess(scopedOrgId);
    where.organizationId = scopedOrgId;
    if (physicianId) where.physicianId = physicianId;
    if (status && status !== "ALL") where.status = status;

    const [cases, totalCount] = await Promise.all([
      db.case.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          physician: {
            select: {
              id: true,
              name: true,
              email: true,
              registrationNo: true,
              specialty: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          recordings: {
            select: {
              id: true,
              r2Key: true,
              fileName: true,
              durationSeconds: true,
              transcriptionStatus: true,
              transcriptionAgent: true,
              recordedAt: true,
            },
          },
          assets: {
            select: {
              id: true,
              channelKey: true,
              channelName: true,
            },
          },
        },
      }),
      db.case.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      totalCount,
      count: cases.length,
      cases,
    });
  } catch (error: any) {
    console.error("Fetch cases error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve clinical cases." },
      { status: 500 }
    );
  }
}

// POST /api/cases - Manual case creation (direct text entry or external integration)
export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { title, rawInput, organizationId, physicianId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 }
      );
    }

    if (!user?.isSuperAdmin && user?.organizationId !== organizationId) {
      return NextResponse.json({ error: "Forbidden: organization access denied." }, { status: 403 });
    }
    await assertCaseQuota(organizationId);
    await requireOrganizationAccess(organizationId);

    let targetPhysicianId = physicianId;
    const physician = targetPhysicianId
      ? await db.user.findFirst({ where: { id: targetPhysicianId, organizationId }, select: { id: true } })
      : null;
    if (!physician) {
      const defaultPhysician = await db.user.findFirst({
        where: { organizationId },
      });
      targetPhysicianId = defaultPhysician?.id || null;
    }

    if (!targetPhysicianId) {
      return NextResponse.json(
        { error: "A valid physician ID is required to link with this case." },
        { status: 400 }
      );
    }

    const defaultTitle =
      title?.trim() ||
      `Clinical Encounter - ${new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`;

    const newCase = await db.case.create({
      data: {
        title: defaultTitle,
        rawInput: rawInput?.trim() || "",
        status: "PENDING_REVIEW",
        organizationId,
        physicianId: targetPhysicianId,
        masterRecord: {},
        safetyAudit: {
          auditLoggedAt: new Date().toISOString(),
          source: "MANUAL_ENTRY",
          status: "AWAITING_SYNTHESIS",
        },
      },
      include: {
        physician: true,
        organization: true,
      },
    });

    return NextResponse.json({
      success: true,
      case: newCase,
    });
  } catch (error: any) {
    console.error("Create case error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create clinical case." },
      { status: 500 }
    );
  }
}
