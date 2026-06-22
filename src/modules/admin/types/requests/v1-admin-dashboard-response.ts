export interface V1AdminDashboardSummary {
  readonly pendingGigsCount: number;
  readonly publishedGigsCount: number;
}

export interface V1AdminDashboardResponseBody {
  readonly summary: V1AdminDashboardSummary;
}
