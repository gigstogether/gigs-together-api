export const TELEGRAM_TEMPLATE_KEYS = {
  mainGigWithLink: 'mainGig.withLink',
  mainGigWithoutLink: 'mainGig.withoutLink',
  moderationGig: 'moderationGig',
  moderationLinkSeePost: 'moderation.link.seePost',
  moderationLinkOpenAdmin: 'moderation.link.openAdmin',
  publishedModerationTitleWithLink: 'publishedModeration.title.withLink',
  publishedModerationTitleWithoutLink: 'publishedModeration.title.withoutLink',
  weeklyDigestEmpty: 'weeklyDigest.empty',
  weeklyDigestHeader: 'weeklyDigest.header',
  weeklyDigestFooter: 'weeklyDigest.footer',
  weeklyDigestTicketsLabel: 'weeklyDigest.ticketsLabel',
  weeklyDigestTicketsLink: 'weeklyDigest.ticketsLink',
  weeklyDigestGigLineHtml: 'weeklyDigest.gigLine.html',
  weeklyDigestGigLinePlain: 'weeklyDigest.gigLine.plain',
  statusAccepted: 'status.accepted',
  buttonApprove: 'button.approve',
  buttonAccept: 'button.accept',
  buttonEdit: 'button.edit',
  buttonHide: 'button.hide',
  buttonReject: 'button.reject',
  buttonPost: 'button.post',
  buttonShow: 'button.show',
  buttonSendToModeration: 'button.sendToModeration',
  gigCandidateFeedbackSubmitted: 'gigCandidateFeedback.submitted',
  gigCandidateFeedbackAcceptedForModeration:
    'gigCandidateFeedback.acceptedForModeration',
  gigCandidateFeedbackRejected: 'gigCandidateFeedback.rejected',
  gigCandidateFeedbackAcceptedWithPublicLink:
    'gigCandidateFeedback.acceptedWithPublicLink',
  gigCandidateLinkOpenAdmin: 'gigCandidateLink.openAdmin',
  gigCandidateLinkSeeModerationPost: 'gigCandidateLink.seeModerationPost',
} as const;

export type TelegramTemplateKey =
  (typeof TELEGRAM_TEMPLATE_KEYS)[keyof typeof TELEGRAM_TEMPLATE_KEYS];
