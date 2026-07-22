import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { config } from "@/lib/config";

export async function GET() {
  try {
    await requireAuth();
    return jsonOk({
      dryThresholdsDays: config.dryThresholdsDays,
      cleanThresholdsDays: config.cleanThresholdsDays,
      maxUploadBytes: config.maxUploadBytes,
      authEnabled: config.authEnabled,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
