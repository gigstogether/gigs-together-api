export interface V1AdminDashboardSummary {
  readonly gigsCount: number;
  readonly visibleGigsCount: number;
}

export interface V1AdminDashboardResponseBody {
  readonly summary: V1AdminDashboardSummary;
}
