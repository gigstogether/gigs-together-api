export const TELEGRAM_TEMPLATE_KEYS = {
  mainGigWithLink: 'mainGig.withLink',
  mainGigWithoutLink: 'mainGig.withoutLink',
  moderationGig: 'moderationGig',
  moderationStatusLineWithLinks: 'moderation.statusLine.withLinks',
  moderationLinkSeePost: 'moderation.link.seePost',
  moderationLinkOpenAdmin: 'moderation.link.openAdmin',
  publishedModerationTitleWithLink: 'publishedModeration.title.withLink',
  publishedModerationTitleWithoutLink: 'publishedModeration.title.withoutLink',
  submissionFeedback: 'submissionFeedback',
  weeklyDigestEmpty: 'weeklyDigest.empty',
  weeklyDigestHeader: 'weeklyDigest.header',
  weeklyDigestFooter: 'weeklyDigest.footer',
  weeklyDigestTicketsLabel: 'weeklyDigest.ticketsLabel',
  weeklyDigestTicketsLink: 'weeklyDigest.ticketsLink',
  weeklyDigestGigLineHtml: 'weeklyDigest.gigLine.html',
  weeklyDigestGigLinePlain: 'weeklyDigest.gigLine.plain',
  statusPending: 'status.pending',
  statusPublished: 'status.published',
  statusRejected: 'status.rejected',
  buttonApprove: 'button.approve',
  buttonEdit: 'button.edit',
  buttonReject: 'button.reject',
  buttonPost: 'button.post',
} as const;

export type TelegramTemplateKey =
  (typeof TELEGRAM_TEMPLATE_KEYS)[keyof typeof TELEGRAM_TEMPLATE_KEYS];
