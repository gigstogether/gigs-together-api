export const TELEGRAM_TEMPLATE_KEYS = {
  mainGigWithLink: 'mainGig.withLink',
  mainGigWithoutLink: 'mainGig.withoutLink',
  moderationGig: 'moderationGig',
  moderationLinkSeePost: 'moderation.link.seePost',
  moderationLinkOpenAdmin: 'moderation.link.openAdmin',
  gigModerationTitleWithLink: 'gigModeration.title.withLink',
  gigModerationTitleWithoutLink: 'gigModeration.title.withoutLink',
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
  buttonReject: 'button.reject',
  buttonPost: 'button.post',
  buttonSendToModeration: 'button.sendToModeration',
  gigCandidate: 'gigCandidate',
  gigCandidateStatusNew: 'gigCandidateStatus.new',
  gigCandidateStatusReviewing: 'gigCandidateStatus.reviewing',
  gigCandidateStatusApproved: 'gigCandidateStatus.approved',
  gigCandidateStatusRejected: 'gigCandidateStatus.rejected',
  gigCandidateFeedbackSubmitted: 'gigCandidateFeedback.submitted',
  gigCandidateFeedbackAcceptedForModeration:
    'gigCandidateFeedback.acceptedForModeration',
  gigCandidateFeedbackRejected: 'gigCandidateFeedback.rejected',
  gigCandidateFeedbackAcceptedWithPublicLink:
    'gigCandidateFeedback.acceptedWithPublicLink',
} as const;

export type TelegramTemplateKey =
  (typeof TELEGRAM_TEMPLATE_KEYS)[keyof typeof TELEGRAM_TEMPLATE_KEYS];
